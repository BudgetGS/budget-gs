import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { fetchSupervisores, type Supervisor } from "@/lib/supervisores";
import { brl, fmtPct, monthLabel, pct, saldoBadgeBg } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Download, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: Relatorios,
});

type Row = {
  budget: number;
  gasto: number;
  mes: string;
  unidade_id: string;
  unidades: { nome: string; supervisor_id: string | null; budget_base: number };
};

function Relatorios() {
  const { role } = useAuth();
  const isSup = role === "supervisor";
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState<Row[]>([]);
  const [sups, setSups] = useState<Supervisor[]>([]);
  const [filterSup, setFilterSup] = useState<string>("all");
  const [considerarAcumulado, setConsiderarAcumulado] = useState(true);
  const [unidadeIds, setUnidadeIds] = useState<string[]>([]);
  const [allUnidades, setAllUnidades] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    (async () => {
      const from = `${year}-01-01`;
      const to = `${year}-12-01`;
      const { data } = await supabase
        .from("budgets_mensais")
        .select("mes, budget, gasto, unidade_id, unidades!inner(nome, supervisor_id, budget_base)")
        .gte("mes", from).lte("mes", to);
      setRows((data as any) ?? []);
      if (!isSup && sups.length === 0) {
        setSups(await fetchSupervisores());
      }
      if (allUnidades.length === 0) {
        const { data: uds } = await supabase.from("unidades").select("id, nome").order("nome");
        setAllUnidades((uds as any) ?? []);
      }
    })();
  }, [year, isSup]); // eslint-disable-line

  const filtered = useMemo(
    () => {
      let out = rows;
      if (filterSup !== "all") out = out.filter((r) => r.unidades.supervisor_id === filterSup);
      if (unidadeIds.length > 0) out = out.filter((r) => unidadeIds.includes(r.unidade_id));
      return out;
    },
    [rows, filterSup, unidadeIds],
  );

  const monthly = useMemo(() => {
    const map = new Map<string, { mes: string; budget: number; gasto: number }>();
    for (let m = 1; m <= 12; m++) {
      const k = `${year}-${String(m).padStart(2, "0")}-01`;
      map.set(k, { mes: k, budget: 0, gasto: 0 });
    }
    filtered.forEach((r) => {
      const k = r.mes.slice(0, 10);
      const cur = map.get(k);
      if (cur) {
        cur.budget += considerarAcumulado ? Number(r.budget) : Number(r.unidades.budget_base);
        cur.gasto += Number(r.gasto);
      }
    });
    return Array.from(map.values()).map((x) => ({ ...x, label: monthLabel(x.mes).slice(0, 3) }));
  }, [filtered, year, considerarAcumulado]);

  const byUnidade = useMemo(() => {
    type Agg = {
      nome: string;
      budgetFixoAcum: number;   // budget_base × meses
      budgetTotalAcum: number;  // soma budgets_mensais.budget
      gasto: number;
    };
    const map = new Map<string, Agg>();
    filtered.forEach((r) => {
      const base = Number(r.unidades.budget_base);
      const cur = map.get(r.unidade_id) ?? { nome: r.unidades.nome, budgetFixoAcum: 0, budgetTotalAcum: 0, gasto: 0 };
      cur.budgetFixoAcum += base;
      cur.budgetTotalAcum += Number(r.budget);
      cur.gasto += Number(r.gasto);
      map.set(r.unidade_id, cur);
    });
    return Array.from(map.values()).map((x) => {
      const acumulado = x.budgetTotalAcum - x.budgetFixoAcum;
      const budget = considerarAcumulado ? x.budgetTotalAcum : x.budgetFixoAcum;
      const saldo = budget - x.gasto;
      return {
        nome: x.nome,
        budgetFixo: x.budgetFixoAcum,
        acumulado,
        budget,
        gasto: x.gasto,
        saldo,
        pctVal: pct(x.gasto, budget),
      };
    }).sort((a, b) => (b.pctVal ?? 0) - (a.pctVal ?? 0));
  }, [filtered, considerarAcumulado]);

  const estouros = byUnidade.filter((u) => (u.pctVal ?? 0) > 1);

  const exportCsv = () => {
    const header = considerarAcumulado
      ? ["Unidade", "Budget fixo", "Saldo acumulado", "Budget total", "Gasto", "Saldo", "%"].join(",")
      : ["Unidade", "Budget", "Gasto", "Saldo", "%"].join(",");
    const lines = byUnidade.map((u) =>
      considerarAcumulado
        ? [u.nome, u.budgetFixo.toFixed(2), u.acumulado.toFixed(2), u.budget.toFixed(2), u.gasto.toFixed(2), u.saldo.toFixed(2), (u.pctVal ?? 0).toFixed(4)].join(",")
        : [u.nome, u.budget.toFixed(2), u.gasto.toFixed(2), u.saldo.toFixed(2), (u.pctVal ?? 0).toFixed(4)].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-${year}.csv`;
    a.click();
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Visão anual acumulada</p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="rounded-xl w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
          </SelectContent>
        </Select>
        {!isSup && (
          <Select value={filterSup} onValueChange={setFilterSup}>
            <SelectTrigger className="rounded-xl w-[220px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos responsáveis</SelectItem>
              {sups.map((s) => (<SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="rounded-xl">
              <Building2 className="h-4 w-4" /> Unidades {unidadeIds.length > 0 && `(${unidadeIds.length})`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 max-h-80 overflow-auto">
            <div className="space-y-2">
              {allUnidades.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={unidadeIds.includes(u.id)}
                    onCheckedChange={(v) =>
                      setUnidadeIds((prev) => (v ? [...prev, u.id] : prev.filter((x) => x !== u.id)))
                    }
                  />
                  {u.nome}
                </label>
              ))}
              {unidadeIds.length > 0 && (
                <Button size="sm" variant="ghost" className="w-full" onClick={() => setUnidadeIds([])}>Limpar</Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-2 ml-auto rounded-xl border px-3 py-2">
          <Switch id="acumulado" checked={considerarAcumulado} onCheckedChange={setConsiderarAcumulado} />
          <Label htmlFor="acumulado" className="text-sm cursor-pointer">Considerar acumulado</Label>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Budget x Gasto — {year}</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ borderRadius: 12 }} />
                <Legend />
                <Bar dataKey="budget" name={considerarAcumulado ? "Budget total" : "Budget fixo"} fill="var(--color-secondary)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="gasto" name="Gasto" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl overflow-hidden">
          <CardHeader><CardTitle>{considerarAcumulado ? "Acumulado por unidade" : "Por unidade (sem rollover)"}</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Unidade</th>
                  {considerarAcumulado ? (
                    <>
                      <th className="px-4 py-3 font-semibold text-right">Budget fixo</th>
                      <th className="px-4 py-3 font-semibold text-right">Saldo acum.</th>
                      <th className="px-4 py-3 font-semibold text-right">Total</th>
                    </>
                  ) : (
                    <th className="px-4 py-3 font-semibold text-right">Budget</th>
                  )}
                  <th className="px-4 py-3 font-semibold text-right">Gasto</th>
                  <th className="px-4 py-3 font-semibold text-right">Saldo</th>
                  <th className="px-4 py-3 font-semibold text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {byUnidade.map((u) => (
                  <tr key={u.nome} className="border-t border-border/60">
                    <td className="px-4 py-2 font-medium">{u.nome}</td>
                    {considerarAcumulado ? (
                      <>
                        <td className="px-4 py-2 text-right">{brl(u.budgetFixo)}</td>
                        <td className={`px-4 py-2 text-right ${u.acumulado < 0 ? "text-destructive" : ""}`}>{brl(u.acumulado)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{brl(u.budget)}</td>
                      </>
                    ) : (
                      <td className="px-4 py-2 text-right">{brl(u.budget)}</td>
                    )}
                    <td className="px-4 py-2 text-right">{brl(u.gasto)}</td>
                    <td className={`px-4 py-2 text-right ${u.saldo < 0 ? "text-destructive" : ""}`}>{brl(u.saldo)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${saldoBadgeBg(u.pctVal)}`}>{fmtPct(u.pctVal)}</span>
                    </td>
                  </tr>
                ))}
                {byUnidade.length === 0 && (
                  <tr><td colSpan={considerarAcumulado ? 7 : 5} className="text-center py-8 text-muted-foreground">Sem dados no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader><CardTitle>Ranking de estouros</CardTitle></CardHeader>
          <CardContent>
            {estouros.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum estouro acumulado no ano.</p>
            ) : (
              <ol className="space-y-2">
                {estouros.map((u, i) => (
                  <li key={u.nome} className="flex items-center justify-between rounded-xl bg-destructive/5 px-3 py-2">
                    <span className="font-medium"><span className="text-destructive font-bold mr-2">#{i + 1}</span>{u.nome}</span>
                    <span className="text-destructive font-bold">{fmtPct(u.pctVal)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
