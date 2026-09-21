import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { brl, monthLabel } from "@/lib/format";
import { fetchSupervisores, type Supervisor } from "@/lib/supervisores";
import { Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/historico")({
  component: Historico,
});

type Lanc = {
  id: string;
  valor: number;
  data_gasto: string;
  created_at: string | null;
  descricao: string | null;
  unidade_id: string;
  lancado_por: string | null;
  unidades: { id: string; nome: string; supervisor_id: string | null } | null;
  profiles: { id: string; nome: string } | null;
  budgets_mensais: { mes: string } | null;
};

/** Mês ao qual o lançamento se refere: o mês do budget vinculado (fallback: data do gasto). */
function refMes(l: { budgets_mensais?: { mes: string } | null; data_gasto: string }) {
  return String(l.budgets_mensais?.mes ?? l.data_gasto).slice(0, 7);
}

function Historico() {
  const { role, user } = useAuth();
  const isSup = role === "supervisor";

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState<string>(firstOfMonth.toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(today.toISOString().slice(0, 10));
  const [unidadeId, setUnidadeId] = useState<string>("all");
  const [mesRef, setMesRef] = useState<string>("all");
  const [supId, setSupId] = useState<string>(isSup && user?.id ? user.id : "all");
  const [rows, setRows] = useState<Lanc[]>([]);
  const [unidades, setUnidades] = useState<{ id: string; nome: string; supervisor_id: string | null }[]>([]);
  const [sups, setSups] = useState<Supervisor[]>([]);
  const [meses, setMeses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Lanc | null>(null);
  const [editValor, setEditValor] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Lanc | null>(null);

  const canManage = (l: Lanc) => (isSup ? l.lancado_por === user?.id : role === "admin" || role === "gerente");

  const openEdit = (l: Lanc) => {
    setEditing(l);
    setEditValor(String(l.valor));
    setEditDesc(l.descricao ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const valor = Number(editValor.replace(",", "."));
    if (!Number.isFinite(valor) || valor === 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("lancamentos")
      .update({ valor, descricao: editDesc.trim() || null })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar o lançamento.");
      return;
    }
    toast.success("Lançamento atualizado.");
    setEditing(null);
    setReload((n) => n + 1);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("lancamentos").delete().eq("id", deleting.id);
    if (error) {
      toast.error("Não foi possível excluir o lançamento.");
      return;
    }
    toast.success("Lançamento excluído.");
    setDeleting(null);
    setReload((n) => n + 1);
  };

  useEffect(() => {
    (async () => {
      const [{ data: uds }, sList, { data: lancs }] = await Promise.all([
        supabase.from("unidades").select("id, nome, supervisor_id").order("nome"),
        fetchSupervisores(),
        supabase.from("lancamentos").select("data_gasto, budgets_mensais(mes)").order("data_gasto", { ascending: false }).limit(1000),
      ]);
      setUnidades((uds as any) ?? []);
      setSups(sList);
      const keys: string[] = Array.from(new Set<string>(((lancs as any) ?? []).map((l: any) => refMes(l)))).sort().reverse();
      setMeses(keys);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("lancamentos")
        .select("id, valor, data_gasto, created_at, descricao, unidade_id, lancado_por, unidades(id, nome, supervisor_id), profiles:lancado_por(id, nome), budgets_mensais(mes)")
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (unidadeId !== "all") q = q.eq("unidade_id", unidadeId);
      const { data, error } = await q;
      if (error) console.error(error);
      let list = ((data as any) ?? []) as Lanc[];
      if (supId !== "all") list = list.filter((l) => l.unidades?.supervisor_id === supId);
      if (mesRef !== "all") list = list.filter((l) => refMes(l) === mesRef);
      setRows(list);
      setLoading(false);
    })();
  }, [from, to, unidadeId, supId, mesRef, reload]);

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.valor), 0), [rows]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Histórico</h1>
        <p className="text-sm text-muted-foreground">Lançamentos por período</p>
      </div>

      <Card className="rounded-2xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Mês referência</label>
            <Select value={mesRef} onValueChange={setMesRef}>
              <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {meses.map((m) => (<SelectItem key={m} value={m}>{monthLabel(`${m}-01`)}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Lançado de</label>
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
              onClick={() => { setUnidadeId("all"); setSupId(isSup && user?.id ? user.id : "all"); setMesRef("all"); }}
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
                <th className="px-4 py-3 font-semibold">Lançado em</th>
                <th className="px-4 py-3 font-semibold">Mês referência</th>
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Descrição</th>
                <th className="px-4 py-3 font-semibold text-right">Valor</th>
                <th className="px-4 py-3 font-semibold">Lançado por</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum lançamento no período.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-4 py-3 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{monthLabel(`${refMes(r)}-01`)}</td>
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