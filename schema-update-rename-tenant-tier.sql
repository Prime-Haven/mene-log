-- ==============================================================================
-- Mene:Log Database Migration: Rename tenant_tier Enum Values
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- This script renames the tenant_tier values so the database directly mirrors
-- the customer-facing package names:
--   'standard' -> 'pro'
--   'basic'    -> 'standard'
-- Final enum values: ('free', 'standard', 'pro', 'premium')
--
-- Note: Reversing the order of Step 1 will fail because Postgres does not allow
-- duplicate enum values.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Step 1: Safely & Idempotently Rename Enum Values
-- Checks current enum values first to avoid "enum label already exists" errors
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_has_basic boolean;
  v_has_standard boolean;
  v_has_pro boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e 
    JOIN pg_type t ON e.enumtypid = t.oid 
    WHERE t.typname = 'tenant_tier' AND e.enumlabel = 'basic'
  ) INTO v_has_basic;

  SELECT EXISTS (
    SELECT 1 FROM pg_enum e 
    JOIN pg_type t ON e.enumtypid = t.oid 
    WHERE t.typname = 'tenant_tier' AND e.enumlabel = 'standard'
  ) INTO v_has_standard;

  SELECT EXISTS (
    SELECT 1 FROM pg_enum e 
    JOIN pg_type t ON e.enumtypid = t.oid 
    WHERE t.typname = 'tenant_tier' AND e.enumlabel = 'pro'
  ) INTO v_has_pro;

  -- 1. If 'standard' exists and 'pro' does not yet exist: rename 'standard' -> 'pro'
  IF v_has_standard AND NOT v_has_pro THEN
    EXECUTE 'ALTER TYPE public.tenant_tier RENAME VALUE ''standard'' TO ''pro''';
    v_has_standard := false;
    v_has_pro := true;
  END IF;

  -- 2. If 'basic' exists and 'standard' does not exist: rename 'basic' -> 'standard'
  IF v_has_basic AND NOT v_has_standard THEN
    EXECUTE 'ALTER TYPE public.tenant_tier RENAME VALUE ''basic'' TO ''standard''';
    v_has_basic := false;
    v_has_standard := true;
  END IF;

  -- 3. If 'pro' was already added previously and both 'basic' and 'standard' still exist:
  IF v_has_basic AND v_has_standard AND v_has_pro THEN
    UPDATE public.tenants SET tier = 'pro' WHERE tier = 'standard';
    UPDATE public.subscriptions SET tier = 'pro' WHERE tier = 'standard';
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plan_config') THEN
      UPDATE public.plan_config SET tier = 'pro' WHERE tier = 'standard' AND NOT EXISTS (SELECT 1 FROM public.plan_config WHERE tier = 'pro');
    END IF;

    UPDATE public.tenants SET tier = 'standard' WHERE tier = 'basic';
    UPDATE public.subscriptions SET tier = 'standard' WHERE tier = 'basic';
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plan_config') THEN
      UPDATE public.plan_config SET tier = 'standard' WHERE tier = 'basic' AND NOT EXISTS (SELECT 1 FROM public.plan_config WHERE tier = 'standard');
    END IF;
  END IF;

  -- 4. Sync plan_config if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plan_config') THEN
    INSERT INTO public.plan_config (tier, config)
    VALUES ('standard', jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false, 'ask_mene', true, 'ask_mene_pro', false,
      'structure', false, 'groups', false, 'branches', false, 'leaders', false,
      'leader_hierarchy', false, 'space_addon', false, 'followups', false,
      'email', true, 'sms', false, 'whatsapp', false, 'broadcasts', false,
      'automations', false, 'watch_live', false, 'audit', true,
      'support', false, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200
    ))
    ON CONFLICT (tier) DO UPDATE SET config = EXCLUDED.config;

    INSERT INTO public.plan_config (tier, config)
    VALUES ('pro', jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true, 'ask_mene_pro', false,
      'structure', true, 'groups', true, 'branches', false, 'leaders', true,
      'leader_hierarchy', false, 'space_addon', true, 'followups', true,
      'email', true, 'sms', false, 'whatsapp', false, 'broadcasts', true,
      'automations', true, 'watch_live', false, 'audit', true,
      'support', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000
    ))
    ON CONFLICT (tier) DO UPDATE SET config = EXCLUDED.config;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- Step 2: Drop Old Function Overloads & Recreate Functions and Policies
-- ------------------------------------------------------------------------------

-- Drop all existing overloads to avoid "cannot remove parameter defaults" (ERROR 42P13)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS proc_name 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname IN ('provision_tenant', 'platform_create_tenant', 'platform_update_tenant', 'complete_verified_onboarding', 'tier_entitlements')
      AND n.nspname = 'public'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.proc_name || ' CASCADE;';
  END LOOP;
