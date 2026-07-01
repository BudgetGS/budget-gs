import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { brl, currentMonthKey, monthFirstDay } from "@/lib/format";
import { Plus, Pencil, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/unidades")({
  component: UnidadesPage,
});

type Unidade = {
  id: string;
  nome: string;
  ativo: boolean;
  budget_base: number;
  supervisor_id: string | null;
};
type Sup = { id: string; nome: string };

function UnidadesPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const canManage = role === "admin" || role === "gerente";
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [sups, setSups] = useState<Sup[]>([]);
  const [filterSup, setFilterSup] = useState<string>("all");
  const [editing, setEditing] = useState<Unidade | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManage) { navigate({ to: "/dashboard" }); return; }
    load();
  }, [canManage, navigate]);

  const load = async () => {
    const [{ data: u }, { data: s }] = await Promise.all([
      supabase.from("unidades").select("id, nome, ativo, budget_base, supervisor_id").order("nome"),
supabase.from("profiles").select("id, nome, user_roles!inner(role)").in("user_roles.role", ["admin", "gerente", "supervisor"]),
    ]);
    setUnidades((u as any) ?? []);
    setSups((s as any) ?? []);
  };

  const filtered = useMemo(
    () => (filterSup === "all" ? unidades : unidades.filter((u) => u.supervisor_id === filterSup)),
    [unidades, filterSup],
  );

  const openNew = () => { setEditing({ id: "", nome: "", ativo: true, budget_base: 0, supervisor_id: null }); setOpen(true); };
  const openEdit = (u: Unidade) => { setEditing({ ...u }); setOpen(true); };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const payload = {
      nome: editing.nome,
      ativo: editing.ativo,
      budget_base: editing.budget_base,
      supervisor_id: editing.supervisor_id,
    };
    const { error } = editing.id
      ? await supabase.from("unidades").update(payload).eq("id", editing.id)
      : await supabase.from("unidades").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
    setOpen(false);
    load();
  };

  const gerarProximoMes = async () => {
    const key = currentMonthKey();
    const [y, m] = key.split("-").map(Number);
    const nextKey = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    if (!confirm(`Gerar budgets do próximo mês (${nextKey}) para todas as unidades ativas?`)) return;
    const { data, error } = await supabase.rpc("gerar_proximo_mes", { _mes: monthFirstDay(nextKey) });
    if (error) return toast.error(error.message);
    toast.success(`Mês gerado: ${data} unidade(s).`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">Unidades</h1>
          <p className="text-sm text-muted-foreground">Cadastro e responsáveis</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" className="rounded-xl" onClick={gerarProximoMes}>
            <PlayCircle className="h-4 w-4" /> Gerar próximo mês
          </Button>
          <Button className="rounded-xl" onClick={openNew}><Plus className="h-4 w-4" />Nova</Button>
        </div>
      </div>

      <div>
        <Select value={filterSup} onValueChange={setFilterSup}>
          <SelectTrigger className="rounded-xl w-full sm:w-[260px]">
            <SelectValue placeholder="Filtrar por responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({unidades.length})</SelectItem>
            {sups.map((s) => {
              const cnt = unidades.filter((u) => u.supervisor_id === s.id).length;
              return <SelectItem key={s.id} value={s.id}>{s.nome} ({cnt})</SelectItem>;
            })}
            <SelectItem value="__none__" disabled>Sem responsável ({unidades.filter((u) => !u.supervisor_id).length})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Responsável</th>
                <th className="px-4 py-3 font-semibold text-right">Budget base</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const sup = sups.find((s) => s.id === u.supervisor_id);
                return (
                  <tr key={u.id} className="border-t border-border/60">
                    <td className="px-4 py-3 font-medium">{u.nome}</td>
                    <td className="px-4 py-3">{sup?.nome ?? <span className="text-muted-foreground italic">—</span>}</td>
                    <td className="px-4 py-3 text-right">{brl(u.budget_base)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${u.ativo ? "bg-secondary/40 text-secondary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {u.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Nenhuma unidade.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar unidade" : "Nova unidade"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Budget base (R$)</Label>
                <Input type="number" step="0.01" value={editing.budget_base}
                  onChange={(e) => setEditing({ ...editing, budget_base: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select
                  value={editing.supervisor_id ?? "__none__"}
                  onValueChange={(v) => setEditing({ ...editing, supervisor_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem responsável</SelectItem>
                    {sups.map((s) => (<SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Ativa</Label>
                <Switch checked={editing.ativo} onCheckedChange={(v) => setEditing({ ...editing, ativo: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
