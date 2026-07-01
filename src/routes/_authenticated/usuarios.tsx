import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Building2 } from "lucide-react";
import { createUser, updateUserRole, deleteUser } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
});

type UserRow = { id: string; nome: string; email: string; role: string; unidades: number };

function UsuariosPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const createFn = useServerFn(createUser);
  const updateRoleFn = useServerFn(updateUserRole);
  const deleteFn = useServerFn(deleteUser);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [unidades, setUnidades] = useState<{ id: string; nome: string; supervisor_id: string | null }[]>([]);
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState<UserRow | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", password: "", role: "supervisor" as const });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (role !== "admin") { navigate({ to: "/dashboard" }); return; }
    load();
  }, [role, navigate]);

  const load = async () => {
    const [{ data: profiles }, { data: roles }, { data: uns }] = await Promise.all([
      supabase.from("profiles").select("id, nome, email"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("unidades").select("id, nome, supervisor_id"),
    ]);
    const rMap = new Map<string, string>((roles ?? []).map((r) => [r.user_id, r.role]));
    const cntMap = new Map<string, number>();
    (uns ?? []).forEach((u) => { if (u.supervisor_id) cntMap.set(u.supervisor_id, (cntMap.get(u.supervisor_id) ?? 0) + 1); });
    setUsers((profiles ?? []).map((p) => ({
      id: p.id, nome: p.nome, email: p.email,
      role: rMap.get(p.id) ?? "—", unidades: cntMap.get(p.id) ?? 0,
    })).sort((a, b) => a.nome.localeCompare(b.nome)));
    setUnidades((uns ?? []) as any);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await createFn({ data: form });
      toast.success("Usuário criado");
      setOpen(false);
      setForm({ nome: "", email: "", password: "", role: "supervisor" });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  const changeRole = async (id: string, newRole: string) => {
    try {
      await updateRoleFn({ data: { user_id: id, role: newRole as any } });
      toast.success("Papel atualizado");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esse usuário?")) return;
    try {
      await deleteFn({ data: { user_id: id } });
      toast.success("Excluído");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const linkUnidade = async (unidadeId: string, supervisorId: string | null) => {
    const { error } = await supabase.from("unidades").update({ supervisor_id: supervisorId }).eq("id", unidadeId);
    if (error) return toast.error(error.message);
    toast.success("Atualizado");
    load();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">Usuários</h1>
          <p className="text-sm text-muted-foreground">Gestão de acessos e vínculos</p>
        </div>
        <Button className="rounded-xl" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Novo usuário</Button>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">E-mail</th>
                <th className="px-4 py-3 font-semibold">Papel</th>
                <th className="px-4 py-3 font-semibold text-center">Unidades</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">{u.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <Select value={u.role} onValueChange={(v) => changeRole(u.id, v)}>
                      <SelectTrigger className="w-[140px] rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="gerente">gerente</SelectItem>
                        <SelectItem value="supervisor">supervisor</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.role === "supervisor" ? (
                      <Button variant="ghost" size="sm" onClick={() => setManageOpen(u)}>
                        <Building2 className="h-4 w-4" /> {u.unidades}
                      </Button>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => remove(u.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome (ex: Equipe Gabriel)</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>Senha inicial</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div className="space-y-2"><Label>Papel</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="gerente">gerente</SelectItem>
                  <SelectItem value="supervisor">supervisor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Criando..." : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!manageOpen} onOpenChange={(v) => !v && setManageOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Unidades de {manageOpen?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {unidades.map((u) => {
              const linked = u.supervisor_id === manageOpen?.id;
              return (
                <div key={u.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                  <span className="font-medium">{u.nome}</span>
                  <Button
                    variant={linked ? "default" : "outline"}
                    size="sm"
                    onClick={() => linkUnidade(u.id, linked ? null : manageOpen!.id)}
                  >
                    {linked ? "Vinculada" : "Vincular"}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}