import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { addMonths, brl, fmtPct, monthFirstDay, monthLabel, pct, saldoBadgeBg } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/_authenticated/budget/$mes")({
  component: BudgetMes,
});

type Budget = {
  id: string;
  unidade_id: string;
  mes: string;
  budget: number;
  gasto: number;
  unidades: { id: string; nome: string; supervisor_id: string | null };
};

function BudgetMes() {
  const { mes } = Route.useParams();
  const { role, user } = useAuth();
  const isSup = role === "supervisor";
  const canEditBudget = role === "admin" || role === "gerente";
  const navigate = useNavigate();

  const [rows, setRows] = useState<Budget[]>([]);
  const [supervisores, setSupervisores] = useState<{ id: string; nome: string }[]>([]);
  const [filterSup, setFilterSup] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [compareMeses, setCompareMeses] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<Record<string, Budget[]>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("budgets_mensais")
      .select("id, unidade_id, mes, budget, gasto, unidades!inner(id, nome, supervisor_id)")
      .eq("mes", monthFirstDay(mes));
    if (error) toast.error(error.message);
    const sorted = ((data as any) ?? []).sort((a: Budget, b: Budget) =>
      a.unidades.nome.localeCompare(b.unidades.nome),
    );
    setRows(sorted);
    if (!isSup && supervisores.length === 0) {
      const { data: sups } = await supabase
.from("profiles").select("id, nome, user_roles!inner(role)").in("user_roles.role", ["admin", "gerente", "supervisor"]);
      setSupervisores((sups as any) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mes]);

  useEffect(() => {
    (async () => {
      const out: Record<string, Budget[]> = {};
      for (const m of compareMeses) {
        const { data } = await supabase
          .from("budgets_mensais")
          .select("id, unidade_id, mes, budget, gasto, unidades!inner(id, nome, supervisor_id)")
          .eq("mes", monthFirstDay(m));
        out[m] = (data as any) ?? [];
      }
      setCompareData(out);
    })();
  }, [compareMeses]);

  const filtered = useMemo(
    () => (filterSup === "all" ? rows : rows.filter((r) => r.unidades.supervisor_id === filterSup)),
    [rows, filterSup],
  );

  const totals = useMemo(() => {
    const budget = filtered.reduce((s, r) => s + Number(r.budget), 0);
    const gasto = filtered.reduce((s, r) => s + Number(r.gasto), 0);
    return { budget, gasto, saldo: budget - gasto, pct: pct(gasto, budget) };
  }, [filtered]);

  const updateField = async (id: string, field: "budget" | "gasto", value: number) => {
    setSavingId(id);
    const payload: any = { [field]: value, atualizado_em: new Date().toISOString(), atualizado_por: user?.id };
    const { error } = await supabase.from("budgets_mensais").update(payload).eq("id", id);
    setSavingId(null);
    if (error) return toast.error(error.message);
    setRows((r) => r.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
    toast.success("Atualizado");
  };

  const gerarMeses = useMemo(() => {
    const arr: string[] = [];
    const now = new Date();
    for (let i = -18; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return arr.reverse();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Mês</p>
          <h1 className="text-2xl md:text-3xl font-bold capitalize truncate">
            {monthLabel(monthFirstDay(mes))}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="icon" className="rounded-xl" asChild>
            <Link to="/budget/$mes" params={{ mes: addMonths(mes, -1) }}><ChevronLeft className="h-4 w-4" /></Link>
          </Button>
          <Select value={mes} onValueChange={(v) => navigate({ to: "/budget/$mes", params: { mes: v } })}>
            <SelectTrigger className="rounded-xl w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {gerarMeses.map((m) => (
                <SelectItem key={m} value={m} className="capitalize">{monthLabel(monthFirstDay(m))}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="rounded-xl" asChild>
            <Link to="/budget/$mes" params={{ mes: addMonths(mes, 1) }}><ChevronRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-3">
        {!isSup && (
          <Select value={filterSup} onValueChange={setFilterSup}>
            <SelectTrigger className="rounded-xl w-full sm:w-[220px]">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos responsáveis</SelectItem>
              {supervisores.map((s) => (<SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="rounded-xl">
              Comparar meses {compareMeses.length > 0 && `(${compareMeses.length})`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 max-h-80 overflow-auto">
            <div className="space-y-2">
              {gerarMeses.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={compareMeses.includes(m)}
                    onCheckedChange={(v) =>
                      setCompareMeses((prev) => (v ? [...prev, m] : prev.filter((x) => x !== m)))
                    }
                  />
                  <span className="capitalize">{monthLabel(monthFirstDay(m))}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        {compareMeses.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setCompareMeses([])}>Limpar</Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Totalizer label="Budget" value={brl(totals.budget)} />
        <Totalizer label="Gasto" value={brl(totals.gasto)} />
        <Totalizer label="Saldo" value={brl(totals.saldo)} tone={totals.saldo >= 0 ? "pos" : "neg"} />
        <Totalizer label="% Geral" value={fmtPct(totals.pct)} />
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold text-right">Budget</th>
                <th className="px-4 py-3 font-semibold text-right">Gasto</th>
                <th className="px-4 py-3 font-semibold text-right">Saldo</th>
                <th className="px-4 py-3 font-semibold text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum registro. Gere o mês em Unidades.</td></tr>
              ) : filtered.map((r) => {
                const saldo = Number(r.budget) - Number(r.gasto);
                const p = pct(Number(r.gasto), Number(r.budget));
                return (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-4 py-3 font-medium">{r.unidades.nome}</td>
                    <td className="px-4 py-3 text-right">
                      {canEditBudget ? (
                        <InlineNumber value={Number(r.budget)} onSave={(v) => updateField(r.id, "budget", v)} busy={savingId === r.id} />
                      ) : (
                        brl(r.budget)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <InlineNumber value={Number(r.gasto)} onSave={(v) => updateField(r.id, "gasto", v)} busy={savingId === r.id} />
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${saldo < 0 ? "text-destructive" : ""}`}>{brl(saldo)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${saldoBadgeBg(p)}`}>
                        {fmtPct(p)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {compareMeses.length > 0 && (
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border/60 font-semibold">Comparação de meses</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold sticky left-0 bg-muted/60">Unidade</th>
                  {compareMeses.map((m) => (
                    <th key={m} colSpan={3} className="px-4 py-3 font-semibold text-center border-l capitalize">
                      {monthLabel(monthFirstDay(m))}
                    </th>
                  ))}
                </tr>
                <tr className="text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 sticky left-0 bg-muted/60"></th>
                  {compareMeses.map((m) => (
                    <Fragment key={m + "h"}>
                      <th className="px-3 py-2 text-right border-l">Budget</th>
                      <th className="px-3 py-2 text-right">Gasto</th>
                      <th className="px-3 py-2 text-right">%</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allUnidades(compareData).map((u) => (
                  <tr key={u} className="border-t border-border/60">
                    <td className="px-4 py-2 font-medium sticky left-0 bg-background">{u}</td>
                    {compareMeses.map((m) => {
                      const r = compareData[m]?.find((x) => x.unidades.nome === u);
                      const p = r ? pct(Number(r.gasto), Number(r.budget)) : null;
                      return (
                        <Fragment key={m + u}>
                          <td className="px-3 py-2 text-right border-l">{r ? brl(r.budget) : "—"}</td>
                          <td className="px-3 py-2 text-right">{r ? brl(r.gasto) : "—"}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${saldoBadgeBg(p)}`}>{fmtPct(p)}</span>
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function allUnidades(data: Record<string, Budget[]>) {
  const set = new Set<string>();
  Object.values(data).forEach((arr) => arr.forEach((r) => set.add(r.unidades.nome)));
  return Array.from(set).sort();
}

function Totalizer({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
        <p className={`mt-1 text-xl font-bold ${tone === "neg" ? "text-destructive" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function InlineNumber({ value, onSave, busy }: { value: number; onSave: (v: number) => void; busy: boolean }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <Input
      type="number"
      step="0.01"
      value={v}
      disabled={busy}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = parseFloat(v);
        if (!Number.isNaN(n) && n !== value) onSave(n);
      }}
      className="w-32 text-right rounded-lg ml-auto"
    />
  );
}
