import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl } from "@/lib/format";
import { fetchSupervisores, type Supervisor } from "@/lib/supervisores";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/historico")({
  component: Historico,
});

type Lanc = {
  id: string;
  valor: number;
  data_gasto: string;
  descricao: string | null;
  unidade_id: string;
  lancado_por: string | null;
  unidades: { id: string; nome: string; supervisor_id: string | null } | null;
  profiles: { id: string; nome: string } | null;
};

function Historico() {
  const { role, user } = useAuth();
  const isSup = role === "supervisor";

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState<string>(firstOfMonth.toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(today.toISOString().slice(0, 10));
  const [unidadeId, setUnidadeId] = useState<string>("all");
  const [supId, setSupId] = useState<string>(isSup && user?.id ? user.id : "all");
  const [rows, setRows] = useState<Lanc[]>([]);
  const [unidades, setUnidades] = useState<{ id: string; nome: string; supervisor_id: string | null }[]>([]);
  const [sups, setSups] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: uds }, sList] = await Promise.all([
        supabase.from("unidades").select("id, nome, supervisor_id").order("nome"),
        fetchSupervisores(),
      ]);
      setUnidades((uds as any) ?? []);
      setSups(sList);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("lancamentos")
        .select("id, valor, data_gasto, descricao, unidade_id, lancado_por, unidades(id, nome, supervisor_id), profiles:lancado_por(id, nome)")
        .gte("data_gasto", from)
        .lte("data_gasto", to)
        .order("data_gasto", { ascending: false })
        .order("created_at", { ascending: false });
      if (unidadeId !== "all") q = q.eq("unidade_id", unidadeId);
      const { data, error } = await q;
      if (error) console.error(error);
      let list = ((data as any) ?? []) as Lanc[];
      if (supId !== "all") list = list.filter((l) => l.unidades?.supervisor_id === supId);
      setRows(list);
      setLoading(false);
    })();
  }, [from, to, unidadeId, supId]);

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.valor), 0), [rows]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Histórico</h1>
        <p className="text-sm text-muted-foreground">Lançamentos por período</p>
      </div>

      <Card className="rounded-2xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">De</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Até</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Unidade</label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {unidades.map((u) => (<SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Responsável</label>
            <Select value={supId} onValueChange={setSupId}>
              <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {sups.map((s) => (<SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex flex-col justify-end">
            <Button
              variant="ghost"
              className="rounded-lg"
              onClick={() => { setUnidadeId("all"); setSupId(isSup && user?.id ? user.id : "all"); }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground">{rows.length} lançamento(s)</p>
        <p className="text-lg font-bold">Total: {brl(total)}</p>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Descrição</th>
                <th className="px-4 py-3 font-semibold text-right">Valor</th>
                <th className="px-4 py-3 font-semibold">Lançado por</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum lançamento no período.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(r.data_gasto).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3 font-medium">{r.unidades?.nome ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.descricao ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{brl(r.valor)}</td>
                  <td className="px-4 py-3">{r.profiles?.nome ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}