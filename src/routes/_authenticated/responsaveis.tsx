import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Mail, Loader2 } from "lucide-react";
import {
  inviteUser,
  updateUserRole,
  setUserActive,
  listResponsaveis,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/responsaveis")({
  component: ResponsaveisPage,
});

type Row = {
  id: string;
  nome: string;
  email: string;
  role: string;
  ativo: boolean;
  pendente: boolean;
  last_sign_in_at: string | null;
};

function ResponsaveisPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const inviteFn = useServerFn(inviteUser);
  const updateRoleFn = useServerFn(updateUserRole);
  const setActiveFn = useServerFn(setUserActive);
  const listFn = useServerFn(listResponsaveis);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    email: "",
    role: "supervisor" as "admin" | "gerente" | "supervisor",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (role && role !== "admin") {
      navigate({ to: "/dashboard" });
      return;
    }
    if (role === "admin") load();
  }, [role, navigate]);

  const load = async () => {
    setLoading(true);
    try {
      const data = (await listFn()) as Row[];
      setRows(data.sort((a, b) => a.nome.localeCompare(b.nome)));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!form.nome.trim() || !form.email.trim()) {
      toast.error("Preencha nome e e-mail");
      return;
    }
    setBusy(true);
    try {
      await inviteFn({ data: form });
      toast.success("Convite enviado por e-mail");
      setOpen(false);
      setForm({ nome: "", email: "", role: "supervisor" });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (id: string, newRole: string) => {
    try {
      await updateRoleFn({ data: { user_id: id, role: newRole as any } });
      toast.success("Papel atualizado");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleActive = async (id: string, ativo: boolean) => {
    try {
      await setActiveFn({ data: { user_id: id, ativo } });
      toast.success(ativo ? "Acesso reativado" : "Acesso desativado");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">Responsáveis</h1>
          <p className="text-sm text-muted-foreground">
            Convide e gerencie supervisores, gerentes e administradores
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Convidar responsável
        </Button>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhum responsável cadastrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 font-semibold">Papel</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-center">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const self = u.id === user?.id;
                  return (
                    <tr key={u.id} className="border-t border-border/60">
                      <td className="px-4 py-3 font-medium">{u.nome}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <Select
                          value={u.role}
                          onValueChange={(v) => changeRole(u.id, v)}
                          disabled={self}
                        >
                          <SelectTrigger className="w-[140px] rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="gerente">gerente</SelectItem>
                            <SelectItem value="supervisor">supervisor</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3">
                        {u.pendente ? (
                          <Badge variant="secondary" className="gap-1">
                            <Mail className="h-3 w-3" /> Convite pendente
                          </Badge>
                        ) : u.ativo ? (
                          <Badge className="bg-secondary text-secondary-foreground">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Desativado</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Switch
                          checked={u.ativo}
                          disabled={self}
                          onCheckedChange={(v) => toggleActive(u.id, v)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar responsável</DialogTitle>
            <DialogDescription>
              Um e-mail de convite será enviado. O responsável define a própria senha ao aceitar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome (ex: Equipe Gabriel)</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="gerente">gerente</SelectItem>
                  <SelectItem value="supervisor">supervisor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {busy ? "Enviando..." : "Enviar convite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}