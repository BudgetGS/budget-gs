import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roleEnum = z.enum(["admin", "gerente", "supervisor"]);

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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas admin pode criar usuários");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas admin");
    if (data.user_id === context.userId) throw new Error("Não é possível excluir a si mesmo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas admin pode convidar responsáveis");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas admin");
    if (data.user_id === context.userId) throw new Error("Não é possível desativar a si mesmo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.ativo ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listResponsaveis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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