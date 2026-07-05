import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Building2, ArrowUp, ArrowDown, Shield, Power, PowerOff } from "lucide-react";
import { createUser, updateUserRole, deleteUser, setUserActive } from "@/lib/admin.functions";
import {
  moveItem,
  useWidgetConfig,
  type WidgetDef,
} from "@/lib/widget-config";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: ConfiguracoesPage,
});

const DASHBOARD_WIDGETS: WidgetDef[] = [
  { id: "stats", label: "Cards de totais (Budget, Gasto, Saldo, %)" },
  { id: "estouradas", label: "Alerta: unidades acima de 100%" },
  { id: "chart", label: "Gráfico de distribuição por unidade" },
  { id: "ai", label: "Análise de IA" },
];

const RELATORIOS_WIDGETS: WidgetDef[] = [
  { id: "budget-x-gasto", label: "Gráfico Budget x Gasto (mensal)" },
  { id: "gasto-por-unidade", label: "Gasto por unidade (barras)" },
  { id: "evolucao-dupla", label: "Evolução mensal — acumulado vs fixo (lado a lado)" },
  { id: "acumulado-tabela", label: "Acumulado por unidade (tabela)" },
  { id: "ranking-estouros", label: "Ranking de estouros" },
];

function ConfiguracoesPage() {
  const { role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (role && role !== "admin") navigate({ to: "/dashboard" });
  }, [role, navigate]);

  if (role !== "admin") return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gestão de acessos e personalização de telas</p>
      </div>
      <Tabs defaultValue="users">
        <TabsList className="rounded-xl">
          <TabsTrigger value="users">Usuários e Acessos</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-6"><UsersTab /></TabsContent>
        <TabsContent value="dashboard" className="mt-6">
          <WidgetsTab scope="dashboard" defs={DASHBOARD_WIDGETS} title="Widgets do Dashboard" />
        </TabsContent>
        <TabsContent value="relatorios" className="mt-6">
          <WidgetsTab scope="relatorios" defs={RELATORIOS_WIDGETS} title="Widgets dos Relatórios" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------ Users tab ------------------------ */

type UserRow = { id: string; nome: string; email: string; role: string; unidades: number; ativo: boolean; lancamentos: number };

function UsersTab() {
  const createFn = useServerFn(createUser);
  const updateRoleFn = useServerFn(updateUserRole);
  const deleteFn = useServerFn(deleteUser);
  const setActiveFn = useServerFn(setUserActive);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [unidades, setUnidades] = useState<{ id: string; nome: string; supervisor_id: string | null }[]>([]);
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState<UserRow | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", password: "", role: "supervisor" as const });
  const [busy, setBusy] = useState(false);
  const [hideInactive, setHideInactive] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [{ data: profiles }, { data: roles }, { data: uns }, { data: lanc }] = await Promise.all([
      supabase.from("profiles").select("id, nome, email, ativo"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("unidades").select("id, nome, supervisor_id"),
      supabase.from("lancamentos").select("lancado_por"),
    ]);
    const rMap = new Map<string, string>((roles ?? []).map((r) => [r.user_id, r.role]));
    const cntMap = new Map<string, number>();
    (uns ?? []).forEach((u) => { if (u.supervisor_id) cntMap.set(u.supervisor_id, (cntMap.get(u.supervisor_id) ?? 0) + 1); });
    const lancMap = new Map<string, number>();
    (lanc ?? []).forEach((l: any) => {
      if (l.lancado_por) lancMap.set(l.lancado_por, (lancMap.get(l.lancado_por) ?? 0) + 1);
    });
    setUsers((profiles ?? []).map((p: any) => ({
      id: p.id, nome: p.nome, email: p.email,
      role: rMap.get(p.id) ?? "—", unidades: cntMap.get(p.id) ?? 0,
      ativo: p.ativo !== false,
      lancamentos: lancMap.get(p.id) ?? 0,
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
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const changeRole = async (id: string, newRole: string) => {
    try { await updateRoleFn({ data: { user_id: id, role: newRole as any } }); toast.success("Papel atualizado"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esse usuário definitivamente? Essa ação é irreversível.")) return;
    try { await deleteFn({ data: { user_id: id } }); toast.success("Excluído"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const toggleActive = async (id: string, ativo: boolean) => {
    try {
      await setActiveFn({ data: { user_id: id, ativo } });
      toast.success(ativo ? "Usuário reativado" : "Usuário desativado");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const linkUnidade = async (unidadeId: string, supervisorId: string | null) => {
    const { error } = await supabase.from("unidades").update({ supervisor_id: supervisorId }).eq("id", unidadeId);
    if (error) return toast.error(error.message);
    toast.success("Atualizado");
    load();
  };

  const visibleUsers = hideInactive ? users.filter((u) => u.ativo) : users;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-primary">Admin = acesso total</p>
            <p className="text-muted-foreground">
              Usuários com papel <b>admin</b> têm acesso irrestrito: todas as unidades, todos os lançamentos e gestão completa de usuários.
            </p>
          </div>
        </div>
        <Button className="rounded-xl" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Novo usuário</Button>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="hide-inactive" checked={hideInactive} onCheckedChange={(v) => setHideInactive(!!v)} />
        <Label htmlFor="hide-inactive" className="text-sm cursor-pointer">
          Ocultar usuários desativados
          <span className="text-muted-foreground ml-1">({users.filter((u) => !u.ativo).length} inativo{users.filter((u) => !u.ativo).length === 1 ? "" : "s"})</span>
        </Label>
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
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u) => (
                <tr key={u.id} className={`border-t border-border/60 ${!u.ativo ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{u.nome}</span>
                      {!u.ativo && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">Inativo</span>
                      )}
                    </div>
                  </td>
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
                    <div className="flex items-center justify-end gap-1">
                      {u.ativo ? (
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(u.id, false)} title="Desativar">
                          <PowerOff className="h-4 w-4" /> Desativar
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(u.id, true)} title="Reativar">
                          <Power className="h-4 w-4" /> Reativar
                        </Button>
                      )}
                      {u.lancamentos === 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(u.id)}
                          className="text-destructive"
                          title="Excluir definitivamente"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {visibleUsers.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum usuário para exibir.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label>
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

/* ------------------------ Widgets tab ------------------------ */

function WidgetsTab({ scope, defs, title }: { scope: string; defs: WidgetDef[]; title: string }) {
  const { state, save } = useWidgetConfig(scope, defs);
  const labelMap = new Map(defs.map((d) => [d.id, d.label]));

  const toggle = (id: string, v: boolean) =>
    save(state.map((s) => (s.id === id ? { ...s, enabled: v } : s)));

  const move = (idx: number, dir: -1 | 1) => save(moveItem(state, idx, dir));

  const resetAll = () => save(defs.map((d) => ({ id: d.id, enabled: true })));

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Button size="sm" variant="ghost" onClick={resetAll}>Restaurar padrão</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground mb-2">
          Ative/desative widgets e reordene com as setas. A configuração é aplicada ao carregar a tela.
        </p>
        {state.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Checkbox checked={s.enabled} onCheckedChange={(v) => toggle(s.id, !!v)} />
            <span className="flex-1 text-sm font-medium">{labelMap.get(s.id) ?? s.id}</span>
            <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === state.length - 1}>
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}