import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, fmtPct, monthLabel, pct, saldoBadgeBg } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: Relatorios,
});

type Row = {
  budget: number;
  gasto: number;
  mes: string;
  unidade_id: string;
  unidades: { nome: string; supervisor_id: string | null };
};

function Relatorios() {
  const { role } = useAuth();
  const isSup = role === "supervisor";
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState<Row[]>([]);
  const [sups, setSups] = useState<{ id: string; nome: string }[]>([]);
  const [filterSup, setFilterSup] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const from = `${year}-01-01`;
      const to = `${year}-12-01`;
      const { data } = await supabase
        .from("budgets_mensais")
        .select("mes, budget, gasto, unidade_id, unidades!inner(nome, supervisor_id)")
        .gte("mes", from).lte("mes", to);
      setRows((data as any) ?? []);
      if (!isSup && sups.length === 0) {
        const { data: s } = await supabase.from("profiles")
          .select("id, nome, user_roles!inner(role)").eq("user_roles.role", "supervisor");
        setSups((s as any) ?? []);
      }
    })();
  }, [year, isSup]);

  const filtered = useMemo(
    () => (filterSup === "all" ? rows : rows.filter((r) => r.unidades.supervisor_id === filterSup)),
    [rows, filterSup],
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
      if (cur) { cur.budget += Number(r.budget); cur.gasto += Number(r.gasto); }
    });
    return Array.from(map.values()).map((x) => ({ ...x, label: monthLabel(x.mes).slice(0, 3) }));
  }, [filtered, year]);

  const byUnidade = useMemo(() => {
    const map = new Map<string, { nome: string; budget: number; gasto: number }>();
    filtered.forEach((r) => {
      const cur = map.get(r.unidade_id) ?? { nome: r.unidades.nome, budget: 0, gasto: 0 };
      cur.budget += Number(r.budget); cur.gasto += Number(r.gasto);
      map.set(r.unidade_id, cur);
    });
    return Array.from(map.values()).map((x) => ({
      ...x, saldo: x.budget - x.gasto, pctVal: pct(x.gasto, x.budget),
    })).sort((a, b) => (b.pctVal ?? 0) - (a.pctVal ?? 0));
  }, [filtered]);

  const estouros = byUnidade.filter((u) => (u.pctVal ?? 0) > 1);

  const exportCsv = () => {
    const header = ["Unidade", "Budget acum.", "Gasto acum.", "Saldo", "% acum."].join(",");
    const lines = byUnidade.map((u) =>
      [u.nome, u.budget.toFixed(2), u.gasto.toFixed(2), u.saldo.toFixed(2), (u.pctVal ?? 0).toFixed(4)].join(","),
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

      <div className="flex flex-wrap gap-3">
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
                <Bar dataKey="budget" name="Budget" fill="var(--color-secondary)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="gasto" name="Gasto" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl overflow-hidden">
          <CardHeader><CardTitle>Acumulado por unidade</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Unidade</th>
                  <th className="px-4 py-3 font-semibold text-right">Budget</th>
                  <th className="px-4 py-3 font-semibold text-right">Gasto</th>
                  <th className="px-4 py-3 font-semibold text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {byUnidade.map((u) => (
                  <tr key={u.nome} className="border-t border-border/60">
                    <td className="px-4 py-2 font-medium">{u.nome}</td>
                    <td className="px-4 py-2 text-right">{brl(u.budget)}</td>
                    <td className="px-4 py-2 text-right">{brl(u.gasto)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${saldoBadgeBg(u.pctVal)}`}>{fmtPct(u.pctVal)}</span>
                    </td>
                  </tr>
                ))}
                {byUnidade.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Sem dados no período.</td></tr>
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