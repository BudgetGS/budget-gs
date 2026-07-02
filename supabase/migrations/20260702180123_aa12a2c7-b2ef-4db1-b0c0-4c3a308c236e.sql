
-- Broad read access for authenticated users (internal app)
CREATE POLICY "Authenticated read profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read user_roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read unidades" ON public.unidades
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read budgets" ON public.budgets_mensais
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read lancamentos" ON public.lancamentos
  FOR SELECT TO authenticated USING (true);

-- Any signed-in user can insert lancamentos in any unit; must record themselves as lancado_por
DROP POLICY IF EXISTS "Supervisor manage own lancamentos" ON public.lancamentos;
CREATE POLICY "Authenticated insert lancamentos" ON public.lancamentos
  FOR INSERT TO authenticated WITH CHECK (lancado_por = auth.uid());
CREATE POLICY "Supervisor delete own lancamentos" ON public.lancamentos
  FOR DELETE TO authenticated
  USING (
    lancado_por = auth.uid()
    OR EXISTS (SELECT 1 FROM public.unidades u WHERE u.id = lancamentos.unidade_id AND u.supervisor_id = auth.uid())
  );

-- Trigger runs with elevated rights so gasto recalculates across all units.
ALTER FUNCTION public.atualizar_gasto_mensal() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.atualizar_gasto_mensal() FROM PUBLIC, anon, authenticated;
