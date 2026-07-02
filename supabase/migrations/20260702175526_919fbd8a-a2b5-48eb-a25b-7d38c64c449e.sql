
-- 1. Recreate view with security_invoker so RLS is enforced as the caller
DROP VIEW IF EXISTS public.v_budgets;
CREATE VIEW public.v_budgets WITH (security_invoker = on) AS
SELECT b.id,
       b.unidade_id,
       b.mes,
       b.gasto,
       b.atualizado_por,
       b.atualizado_em,
       u.nome AS unidade_nome,
       u.supervisor_id,
       u.budget_base AS budget_fixo,
       b.budget - u.budget_base AS diferenca_mes_anterior,
       b.budget AS valor_total_mes,
       b.budget - b.gasto AS saldo,
       CASE WHEN b.budget > 0 THEN round(b.gasto / b.budget * 100, 1) ELSE NULL END AS percentual_gasto
FROM public.budgets_mensais b
JOIN public.unidades u ON u.id = b.unidade_id;

GRANT SELECT ON public.v_budgets TO authenticated;

-- 2. Set fixed search_path on trigger function missing it
ALTER FUNCTION public.atualizar_gasto_mensal() SET search_path = public;

-- 3. Revoke EXECUTE on SECURITY DEFINER functions from PUBLIC/anon/authenticated.
--    These are only called from server-side code via the service role, which bypasses these grants.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin_or_gerente(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gerar_proximo_mes(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4. Tighten avatars SELECT policy — users may only read their own folder
DROP POLICY IF EXISTS "Avatars - authenticated read" ON storage.objects;
CREATE POLICY "Avatars - user read own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
