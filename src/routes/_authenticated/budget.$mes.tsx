import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { addMonths, brl, fmtPct, monthFirstDay, monthLabel, pct, saldoBadgeBg } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronLeft, ChevronRight, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchSupervisores, type Supervisor } from "@/lib/supervisores";

export const Route = createFileRoute("/_authenticated/budget/$mes")({
  component: BudgetMes,
});

type Budget = {
  id: string;
  unidade_id: string;
  mes: string;
  budget: number;
  gasto: number;
  unidades: { id: string; nome: string; supervisor_id: string | null; budget_base: number };
};

function BudgetMes() {
  const { mes } = Route.useParams();
  const { role, user } = useAuth();
  const isSup = role === "supervisor";
  const canEditBudget = role === "admin" || role === "gerente";
  const navigate = useNavigate();

  const [rows, setRows] = useState<Budget[]>([]);
  const [supervisores, setSupervisores] = useState<Supervisor[]>([]);
  const [filterSup, setFilterSup] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [compareMeses, setCompareMeses] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<Record<string, Budget[]>>({});
  const [bulkEdit, setBulkEdit] = useState(false);
  const [bulkValues, setBulkValues] = useState<Record<string, string>>({});
  const [savingBulk, setSavingBulk] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("budgets_mensais")
      .select("id, unidade_id, mes, budget, gasto, unidades!inner(id, nome, supervisor_id, budget_base)")
      .eq("mes", monthFirstDay(mes));
    if (error) toast.error(error.message);
    const sorted = ((data as any) ?? []).sort((a: Budget, b: Budget) =>
      a.unidades.nome.localeCompare(b.unidades.nome),
    );
    setRows(sorted);
    if (!isSup && supervisores.length === 0) {
      setSupervisores(await fetchSupervisores());
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
          .select("id, unidade_id, mes, budget, gasto, unidades!inner(id, nome, supervisor_id, budget_base)")
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

  const startBulkEdit = () => {
    const init: Record<string, string> = {};
    filtered.forEach((r) => { init[r.id] = String(Number(r.unidades.budget_base)); });
    setBulkValues(init);
    setBulkEdit(true);
  };

  const saveBulkEdit = async () => {
    setSavingBulk(true);
    try {
      const changes = filtered
        .map((r) => {
          const newBase = parseFloat(bulkValues[r.id] ?? String(r.unidades.budget_base));
          if (Number.isNaN(newBase) || newBase === Number(r.unidades.budget_base)) return null;
          const oldBase = Number(r.unidades.budget_base);
          const saldoAcumulado = Number(r.budget) - oldBase;
          const newBudget = newBase + saldoAcumulado;
          return { row: r, newBase, newBudget };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      for (const c of changes) {
        const { error: e1 } = await supabase
          .from("unidades")
          .update({ budget_base: c.newBase })
          .eq("id", c.row.unidade_id);
        if (e1) throw new Error(e1.message);
        const { error: e2 } = await supabase
          .from("budgets_mensais")
          .update({ budget: c.newBudget, atualizado_em: new Date().toISOString(), atualizado_por: user?.id })
          .eq("id", c.row.id);
        if (e2) throw new Error(e2.message);
      }
      toast.success(changes.length === 0 ? "Nenhuma alteração" : `${changes.length} unidade(s) atualizada(s)`);
      setBulkEdit(false);
      setBulkValues({});
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSavingBulk(false);
    }
  };

  const registrarLancamento = async (row: Budget, valor: number, descricao: string): Promise<void> => {
    if (!user?.id) return;
    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    const { error } = await supabase.from("lancamentos").insert({
      unidade_id: row.unidade_id,
      budget_mensal_id: row.id,
      valor,
      descricao: descricao || null,
      data_gasto: new Date().toISOString().slice(0, 10),
      lancado_por: user.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lançamento registrado");
    await load();
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
                <th className="px-4 py-3 font-semibold text-right">
                  <div className="inline-flex items-center gap-2">
                    Budget fixo
                    {canEditBudget && (
                      bulkEdit ? (
                        <Button size="sm" variant="secondary" className="rounded-lg h-7" onClick={saveBulkEdit} disabled={savingBulk}>
                          {savingBulk ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3" /> Concluir</>}
                        </Button>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={startBulkEdit} title="Editar em massa">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 font-semibold text-right">Budget mês</th>
                <th className="px-4 py-3 font-semibold text-right">Gasto</th>
                <th className="px-4 py-3 font-semibold text-right">Saldo</th>
                <th className="px-4 py-3 font-semibold text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum registro. Gere o mês em Unidades.</td></tr>
              ) : filtered.map((r) => {
                const saldo = Number(r.budget) - Number(r.gasto);
                const p = pct(Number(r.gasto), Number(r.budget));
                return (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-4 py-3 font-medium">{r.unidades.nome}</td>
                    <td className="px-4 py-3 text-right">
                      {bulkEdit && canEditBudget ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={bulkValues[r.id] ?? String(Number(r.unidades.budget_base))}
                          onChange={(e) => setBulkValues((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          className="w-32 text-right rounded-lg ml-auto"
                        />
                      ) : (
                        brl(r.unidades.budget_base)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{brl(r.budget)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        <span>{brl(r.gasto)}</span>
                        <LancarPopover onSave={(v, d) => registrarLancamento(r, v, d)} />
                      </div>
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

function LancarPopover({ onSave }: { onSave: (valor: number, descricao: string) => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = parseFloat(valor);
    if (Number.isNaN(n) || n <= 0) return;
    setBusy(true);
    await onSave(n, descricao);
    setBusy(false);
    setValor("");
    setDescricao("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Lançar gasto"
          className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground shadow hover:opacity-90 active:scale-95 transition"
        >
          <Plus className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Valor (R$)</label>
          <Input
            autoFocus
            type="number"
            step="0.01"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="0,00"
            className="text-right rounded-lg"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Descrição (opcional)</label>
          <Input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Ex: material elétrico"
            className="rounded-lg"
          />
        </div>
        <Button size="sm" className="w-full rounded-lg" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
