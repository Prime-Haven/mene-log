-- Mene:Log premium upgrade: live plan feature switches, trial -> Free, WhatsApp,
-- Watch Live, branch churches and leader hierarchy columns.
-- Run the whole file once in the SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.plan_config (
  tier public.tenant_tier PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.plan_config TO anon, authenticated;
GRANT ALL ON public.plan_config TO service_role;
ALTER TABLE public.plan_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Plan config is public" ON public.plan_config;
CREATE POLICY "Plan config is public" ON public.plan_config FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.plan_config (tier, config)
SELECT t, (
  CASE
    WHEN t::text = 'free' THEN jsonb_build_object('members',true,'services',true,'checkin',true,'qr',true,'branding',false,'reports_basic',false,'reports_advanced',false,'ask_mene',false,'ask_mene_pro',false,'structure',false,'groups',false,'branches',false,'leaders',false,'leader_hierarchy',false,'space_addon',false,'followups',false,'email',false,'sms',false,'whatsapp',false,'broadcasts',false,'automations',false,'watch_live',false,'audit',false,'staff_seats',1,'member_limit',150,'daily_messages',0)
    WHEN t::text = 'basic' THEN jsonb_build_object('members',true,'services',true,'checkin',true,'qr',true,'branding',true,'reports_basic',true,'reports_advanced',false,'ask_mene',true,'ask_mene_pro',false,'structure',false,'groups',false,'branches',false,'leaders',false,'leader_hierarchy',false,'space_addon',false,'followups',false,'email',true,'sms',false,'whatsapp',false,'broadcasts',false,'automations',false,'watch_live',false,'audit',true,'staff_seats',3,'member_limit',500,'daily_messages',200)
    WHEN t::text = 'standard' THEN jsonb_build_object('members',true,'services',true,'checkin',true,'qr',true,'branding',true,'reports_basic',true,'reports_advanced',true,'ask_mene',true,'ask_mene_pro',false,'structure',true,'groups',true,'branches',false,'leaders',true,'leader_hierarchy',false,'space_addon',true,'followups',true,'email',true,'sms',false,'whatsapp',false,'broadcasts',true,'automations',true,'watch_live',false,'audit',true,'staff_seats',10,'member_limit',3000,'daily_messages',1000)
    ELSE jsonb_build_object('members',true,'services',true,'checkin',true,'qr',true,'branding',true,'reports_basic',true,'reports_advanced',true,'ask_mene',true,'ask_mene_pro',true,'structure',true,'groups',true,'branches',true,'leaders',true,'leader_hierarchy',true,'space_addon',true,'followups',true,'email',true,'sms',true,'whatsapp',true,'broadcasts',true,'automations',true,'watch_live',true,'audit',true,'staff_seats',40,'member_limit',25000,'daily_messages',5000)
  END)
FROM unnest(enum_range(NULL::public.tenant_tier)) AS t
ON CONFLICT (tier) DO NOTHING;

-- The database now reads the same switches the console edits.
CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier public.tenant_tier)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT config FROM public.plan_config WHERE tier = p_tier), '{}'::jsonb) $$;

CREATE OR REPLACE FUNCTION public.platform_set_plan_config(p_tier public.tenant_tier, p_key text, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_key !~ '^[a-z_]{2,40}$' THEN RAISE EXCEPTION 'Invalid feature'; END IF;
  IF jsonb_typeof(p_value) NOT IN ('boolean','number') THEN RAISE EXCEPTION 'Invalid value'; END IF;
  UPDATE public.plan_config
     SET config = config || jsonb_build_object(p_key, p_value), updated_at = now(), updated_by = auth.uid()
   WHERE tier = p_tier;
  INSERT INTO public.platform_audit_events (actor_user_id, action, detail)
  VALUES (auth.uid(), 'plan.feature_set', jsonb_build_object('tier', p_tier, 'key', p_key, 'value', p_value));
END $$;
REVOKE ALL ON FUNCTION public.platform_set_plan_config(public.tenant_tier, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_plan_config(public.tenant_tier, text, jsonb) TO authenticated;

-- Trials that end without payment fall back to Free forever. Records are kept.
CREATE OR REPLACE FUNCTION public.revert_expired_trials()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.tenants t SET tier = 'free', status = 'active'
  WHERE t.tier <> 'free' AND t.trial_ends_at IS NOT NULL AND t.trial_ends_at < now()
    AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.tenant_id = t.id AND p.status = 'success');
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.subscriptions s SET tier = 'free', period_end = '9999-12-31'
  FROM public.tenants t WHERE t.id = s.tenant_id AND t.tier = 'free' AND s.tier <> 'free';
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.revert_expired_trials() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_expired_trials() TO service_role;

-- WhatsApp
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false;

-- Watch Live
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS stream_url text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS online_min_minutes smallint NOT NULL DEFAULT 20;
ALTER TYPE public.attendance_method ADD VALUE IF NOT EXISTS 'online';

CREATE TABLE IF NOT EXISTS public.watch_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_ping timestamptz NOT NULL DEFAULT now(),
  seconds integer NOT NULL DEFAULT 0,
  UNIQUE (service_id, member_id)
);
CREATE INDEX IF NOT EXISTS watch_sessions_tenant_idx ON public.watch_sessions (tenant_id, service_id);
GRANT SELECT ON public.watch_sessions TO authenticated;
GRANT ALL ON public.watch_sessions TO service_role;
ALTER TABLE public.watch_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Church staff read watch sessions" ON public.watch_sessions;
CREATE POLICY "Church staff read watch sessions" ON public.watch_sessions FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- Branch churches and leader hierarchy
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS parent_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tenants_parent_idx ON public.tenants (parent_tenant_id);
ALTER TABLE public.leader_profiles ADD COLUMN IF NOT EXISTS level_id uuid REFERENCES public.structure_levels(id) ON DELETE SET NULL;
ALTER TABLE public.leader_profiles ADD COLUMN IF NOT EXISTS parent_leader_id uuid REFERENCES public.leader_profiles(id) ON DELETE SET NULL;
