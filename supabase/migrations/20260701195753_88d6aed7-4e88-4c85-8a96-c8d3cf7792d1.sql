
-- ============ ENUM roles ============
CREATE TYPE public.app_role AS ENUM ('admin', 'gerente', 'supervisor');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ has_role security definer ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_gerente(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'gerente')
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'gerente' THEN 2 ELSE 3 END
  LIMIT 1
$$;

-- ============ PROFILES policies ============
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Admin/gerente read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin_or_gerente(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Admin manage profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ USER ROLES policies ============
CREATE POLICY "Users read own role" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admin/gerente read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_admin_or_gerente(auth.uid()));
CREATE POLICY "Admin manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ UNIDADES ============
CREATE TABLE public.unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  budget_base NUMERIC(14,2) NOT NULL DEFAULT 0,
  supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades TO authenticated;
GRANT ALL ON public.unidades TO service_role;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/gerente manage unidades" ON public.unidades
  FOR ALL TO authenticated
  USING (public.is_admin_or_gerente(auth.uid()))
  WITH CHECK (public.is_admin_or_gerente(auth.uid()));
CREATE POLICY "Supervisor reads own unidades" ON public.unidades
  FOR SELECT TO authenticated
  USING (supervisor_id = auth.uid());

-- ============ BUDGETS MENSAIS ============
CREATE TABLE public.budgets_mensais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  mes DATE NOT NULL,
  budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  gasto NUMERIC(14,2) NOT NULL DEFAULT 0,
  atualizado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, mes),
  CHECK (EXTRACT(DAY FROM mes) = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets_mensais TO authenticated;
GRANT ALL ON public.budgets_mensais TO service_role;
ALTER TABLE public.budgets_mensais ENABLE ROW LEVEL SECURITY;

CREATE INDEX budgets_mensais_mes_idx ON public.budgets_mensais(mes);
CREATE INDEX budgets_mensais_unidade_idx ON public.budgets_mensais(unidade_id);

CREATE POLICY "Admin/gerente manage budgets" ON public.budgets_mensais
  FOR ALL TO authenticated
  USING (public.is_admin_or_gerente(auth.uid()))
  WITH CHECK (public.is_admin_or_gerente(auth.uid()));

CREATE POLICY "Supervisor read own budgets" ON public.budgets_mensais
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.unidades u
    WHERE u.id = unidade_id AND u.supervisor_id = auth.uid()
  ));
CREATE POLICY "Supervisor update own budgets" ON public.budgets_mensais
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.unidades u
    WHERE u.id = unidade_id AND u.supervisor_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.unidades u
    WHERE u.id = unidade_id AND u.supervisor_id = auth.uid()
  ));

-- ============ trigger updated_at ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER unidades_updated_at BEFORE UPDATE ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ auto-create profile on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  -- First user becomes admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'supervisor'));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ Gerar próximo mês com rollover ============
CREATE OR REPLACE FUNCTION public.gerar_proximo_mes(_mes DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_mes DATE := date_trunc('month', _mes)::date;
  _prev_mes DATE := (date_trunc('month', _mes) - INTERVAL '1 month')::date;
  _count INTEGER := 0;
  u RECORD;
  _prev_budget NUMERIC;
  _prev_gasto NUMERIC;
  _new_budget NUMERIC;
BEGIN
  IF NOT public.is_admin_or_gerente(auth.uid()) THEN
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
END; $$;

GRANT EXECUTE ON FUNCTION public.gerar_proximo_mes(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_gerente(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