END $$;

-- Explicit drops as an additional safeguard
DROP FUNCTION IF EXISTS public.platform_create_tenant(text, text, public.tenant_tier, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.platform_create_tenant(text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.provision_tenant(text, text, public.tenant_tier, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.platform_update_tenant(uuid, text, text, public.tenant_tier, public.tenant_status, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.complete_verified_onboarding() CASCADE;
DROP FUNCTION IF EXISTS public.tier_entitlements(public.tenant_tier) CASCADE;

-- 1. tier_entitlements(p_tier)
CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier public.tenant_tier)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- If plan_config table has a live record, respect it first
    WHEN EXISTS (SELECT 1 FROM public.plan_config WHERE tier = p_tier) THEN
      (SELECT config FROM public.plan_config WHERE tier = p_tier)
    -- Fallbacks
    WHEN p_tier = 'free' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', false,
      'reports_basic', false, 'reports_advanced', false, 'ask_mene', false, 'ask_mene_pro', false,
      'structure', false, 'groups', false, 'branches', false, 'leaders', false,
      'leader_hierarchy', false, 'space_addon', false, 'followups', false,
      'email', false, 'sms', false, 'whatsapp', false, 'broadcasts', false,
      'automations', false, 'watch_live', false, 'audit', false,
      'support', false, 'staff_seats', 1, 'member_limit', 150, 'daily_messages', 0
    )
    WHEN p_tier = 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false, 'ask_mene', true, 'ask_mene_pro', false,
      'structure', false, 'groups', false, 'branches', false, 'leaders', false,
      'leader_hierarchy', false, 'space_addon', false, 'followups', false,
      'email', true, 'sms', false, 'whatsapp', false, 'broadcasts', false,
      'automations', false, 'watch_live', false, 'audit', true,
      'support', false, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200
    )
    WHEN p_tier = 'pro' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true, 'ask_mene_pro', false,
      'structure', true, 'groups', true, 'branches', false, 'leaders', true,
      'leader_hierarchy', false, 'space_addon', true, 'followups', true,
      'email', true, 'sms', false, 'whatsapp', false, 'broadcasts', true,
      'automations', true, 'watch_live', false, 'audit', true,
      'support', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000
    )
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true, 'ask_mene_pro', true,
      'structure', true, 'groups', true, 'branches', true, 'leaders', true,
      'leader_hierarchy', true, 'space_addon', true, 'followups', true,
      'email', true, 'sms', true, 'whatsapp', true, 'broadcasts', true,
      'automations', true, 'watch_live', true, 'audit', true,
      'support', true, 'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.tier_entitlements(public.tenant_tier) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tier_entitlements(public.tenant_tier) TO authenticated, service_role;

-- 2. provision_tenant(...)
CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_name text,
  p_subdomain text,
  p_tier public.tenant_tier,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  IF p_tier IN ('pro','premium') THEN
    INSERT INTO public.structure_levels (tenant_id, name, rank) VALUES (v_tenant, 'Leader', 1);
  END IF;
  PERFORM public.log_audit(v_tenant, 'tenant.provisioned', v_sub, jsonb_build_object('tier', p_tier, 'trial_days', CASE WHEN v_free THEN 0 ELSE 30 END));
  RETURN v_tenant;
END; $function$;

REVOKE ALL ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) TO authenticated;

