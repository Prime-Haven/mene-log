-- ==============================================================================
-- Mene:Log Database Upgrade: Online Attendance, Member Codes, Feature Matrix & Branches
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor).
-- This script is completely idempotent and safe to run multiple times.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Member Codes (Required for Online Streaming Attendance & Quick Check-in)
-- ------------------------------------------------------------------------------
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS member_code text;

CREATE UNIQUE INDEX IF NOT EXISTS members_tenant_code_uniq
  ON public.members (tenant_id, lower(member_code))
  WHERE member_code IS NOT NULL;

-- Function to generate an alphanumeric unique member code (e.g. ML-7B2K91)
CREATE OR REPLACE FUNCTION public.generate_member_code(p_tenant uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_code text;
  v_exists boolean;
  v_chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_len int := 6;
  i int;
BEGIN
  LOOP
    v_code := 'ML-';
    FOR i IN 1..v_len LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    SELECT EXISTS (
      SELECT 1 FROM public.members
      WHERE tenant_id = p_tenant AND lower(member_code) = lower(v_code)
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

-- Trigger to automatically assign member_code upon insertion
CREATE OR REPLACE FUNCTION public.members_assign_code_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.member_code IS NULL OR btrim(NEW.member_code) = '' THEN
    NEW.member_code := public.generate_member_code(NEW.tenant_id);
  ELSE
    NEW.member_code := upper(btrim(NEW.member_code));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_members_assign_code ON public.members;
CREATE TRIGGER trg_members_assign_code
  BEFORE INSERT ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.members_assign_code_trigger();

-- Backfill any existing members missing a member_code
UPDATE public.members
SET member_code = public.generate_member_code(tenant_id)
WHERE member_code IS NULL OR btrim(member_code) = '';


-- ------------------------------------------------------------------------------
-- 2. Services & Online Streaming Attendance
-- ------------------------------------------------------------------------------
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS stream_url text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS online_min_minutes smallint NOT NULL DEFAULT 20;

-- Add 'online' attendance method to attendance_method enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.attendance_method'::regtype
      AND enumlabel = 'online'
  ) THEN
    ALTER TYPE public.attendance_method ADD VALUE 'online';
  END IF;
END $$;

-- Watch sessions table: tracks real-time heartbeat and watch duration
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
CREATE INDEX IF NOT EXISTS watch_sessions_service_member_idx ON public.watch_sessions (service_id, member_id);

GRANT SELECT ON public.watch_sessions TO authenticated;
GRANT ALL ON public.watch_sessions TO service_role;

ALTER TABLE public.watch_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Church staff read watch sessions" ON public.watch_sessions;
CREATE POLICY "Church staff read watch sessions" ON public.watch_sessions FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));


-- ------------------------------------------------------------------------------
-- 3. Dynamic Plan Matrix & Super Admin Feature Toggles
-- ------------------------------------------------------------------------------
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

-- Seed default package matrix across Free, Standard (basic), Pro (standard), and Premium
INSERT INTO public.plan_config (tier, config)
SELECT t, (
  CASE
    WHEN t::text = 'free' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true,
      'branding', false, 'reports_basic', false, 'reports_advanced', false,
      'ask_mene', false, 'ask_mene_pro', false, 'structure', false,
      'groups', false, 'branches', false, 'leaders', false,
      'leader_hierarchy', false, 'space_addon', false, 'followups', false,
      'email', false, 'sms', false, 'whatsapp', false, 'broadcasts', false,
      'automations', false, 'watch_live', false, 'audit', false,
      'staff_seats', 1, 'member_limit', 150, 'daily_messages', 0
    )
    WHEN t::text = 'basic' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true,
      'branding', true, 'reports_basic', true, 'reports_advanced', false,
      'ask_mene', true, 'ask_mene_pro', false, 'structure', false,
      'groups', false, 'branches', false, 'leaders', false,
      'leader_hierarchy', false, 'space_addon', false, 'followups', false,
      'email', true, 'sms', false, 'whatsapp', false, 'broadcasts', false,
      'automations', false, 'watch_live', false, 'audit', true,
      'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200
    )
    WHEN t::text = 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true,
      'branding', true, 'reports_basic', true, 'reports_advanced', true,
      'ask_mene', true, 'ask_mene_pro', false, 'structure', true,
      'groups', true, 'branches', false, 'leaders', true,
      'leader_hierarchy', false, 'space_addon', true, 'followups', true,
      'email', true, 'sms', false, 'whatsapp', false, 'broadcasts', true,
      'automations', true, 'watch_live', false, 'audit', true,
      'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000
    )
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true,
      'branding', true, 'reports_basic', true, 'reports_advanced', true,
      'ask_mene', true, 'ask_mene_pro', true, 'structure', true,
      'groups', true, 'branches', true, 'leaders', true,
      'leader_hierarchy', true, 'space_addon', true, 'followups', true,
      'email', true, 'sms', true, 'whatsapp', true, 'broadcasts', true,
      'automations', true, 'watch_live', true, 'audit', true,
      'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000
    )
  END)
FROM unnest(enum_range(NULL::public.tenant_tier)) AS t
ON CONFLICT (tier) DO NOTHING;

