import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";

export const ROLES: AppRole[] = ["admin", "gerente", "supervisor"];

export type PermissionDef = { id: string; label: string; group: string };

export const PERMISSIONS: PermissionDef[] = [
  { id: "view.dashboard", label: "Dashboard", group: "Telas" },
  { id: "view.budget", label: "Meses", group: "Telas" },
  { id: "view.historico", label: "Histórico", group: "Telas" },
  { id: "view.relatorios", label: "Relatórios", group: "Telas" },
  { id: "view.unidades", label: "Unidades", group: "Telas" },
  { id: "view.configuracoes", label: "Configurações", group: "Telas" },
  { id: "unidades.criar", label: "Criar unidade", group: "Ações" },
  { id: "unidades.editar", label: "Editar unidade", group: "Ações" },
  { id: "unidades.gerar_mes", label: "Gerar próximo mês", group: "Ações" },
  { id: "budget.editar", label: "Editar budget do mês", group: "Ações" },
  { id: "lancamentos.criar", label: "Lançar gasto", group: "Ações" },
  { id: "lancamentos.excluir", label: "Excluir gasto", group: "Ações" },
  { id: "usuarios.gerenciar", label: "Gerenciar usuários", group: "Ações" },
];

export type PermissionMatrix = Record<string, Set<string>>;

export async function fetchPermissionMatrix(): Promise<PermissionMatrix> {
  const { data } = await supabase.from("role_permissions").select("role, permission");
  const m: PermissionMatrix = { admin: new Set(), gerente: new Set(), supervisor: new Set() };
  (data ?? []).forEach((r: any) => {
    if (!m[r.role]) m[r.role] = new Set();
    m[r.role].add(r.permission);
  });
  return m;
}

/** Permissions of the signed-in user. Admin always has full access. */
export function usePermissions() {
  const { role } = useAuth();
  const [perms, setPerms] = useState<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    if (!role) {
      setPerms(null);
      return;
    }
    supabase
      .from("role_permissions")
      .select("permission")
      .eq("role", role)
      .then(({ data }) => {
        if (alive) setPerms(new Set((data ?? []).map((r: any) => r.permission)));
      });
    return () => {
      alive = false;
    };
  }, [role]);

  const can = (permission: string) => {
    if (role === "admin") return true;
    if (!perms) return false;
    return perms.has(permission);
  };

  return { role, loading: !!role && perms === null, can };
}
