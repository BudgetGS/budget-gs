DROP VIEW IF EXISTS public.unidades_selecao;
CREATE VIEW public.unidades_selecao (id, nome) WITH (security_invoker = true) AS
  SELECT id, nome FROM public.unidades WHERE ativo = true;

GRANT SELECT ON public.unidades_selecao TO authenticated;
GRANT SELECT ON public.unidades_selecao TO service_role;

DROP POLICY IF EXISTS "Authenticated read unidades" ON public.unidades;