-- Reads dynamic plan entitlements with fallback to empty object
CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier public.tenant_tier)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT config FROM public.plan_config WHERE tier = p_tier), '{}'::jsonb) $$;

-- RPC for Super Admin to toggle features or adjust limits live
CREATE OR REPLACE FUNCTION public.platform_set_plan_config(p_tier public.tenant_tier, p_key text, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized as platform operator';
  END IF;
  IF p_key !~ '^[a-z_]{2,40}$' THEN
    RAISE EXCEPTION 'Invalid feature key identifier';
  END IF;
  IF jsonb_typeof(p_value) NOT IN ('boolean', 'number') THEN
    RAISE EXCEPTION 'Invalid config value type';
  END IF;

  UPDATE public.plan_config
     SET config = config || jsonb_build_object(p_key, p_value),
         updated_at = now(),
         updated_by = auth.uid()
   WHERE tier = p_tier;

  INSERT INTO public.platform_audit_events (actor_user_id, action, detail)
  VALUES (auth.uid(), 'plan.feature_set', jsonb_build_object('tier', p_tier, 'key', p_key, 'value', p_value));
END $$;

REVOKE ALL ON FUNCTION public.platform_set_plan_config(public.tenant_tier, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_plan_config(public.tenant_tier, text, jsonb) TO authenticated;


-- ------------------------------------------------------------------------------
-- 4. Multi-Site Branch Network & Leader Ladder Hierarchy
-- ------------------------------------------------------------------------------
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS parent_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tenants_parent_idx ON public.tenants (parent_tenant_id);

ALTER TABLE public.leader_profiles ADD COLUMN IF NOT EXISTS level_id uuid REFERENCES public.structure_levels(id) ON DELETE SET NULL;
ALTER TABLE public.leader_profiles ADD COLUMN IF NOT EXISTS parent_leader_id uuid REFERENCES public.leader_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leader_profiles_level_idx ON public.leader_profiles (level_id);
CREATE INDEX IF NOT EXISTS leader_profiles_parent_idx ON public.leader_profiles (parent_leader_id);


-- ------------------------------------------------------------------------------
-- 5. Member Communication Options
-- ------------------------------------------------------------------------------
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------------------------
-- 6. 30-Day Trial Provisioning Stored Procedure
-- ------------------------------------------------------------------------------
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS proc_name 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname IN ('provision_tenant', 'complete_verified_onboarding', 'platform_create_tenant')
      AND n.nspname = 'public'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.proc_name || ' CASCADE;';
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.provision_tenant(text, text, public.tenant_tier, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.provision_tenant(text, text, tenant_tier, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.complete_verified_onboarding() CASCADE;
DROP FUNCTION IF EXISTS public.platform_create_tenant(text, text, public.tenant_tier, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.platform_create_tenant(text, text, tenant_tier, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_name text,
  p_subdomain text,
  p_tier public.tenant_tier,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_branch uuid;
  v_sub text;
  v_start date := CURRENT_DATE;
  v_free boolean := (p_tier = 'free');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirm your email before creating your church';
  END IF;
  IF NOT public.check_rate_limit('provision_tenant', auth.uid()::text, 5, 3600) THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'This account already belongs to a church';
  END IF;
  v_sub := lower(trim(p_subdomain));
  IF NOT public.subdomain_available(v_sub) THEN RAISE EXCEPTION 'That check-in address is not available'; END IF;
  IF length(trim(coalesce(p_name,''))) < 2 OR length(trim(p_name)) > 120 THEN RAISE EXCEPTION 'Church name must be 2 to 120 characters'; END IF;
  BEGIN
    INSERT INTO public.tenants (name, subdomain, tier, contact_email, contact_phone, approval_status, status, trial_ends_at)
    VALUES (trim(p_name), v_sub, p_tier, nullif(trim(p_contact_email),''), public.normalize_phone_gh(p_contact_phone), 'pending_approval', 'active',
            CASE WHEN v_free THEN NULL ELSE now() + interval '30 days' END)
    RETURNING id INTO v_tenant;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That check-in address is already taken';
  END;
  INSERT INTO public.branches (tenant_id, name, is_default) VALUES (v_tenant, 'Main', true) RETURNING id INTO v_branch;
  INSERT INTO public.tenant_users (tenant_id, user_id, role, branch_id) VALUES (v_tenant, auth.uid(), 'owner', v_branch);
  INSERT INTO public.subscriptions (tenant_id, tier, period_start, period_end)
  VALUES (v_tenant, p_tier, v_start, CASE WHEN v_free THEN DATE '9999-12-31' ELSE v_start + 30 END);
  IF p_tier IN ('standard','premium') THEN
    INSERT INTO public.structure_levels (tenant_id, name, rank) VALUES (v_tenant, 'Leader', 1);
  END IF;
  PERFORM public.log_audit(v_tenant, 'tenant.provisioned', v_sub, jsonb_build_object('tier', p_tier, 'trial_days', CASE WHEN v_free THEN 0 ELSE 30 END));
  RETURN v_tenant;
END; $function$;

-- ==============================================================================
-- End of Upgrade Script
-- ==============================================================================