-- 3. platform_create_tenant(...)
CREATE OR REPLACE FUNCTION public.platform_create_tenant(
  p_name text,
  p_subdomain text,
  p_tier public.tenant_tier,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_sub text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.check_rate_limit('platform_create',auth.uid()::text,15,3600) THEN RAISE EXCEPTION 'Too many church creations. Please try again later.'; END IF;
  IF length(btrim(coalesce(p_name,'')))<2 OR length(p_name)>120 THEN RAISE EXCEPTION 'Enter a valid church name'; END IF;
  v_sub:=lower(btrim(coalesce(p_subdomain,'')));
  IF v_sub !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' THEN RAISE EXCEPTION 'Subdomain must be 3-40 lowercase letters, numbers or hyphens'; END IF;
  IF v_sub IN ('www','admin','api','app','mail','status','support','billing','static','assets') THEN RAISE EXCEPTION 'That subdomain is reserved'; END IF;
  INSERT INTO public.tenants(name,subdomain,tier,status,contact_email,contact_phone)
    VALUES(btrim(p_name),v_sub,p_tier,'active',nullif(btrim(coalesce(p_contact_email,'')),''),public.normalize_phone_gh(p_contact_phone)) RETURNING id INTO v_id;
  INSERT INTO public.branches(tenant_id,name,is_default) VALUES(v_id,'Main',true);
  INSERT INTO public.subscriptions(tenant_id,tier) VALUES(v_id,p_tier);
  IF p_tier IN ('pro','premium') THEN INSERT INTO public.structure_levels(tenant_id,name,rank) VALUES(v_id,'Leader',1); END IF;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail)
    VALUES(auth.uid(),'tenant.created',v_id,jsonb_build_object('name',btrim(p_name),'subdomain',v_sub,'tier',p_tier));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_tenant(text,text,public.tenant_tier,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_tenant(text,text,public.tenant_tier,text,text) TO authenticated;

-- 4. platform_update_tenant(...)
CREATE OR REPLACE FUNCTION public.platform_update_tenant(
  p_tenant uuid,
  p_name text,
  p_subdomain text,
  p_tier public.tenant_tier,
  p_status public.tenant_status,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_old jsonb; v_sub text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.check_rate_limit('platform_mutation',auth.uid()::text,60,3600) THEN RAISE EXCEPTION 'Too many changes. Please try again later.'; END IF;
  IF length(btrim(coalesce(p_name,'')))<2 OR length(p_name)>120 THEN RAISE EXCEPTION 'Enter a valid church name'; END IF;
  v_sub:=lower(btrim(coalesce(p_subdomain,'')));
  IF v_sub !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' THEN RAISE EXCEPTION 'Subdomain must be 3-40 lowercase letters, numbers or hyphens'; END IF;
  IF v_sub IN ('www','admin','api','app','mail','status','support','billing','static','assets') THEN RAISE EXCEPTION 'That subdomain is reserved'; END IF;
  SELECT jsonb_build_object('name',name,'subdomain',subdomain,'tier',tier,'status',status) INTO v_old FROM public.tenants WHERE id=p_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  UPDATE public.tenants SET name=btrim(p_name),subdomain=v_sub,tier=p_tier,status=p_status,
    contact_email=nullif(btrim(coalesce(p_contact_email,'')),''),
    contact_phone=public.normalize_phone_gh(p_contact_phone) WHERE id=p_tenant;
  UPDATE public.subscriptions SET tier=p_tier WHERE tenant_id=p_tenant;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail)
    VALUES(auth.uid(),'tenant.updated',p_tenant,jsonb_build_object('before',v_old,'after',jsonb_build_object('name',btrim(p_name),'subdomain',v_sub,'tier',p_tier,'status',p_status)));
END;
$$;

REVOKE ALL ON FUNCTION public.platform_update_tenant(uuid,text,text,public.tenant_tier,public.tenant_status,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_tenant(uuid,text,text,public.tenant_tier,public.tenant_status,text,text) TO authenticated;

-- 5. Update RLS policies referencing leader role eligibility on pro/premium
DROP POLICY IF EXISTS "admins manage accounts" ON public.tenant_users;
CREATE POLICY "admins manage accounts" ON public.tenant_users FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_admin(tenant_id)
    AND role <> 'platform_admin'
    AND (role <> 'branch_admin' OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.tier = 'premium'))
    AND (role <> 'leader' OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.tier IN ('pro','premium'))));

DROP POLICY IF EXISTS "levels owner write" ON public.structure_levels;
CREATE POLICY "levels owner write" ON public.structure_levels FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.tier IN ('pro','premium')))
  WITH CHECK (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.tier IN ('pro','premium')));

-- 6. complete_verified_onboarding()
CREATE OR REPLACE FUNCTION public.complete_verified_onboarding()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user auth.users;
  v_meta jsonb;
  v_tier public.tenant_tier;
BEGIN
  IF auth.uid() IS NULL THEN 
    RAISE EXCEPTION 'Not authenticated'; 
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
  IF v_user.id IS NULL OR v_user.email_confirmed_at IS NULL THEN 
    RAISE EXCEPTION 'Confirm your email before continuing'; 
  END IF;

  SELECT tenant_id INTO STRICT v_user.id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1;
  RETURN v_user.id;

EXCEPTION WHEN no_data_found THEN
  SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
  v_meta := coalesce(v_user.raw_user_meta_data, '{}'::jsonb);
  
  IF coalesce(v_meta->>'onboarding_version','') <> '1' THEN 
    RAISE EXCEPTION 'Onboarding details are missing. Please restart registration.'; 
  END IF;

  IF coalesce(v_meta->>'tier','') NOT IN ('free', 'standard', 'pro', 'premium') THEN 
    RAISE EXCEPTION 'Invalid package selection'; 
  END IF;

  v_tier := (v_meta->>'tier')::public.tenant_tier;

  RETURN public.provision_tenant(
    v_meta->>'church_name',
    v_meta->>'subdomain',
    v_tier,
    coalesce(nullif(v_meta->>'church_email',''), v_user.email),
    coalesce(nullif(v_meta->>'church_phone',''), nullif(v_meta->>'phone',''))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_verified_onboarding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_verified_onboarding() TO authenticated;
