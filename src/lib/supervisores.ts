import { listSupervisores } from "@/lib/admin.functions";

export type Supervisor = { id: string; nome: string };

/**
 * Fonte única para dropdowns de "responsável" em toda a aplicação.
 * Roteado por server function (service role) porque a RLS de `profiles` /
 * `user_roles` esconde os outros usuários do próprio supervisor, o que
 * quebrava a query aninhada quando feita a partir do cliente.
 */
export async function fetchSupervisores(): Promise<Supervisor[]> {
  try {
    const data = await listSupervisores();
    return (data ?? []) as Supervisor[];
  } catch (e) {
    console.error("[fetchSupervisores]", e);
    return [];
  }
}