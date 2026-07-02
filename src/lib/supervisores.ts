import { supabase } from "@/integrations/supabase/client";

export type Supervisor = { id: string; nome: string };

/**
 * Lista todos os usuários com o papel "supervisor" (fonte única para dropdowns
 * de "responsável" em toda a aplicação).
 */
export async function fetchSupervisores(): Promise<Supervisor[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome, user_roles!inner(role)")
    .eq("user_roles.role", "supervisor")
    .order("nome");
  if (error) {
    console.error("[fetchSupervisores]", error);
    return [];
  }
  return ((data as any) ?? []).map((p: any) => ({ id: p.id, nome: p.nome }));
}