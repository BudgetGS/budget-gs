CREATE POLICY "Supervisor update own lancamentos"
ON public.lancamentos
FOR UPDATE
TO authenticated
USING (lancado_por = auth.uid())
WITH CHECK (lancado_por = auth.uid());