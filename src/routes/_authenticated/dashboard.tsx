import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brl, currentMonthKey, fmtPct, monthFirstDay, monthLabel, pct } from "@/lib/format";
import { AlertTriangle, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  unidades: { id: string; nome: string; supervisor_id: string | null };
};

function Dashboard() {
  const { role, user } = useAuth();
  const isSup = role === "supervisor";
  const mesKey = currentMonthKey();
  const [rows, setRows] = useState<Row[]>([]);
  const [supervisores, setSupervisores] = useState<{ id: string; nome: string }[]>([]);
  const [filterSup, setFilterSup] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("budgets_mensais")
        .select("unidade_id, budget, gasto, unidades!inner(id, nome, supervisor_id)")
        .eq("mes", monthFirstDay(mesKey));
      setRows((data as any) ?? []);
      if (!isSup) {
        const { data: sups } = await supabase
      .select("id, nome, user_roles!inner(role)")
.in("user_roles.role", ["admin", "gerente", "supervisor"]);
          .eq("user_roles.role", "supervisor");
        setSupervisores((sups as any) ?? []);
      }
      setLoading(false);
    })();
  }, [mesKey, isSup]);

  const filtered = useMemo(() => {
    if (filterSup === "all") return rows;
    return rows.filter((r) => r.unidades.supervisor_id === filterSup);
  }, [rows, filterSup]);

  const totals = useMemo(() => {
    const budget = filtered.reduce((s, r) => s + Number(r.budget), 0);
    const gasto = filtered.reduce((s, r) => s + Number(r.gasto), 0);
    return { budget, gasto, saldo: budget - gasto, pct: pct(gasto, budget) };
  }, [filtered]);

  const chartData = filtered.map((r) => ({
    nome: r.unidades.nome,
    gasto: Number(r.gasto),
    budget: Number(r.budget),
    pctVal: r.budget > 0 ? Number(r.gasto) / Number(r.budget) : 0,
  }));

  const estouradas = filtered.filter((r) => r.budget > 0 && Number(r.gasto) > Number(r.budget));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight capitalize">
            {monthLabel(monthFirstDay(mesKey))}
          </h1>
          <p className="text-sm text-muted-foreground">Visão geral do mês corrente</p>
        </div>
        {!isSup && (
          <Select value={filterSup} onValueChange={setFilterSup}>
            <SelectTrigger className="rounded-xl w-[220px]">
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
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Budget total" value={brl(totals.budget)} icon={<Wallet className="h-5 w-5" />} tone="primary" />
        <StatCard label="Gasto total" value={brl(totals.gasto)} icon={<TrendingDown className="h-5 w-5" />} />
        <StatCard
          label="Saldo"
          value={brl(totals.saldo)}
          icon={<TrendingUp className="h-5 w-5" />}
          tone={totals.saldo >= 0 ? "positive" : "negative"}
        />
        <StatCard label="% Geral" value={fmtPct(totals.pct)} icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      {estouradas.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Unidades acima de 100%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {estouradas.map((r) => (
                <span key={r.unidade_id} className="rounded-full bg-destructive/15 text-destructive px-3 py-1 text-xs font-semibold">
                  {r.unidades.nome} — {fmtPct(Number(r.gasto) / Number(r.budget))}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Distribuição por unidade</CardTitle>
        </CardHeader>
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
                  <Tooltip
                    formatter={(v: number) => brl(v)}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)" }}
                  />
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
