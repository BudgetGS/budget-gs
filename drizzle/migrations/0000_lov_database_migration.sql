-- Permite que supervisores também gerem o próximo mês.
-- Quando chamado via service role (auth.uid() IS NULL), a verificação é ignorada
-- porque a permissão já foi validada na camada da aplicação.
CREATE OR REPLACE FUNCTION public.gerar_proximo_mes(_mes date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _target_mes DATE := date_trunc('month', _mes)::date;
  _prev_mes DATE := (date_trunc('month', _mes) - INTERVAL '1 month')::date;
  _count INTEGER := 0;
  u RECORD;
  _prev_budget NUMERIC;
  _prev_gasto NUMERIC;
  _new_budget NUMERIC;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'gerente', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  FOR u IN SELECT id, budget_base FROM public.unidades WHERE ativo = true LOOP
    SELECT budget, gasto INTO _prev_budget, _prev_gasto
    FROM public.budgets_mensais
    WHERE unidade_id = u.id AND mes = _prev_mes;

    IF _prev_budget IS NULL THEN
      _new_budget := u.budget_base;
    ELSE
      _new_budget := u.budget_base + (_prev_budget - _prev_gasto);
    END IF;

    INSERT INTO public.budgets_mensais (unidade_id, mes, budget, gasto, atualizado_por)
    VALUES (u.id, _target_mes, _new_budget, 0, auth.uid())
    ON CONFLICT (unidade_id, mes) DO NOTHING;

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$function$