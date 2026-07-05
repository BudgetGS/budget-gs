
-- 1) Switch role-check helpers to SECURITY INVOKER (still safe: they read user_roles via existing RLS).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_gerente(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'gerente')
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'gerente' THEN 2 ELSE 3 END
  LIMIT 1
$$;

-- 2) Revoke execute on SECURITY DEFINER functions that should not be callable by app users.
REVOKE ALL ON FUNCTION public.atualizar_gasto_mensal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gerar_proximo_mes(date) FROM PUBLIC, anon, authenticated;
-- Service role keeps access for admin RPC calls; triggers execute regardless of grants.
GRANT EXECUTE ON FUNCTION public.gerar_proximo_mes(date) TO service_role;

-- 3) Add SELECT policy on lancamentos for supervisors and the row's creator.
CREATE POLICY "Supervisor read own lancamentos"
ON public.lancamentos
FOR SELECT
TO authenticated
USING (
  lancado_por = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.unidades u
    WHERE u.id = lancamentos.unidade_id
      AND u.supervisor_id = auth.uid()
  )
);
