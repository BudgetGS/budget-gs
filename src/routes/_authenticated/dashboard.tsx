import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addMonths, brl, currentMonthKey, fmtPct, monthFirstDay, monthLabel, pct } from "@/lib/format";
import { AlertTriangle, ChevronLeft, ChevronRight, TrendingDown, TrendingUp, Wallet, Sparkles, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchSupervisores, type Supervisor } from "@/lib/supervisores";
import { useWidgetConfig } from "@/lib/widget-config";
import { gerarAnaliseIA } from "@/lib/ai.functions";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Row = {
  unidade_id: string;
  budget: number;
  gasto: number;
  unidades: { id: string; nome: string; supervisor_id: string | null; budget_base: number };
};

const DASHBOARD_WIDGETS = [
  { id: "stats", label: "Cards de totais" },
  { id: "estouradas", label: "Alerta de estouros" },
  { id: "chart", label: "Distribuição por unidade" },
  { id: "ai", label: "Análise IA" },
];

function Dashboard() {
  const { role } = useAuth();
  const isSup = role === "supervisor";
  const [mesKey, setMesKey] = useState<string>(currentMonthKey());
  const [rows, setRows] = useState<Row[]>([]);
  const [supervisores, setSupervisores] = useState<Supervisor[]>([]);
  const [filterSup, setFilterSup] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [considerarAcumulado, setConsiderarAcumulado] = useState(true);
  const { state: widgets } = useWidgetConfig("dashboard", DASHBOARD_WIDGETS);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("budgets_mensais")
        .select("unidade_id, budget, gasto, unidades!inner(id, nome, supervisor_id, budget_base)")
        .eq("mes", monthFirstDay(mesKey));
      setRows((data as any) ?? []);
      if (!isSup) {
        setSupervisores(await fetchSupervisores());
      }
      setLoading(false);
    })();
  }, [mesKey, isSup]);

  const gerarMeses = useMemo(() => {
    const arr: string[] = [];
    const now = new Date();
    for (let i = -18; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return arr.reverse();
  }, []);

  const filtered = useMemo(() => {
    if (filterSup === "all") return rows;
    return rows.filter((r) => r.unidades.supervisor_id === filterSup);
  }, [rows, filterSup]);

  const withEffectiveBudget = useMemo(
    () =>
      filtered.map((r) => ({
        ...r,
        budgetEff: considerarAcumulado ? Number(r.budget) : Number(r.unidades.budget_base),
      })),
    [filtered, considerarAcumulado],
  );

  const totals = useMemo(() => {
    const budget = withEffectiveBudget.reduce((s, r) => s + r.budgetEff, 0);
    const gasto = withEffectiveBudget.reduce((s, r) => s + Number(r.gasto), 0);
    return { budget, gasto, saldo: budget - gasto, pct: pct(gasto, budget) };
  }, [withEffectiveBudget]);

  const chartData = withEffectiveBudget.map((r) => ({
    nome: r.unidades.nome,
    gasto: Number(r.gasto),
    budget: r.budgetEff,
    pctVal: r.budgetEff > 0 ? Number(r.gasto) / r.budgetEff : 0,
  }));

  const estouradas = withEffectiveBudget.filter((r) => r.budgetEff > 0 && Number(r.gasto) > r.budgetEff);

  const isEnabled = (id: string) => widgets.find((w) => w.id === id)?.enabled ?? true;
  const orderedIds = widgets.filter((w) => w.enabled).map((w) => w.id);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:flex sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight capitalize">
            {monthLabel(monthFirstDay(mesKey))}
          </h1>
          <p className="text-sm text-muted-foreground">Visão geral do mês selecionado</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" className="rounded-xl" onClick={() => setMesKey(addMonths(mesKey, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={mesKey} onValueChange={setMesKey}>
            <SelectTrigger className="rounded-xl w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {gerarMeses.map((m) => (
                <SelectItem key={m} value={m} className="capitalize">{monthLabel(monthFirstDay(m))}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="rounded-xl" onClick={() => setMesKey(addMonths(mesKey, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isSup && (
            <Select value={filterSup} onValueChange={setFilterSup}>
              <SelectTrigger className="rounded-xl w-[200px]">
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos responsáveis</SelectItem>
                {supervisores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
            <Switch id="acumulado-dash" checked={considerarAcumulado} onCheckedChange={setConsiderarAcumulado} />
            <Label htmlFor="acumulado-dash" className="text-sm cursor-pointer whitespace-nowrap">Considerar acumulado</Label>
          </div>
        </div>
      </div>

      {orderedIds.map((id) => {
        if (id === "stats" && isEnabled("stats")) return (
          <div key="stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label={considerarAcumulado ? "Budget total (acum.)" : "Budget fixo"} value={brl(totals.budget)} icon={<Wallet className="h-5 w-5" />} tone="primary" />
            <StatCard label="Gasto total" value={brl(totals.gasto)} icon={<TrendingDown className="h-5 w-5" />} />
            <StatCard label="Saldo" value={brl(totals.saldo)} icon={<TrendingUp className="h-5 w-5" />} tone={totals.saldo >= 0 ? "positive" : "negative"} />
            <StatCard label="% Geral" value={fmtPct(totals.pct)} icon={<AlertTriangle className="h-5 w-5" />} />
          </div>
        );
        if (id === "estouradas" && estouradas.length > 0) return (
          <Card key="estouradas" className="border-destructive/40 bg-destructive/5 rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Unidades acima de 100%
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {estouradas.map((r) => (
                  <span key={r.unidade_id} className="rounded-full bg-destructive/15 text-destructive px-3 py-1 text-xs font-semibold">
                    {r.unidades.nome} — {fmtPct(Number(r.gasto) / r.budgetEff)}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        );
        if (id === "chart") return (
          <Card key="chart" className="rounded-2xl">
            <CardHeader><CardTitle>Distribuição por unidade</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-72 animate-pulse bg-muted rounded-xl" />
              ) : chartData.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <p>Nenhum registro de budget para este mês.</p>
                  <Link to="/budget/$mes" params={{ mes: mesKey }} className="text-primary font-semibold underline mt-2 inline-block">
                    Ir para {monthLabel(monthFirstDay(mesKey))}
                  </Link>
                </div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
                      <XAxis dataKey="nome" angle={-30} textAnchor="end" fontSize={11} interval={0} />
                      <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)" }} />
                      <Bar dataKey="budget" fill="var(--color-secondary)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="gasto" radius={[6, 6, 0, 0]}>
                        {chartData.map((d, i) => (
                          <Cell key={i} fill={d.pctVal >= 1 ? "var(--color-destructive)" : "var(--color-primary)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        );
        if (id === "ai") return (
          <AiCard
            key="ai"
            periodo={monthLabel(monthFirstDay(mesKey))}
            unidades={filtered.map((r) => ({
              nome: r.unidades.nome,
              budgetAcum: Number(r.budget),
              budgetFixo: Number(r.unidades.budget_base),
              gasto: Number(r.gasto),
            }))}
          />
        );
        return null;
      })}
    </div>
  );
}

function AiCard({
  periodo,
  unidades,
}: {
  periodo: string;
  unidades: { nome: string; budgetAcum: number; budgetFixo: number; gasto: number }[];
}) {
  const run = useServerFn(gerarAnaliseIA);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { variantes: Array<{ label: string; positivos: string; atencao: string; riscos: string }> } | null
  >(null);

  const gerar = async () => {
    if (unidades.length === 0) return toast.error("Sem dados no período selecionado");
    setBusy(true);
    try {
      const buildVar = (mode: "acum" | "fixo") => {
        const list = unidades.map((u) => ({
          nome: u.nome,
          budget: mode === "acum" ? u.budgetAcum : u.budgetFixo,
          gasto: u.gasto,
        }));
        const budget_total = list.reduce((s, u) => s + u.budget, 0);
        const gasto_total = list.reduce((s, u) => s + u.gasto, 0);
        return {
          label: mode === "acum" ? "com acumulado (rollover)" : "só budget fixo do mês",
          budget_total,
          gasto_total,
          saldo: budget_total - gasto_total,
          unidades: list,
        };
      };
      const res = await run({ data: { periodo, variantes: [buildVar("acum"), buildVar("fixo")] } });
      setResult(res);
    } catch (e: any) {
      toast.error("Falha ao gerar análise", { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Análise IA</CardTitle>
        <Button size="sm" className="rounded-xl" onClick={gerar} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando…</> : "Gerar análise"}
        </Button>
      </CardHeader>
      <CardContent>
        {!result && !busy && (
          <p className="text-sm text-muted-foreground">
            Clique em <b>Gerar análise</b> para receber duas leituras: uma considerando o budget acumulado
            (rollover) e outra apenas com o budget fixo do mês.
          </p>
        )}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Processando análise…
          </div>
        )}
        {result && (
          <Tabs defaultValue="0">
            <TabsList className="rounded-xl">
              {result.variantes.map((v, i) => (
                <TabsTrigger key={i} value={String(i)}>{v.label}</TabsTrigger>
              ))}
            </TabsList>
            {result.variantes.map((v, i) => (
              <TabsContent key={i} value={String(i)} className="mt-4 space-y-3">
                <AiBlock title="Pontos positivos" body={v.positivos} tone="positive" />
                <AiBlock title="Pontos de atenção" body={v.atencao} tone="warning" />
                <AiBlock title="Riscos" body={v.riscos} tone="danger" />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function AiBlock({ title, body, tone }: { title: string; body: string; tone: "positive" | "warning" | "danger" }) {
  const toneClass =
    tone === "positive" ? "border-secondary/60 bg-secondary/10"
    : tone === "warning" ? "border-amber-400/60 bg-amber-50 dark:bg-amber-950/20"
    : "border-destructive/40 bg-destructive/5";
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{body}</p>
    </div>
  );
}

function StatCard({
  label, value, icon, tone,
}: { label: string; value: string; icon: React.ReactNode; tone?: "primary" | "positive" | "negative" }) {
  const toneClass =
    tone === "primary" ? "bg-primary text-primary-foreground"
    : tone === "positive" ? "bg-secondary/40 text-secondary-foreground"
    : tone === "negative" ? "bg-destructive/10 text-destructive"
    : "bg-muted text-foreground";
  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${toneClass}`}>{icon}</span>
        </div>
        <p className="mt-3 text-xl md:text-2xl font-bold truncate">{value}</p>
      </CardContent>
    </Card>
  );
}
