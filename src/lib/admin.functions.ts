import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roleEnum = z.enum(["admin", "gerente", "supervisor"]);

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Apenas admin");
  return supabaseAdmin;
}

async function assertAdminOrGerente(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "gerente"]);
  if (!data || data.length === 0) throw new Error("Sem permissão");
  return supabaseAdmin;
}

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      nome: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: roleEnum,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: data.nome, role: data.role },
    });
    if (error) throw new Error(error.message);

    // Ensure the role is exactly what admin picked (trigger picks 'supervisor' if metadata missing)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user!.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user!.id, role: data.role });
    await supabaseAdmin.from("profiles").update({ nome: data.nome }).eq("id", created.user!.id);
    return { ok: true, id: created.user!.id };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), role: roleEnum }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.user_id === context.userId) throw new Error("Não é possível excluir a si mesmo");
    const supabaseAdmin = await assertAdmin(context.userId);
    // Bloqueia exclusão quando existir histórico de lançamentos vinculado.
    const { count, error: cErr } = await supabaseAdmin
      .from("lancamentos")
      .select("id", { count: "exact", head: true })
      .eq("lancado_por", data.user_id);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) {
      throw new Error(
        `Este usuário possui ${count} lançamento(s) registrado(s) e não pode ser excluído. Desative-o para manter o histórico.`,
      );
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      nome: z.string().min(1),
      email: z.string().email(),
      role: roleEnum,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      { data: { nome: data.nome, role: data.role } },
    );
    if (error) throw new Error(error.message);

    const userId = invited.user!.id;
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
    await supabaseAdmin.from("profiles").update({ nome: data.nome }).eq("id", userId);
    return { ok: true, id: userId };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), ativo: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.user_id === context.userId) throw new Error("Não é possível desativar a si mesmo");
    const supabaseAdmin = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ ativo: data.ativo })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listResponsaveis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);

    const [{ data: authList, error: authErr }, { data: profiles }, { data: roles }] =
      await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
        supabaseAdmin.from("profiles").select("id, nome, email"),
        supabaseAdmin.from("user_roles").select("user_id, role"),
      ]);
    if (authErr) throw new Error(authErr.message);

    const rMap = new Map<string, string>((roles ?? []).map((r) => [r.user_id, r.role]));
    const authMap = new Map(
      (authList?.users ?? []).map((u) => [
        u.id,
        {
          banned_until: (u as any).banned_until as string | null,
          last_sign_in_at: u.last_sign_in_at,
          invited_at: (u as any).invited_at as string | null,
          confirmed_at: (u as any).confirmed_at as string | null,
        },
      ]),
    );

    return (profiles ?? []).map((p) => {
      const a = authMap.get(p.id);
      const bannedUntil = a?.banned_until ? new Date(a.banned_until) : null;
      const ativo = !bannedUntil || bannedUntil.getTime() < Date.now();
      return {
        id: p.id,
        nome: p.nome,
        email: p.email,
        role: rMap.get(p.id) ?? "supervisor",
        ativo,
        pendente: !a?.confirmed_at && !!a?.invited_at,
        last_sign_in_at: a?.last_sign_in_at ?? null,
      };
    });
  });

export const gerarProximoMes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ mes: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdminOrGerente(context.userId);
    const { data: count, error } = await supabaseAdmin.rpc("gerar_proximo_mes", { _mes: data.mes });
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

// Any authenticated user can list supervisors (needed for dropdowns/filters
// across Dashboard, Meses, Relatórios, Unidades, Histórico).
export const listSupervisores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "supervisor");
    if (rErr) throw new Error(rErr.message);
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [] as { id: string; nome: string }[];
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, nome")
      .in("id", ids)
      .order("nome");
    if (pErr) throw new Error(pErr.message);
    return (profiles ?? []).map((p) => ({ id: p.id, nome: p.nome }));
  });