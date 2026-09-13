CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission)
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read role_permissions"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage role_permissions"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.role_permissions (role, permission)
SELECT r.role, p.permission
FROM (VALUES ('admin'::public.app_role), ('gerente'::public.app_role), ('supervisor'::public.app_role)) AS r(role)
CROSS JOIN (VALUES
  ('view.dashboard'), ('view.budget'), ('view.historico'), ('view.relatorios'), ('view.unidades')
) AS p(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT r.role, p.permission
FROM (VALUES ('admin'::public.app_role), ('gerente'::public.app_role)) AS r(role)
CROSS JOIN (VALUES
  ('unidades.criar'), ('unidades.editar'), ('budget.editar'), ('lancamentos.excluir')
) AS p(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT r.role, p.permission
FROM (VALUES ('admin'::public.app_role), ('gerente'::public.app_role), ('supervisor'::public.app_role)) AS r(role)
CROSS JOIN (VALUES
  ('unidades.gerar_mes'), ('lancamentos.criar')
) AS p(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin'::public.app_role, 'view.configuracoes'),
  ('admin'::public.app_role, 'usuarios.gerenciar')
ON CONFLICT DO NOTHING;
