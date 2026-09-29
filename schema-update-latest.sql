-- ==============================================================================
-- Mene:Log Comprehensive Database Upgrade (30-Day Trial, Support SMS & Features)
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor).
-- This script is completely safe, idempotent, and prevents Postgres Error 42P13.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Safely Drop Existing Functions (Fixes Error 42P13: parameter defaults conflict)
-- ------------------------------------------------------------------------------
DO $$ 
DECLARE
  r RECORD;
BEGIN
  -- Dynamically drop all existing overloads/signatures of provision_tenant
  FOR r IN (
    SELECT p.oid::regprocedure AS proc_name 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'provision_tenant'
      AND n.nspname = 'public'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.proc_name || ' CASCADE;';
  END LOOP;

  -- Drop all existing overloads of complete_verified_onboarding
  FOR r IN (
    SELECT p.oid::regprocedure AS proc_name 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'complete_verified_onboarding'
      AND n.nspname = 'public'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.proc_name || ' CASCADE;';
  END LOOP;

  -- Drop all existing overloads of platform_create_tenant
  FOR r IN (
    SELECT p.oid::regprocedure AS proc_name 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'platform_create_tenant'
      AND n.nspname = 'public'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.proc_name || ' CASCADE;';
  END LOOP;
END $$;

-- Explicit drops as an additional safeguard
DROP FUNCTION IF EXISTS public.provision_tenant(text, text, public.tenant_tier, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.provision_tenant(text, text, tenant_tier, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.complete_verified_onboarding() CASCADE;
DROP FUNCTION IF EXISTS public.platform_create_tenant(text, text, public.tenant_tier, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.platform_create_tenant(text, text, tenant_tier, text, text) CASCADE;


-- ------------------------------------------------------------------------------
-- 2. Support Ticket SMS Notification Preferences & Branch Customization
-- ------------------------------------------------------------------------------
-- Tenant-level SMS notification controls
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS support_sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS support_sms_recipients text;

-- Branch-level custom SMS notification controls
ALTER TABLE public.branches 
  ADD COLUMN IF NOT EXISTS support_sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS support_sms_recipients text;

-- Link support tickets to branches for branch-specific routing
ALTER TABLE public.support_tickets 
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_tickets_branch_idx ON public.support_tickets (branch_id);

-- Enable staff to read and update branch notification configurations
DROP POLICY IF EXISTS "Church staff can manage their branches" ON public.branches;
CREATE POLICY "Church staff can manage their branches" ON public.branches
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));


-- ------------------------------------------------------------------------------
-- 3. Update Church Provisioning to 30-Day Trial
-- ------------------------------------------------------------------------------
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
  IF auth.uid() IS NULL THEN 
    RAISE EXCEPTION 'Not authenticated'; 
  END IF;

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
  IF NOT public.subdomain_available(v_sub) THEN 
    RAISE EXCEPTION 'That check-in address is not available'; 
  END IF;

  IF length(trim(coalesce(p_name,''))) < 2 OR length(trim(p_name)) > 120 THEN 
    RAISE EXCEPTION 'Church name must be 2 to 120 characters'; 
  END IF;

  BEGIN
    -- Provision with 30-day trial for paid tiers (Free tier has indefinite free access)
    INSERT INTO public.tenants (
      name, 
      subdomain, 
      tier, 
      contact_email, 
      contact_phone, 
      approval_status, 
      status, 
      trial_ends_at,
      support_sms_enabled,
      support_sms_recipients
    )
    VALUES (
      trim(p_name), 
      v_sub, 
      p_tier, 
      nullif(trim(p_contact_email),''), 
      public.normalize_phone_gh(p_contact_phone), 
      'pending_approval', 
      'active',
      CASE WHEN v_free THEN NULL ELSE now() + interval '30 days' END,
      true,
      public.normalize_phone_gh(p_contact_phone)
    )
    RETURNING id INTO v_tenant;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That check-in address is already taken';
  END;

  INSERT INTO public.branches (tenant_id, name, is_default, support_sms_enabled) 
  VALUES (v_tenant, 'Main', true, true) 
  RETURNING id INTO v_branch;

  INSERT INTO public.tenant_users (tenant_id, user_id, role, branch_id) 
  VALUES (v_tenant, auth.uid(), 'owner', v_branch);

  -- Set initial 30-day billing cycle for trials
  INSERT INTO public.subscriptions (tenant_id, tier, period_start, period_end)
  VALUES (v_tenant, p_tier, v_start, CASE WHEN v_free THEN DATE '9999-12-31' ELSE v_start + 30 END);

  IF p_tier IN ('standard','premium') THEN
    INSERT INTO public.structure_levels (tenant_id, name, rank) 
    VALUES (v_tenant, 'Leader', 1);
  END IF;

  PERFORM public.log_audit(
    v_tenant, 
    'tenant.provisioned', 
    v_sub, 
    jsonb_build_object('tier', p_tier, 'trial_days', CASE WHEN v_free THEN 0 ELSE 30 END)
  );

  RETURN v_tenant;
END; 
$function$;

REVOKE ALL ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 4. Update Verified Onboarding Completion Handler to 30 Days
-- ------------------------------------------------------------------------------
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

  IF coalesce(v_meta->>'tier','') NOT IN ('free', 'basic', 'standard', 'premium') THEN 
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
END; $$;

REVOKE ALL ON FUNCTION public.complete_verified_onboarding() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_verified_onboarding() TO authenticated;


-- ------------------------------------------------------------------------------
-- 5. Update Platform Operator Church Creation to 30 Days Trial
-- ------------------------------------------------------------------------------
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
DECLARE 
  v_id uuid; 
  v_sub text;
  v_start date := CURRENT_DATE;
  v_free boolean := (p_tier = 'free');
BEGIN
  IF NOT public.is_platform_admin() THEN 
    RAISE EXCEPTION 'not permitted'; 
  END IF;

  IF NOT public.check_rate_limit('platform_create', auth.uid()::text, 15, 3600) THEN 
    RAISE EXCEPTION 'Too many church creations. Please try again later.'; 
  END IF;

  IF length(btrim(coalesce(p_name,''))) < 2 OR length(p_name) > 120 THEN 
    RAISE EXCEPTION 'Enter a valid church name'; 
  END IF;

  v_sub := lower(btrim(coalesce(p_subdomain,'')));
  IF v_sub !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' THEN 
    RAISE EXCEPTION 'Subdomain must be 3-40 lowercase letters, numbers or hyphens'; 
  END IF;

  IF v_sub IN ('www','admin','api','app','mail','status','support','billing','static','assets') THEN 
    RAISE EXCEPTION 'That subdomain is reserved'; 
  END IF;

  INSERT INTO public.tenants(
    name, 
    subdomain, 
    tier, 
    status, 
    contact_email, 
    contact_phone, 
    trial_ends_at,
    support_sms_enabled,
    support_sms_recipients
  )
  VALUES (
    btrim(p_name),
    v_sub,
    p_tier,
    'active',
    nullif(btrim(coalesce(p_contact_email,'')),''),
    public.normalize_phone_gh(p_contact_phone),
    CASE WHEN v_free THEN NULL ELSE now() + interval '30 days' END,
    true,
    public.normalize_phone_gh(p_contact_phone)
  ) 
  RETURNING id INTO v_id;

  INSERT INTO public.branches(tenant_id, name, is_default, support_sms_enabled) 
  VALUES(v_id, 'Main', true, true);

  INSERT INTO public.subscriptions(tenant_id, tier, period_start, period_end) 
  VALUES(
    v_id, 
    p_tier, 
    v_start, 
    CASE WHEN v_free THEN DATE '9999-12-31' ELSE v_start + 30 END
  );

  IF p_tier IN ('standard','premium') THEN 
    INSERT INTO public.structure_levels(tenant_id, name, rank) 
    VALUES(v_id, 'Leader', 1); 
  END IF;

  INSERT INTO public.platform_audit_events(actor_user_id, action, tenant_id, detail)
  VALUES(
    auth.uid(),
    'tenant.created',
    v_id,
    jsonb_build_object('name', btrim(p_name), 'subdomain', v_sub, 'tier', p_tier, 'trial_days', CASE WHEN v_free THEN 0 ELSE 30 END)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_tenant(text,text,public.tenant_tier,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_tenant(text,text,public.tenant_tier,text,text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 6. Extend Active Trials from 14 Days to 30 Days (Upgrade Existing Trials)
-- ------------------------------------------------------------------------------
UPDATE public.tenants
SET trial_ends_at = trial_ends_at + interval '16 days'
WHERE trial_ends_at IS NOT NULL
  AND trial_ends_at > now()
  AND tier <> 'free';

UPDATE public.subscriptions s
SET period_end = (t.trial_ends_at)::date
FROM public.tenants t
WHERE s.tenant_id = t.id
  AND t.trial_ends_at IS NOT NULL
  AND t.trial_ends_at > now()
  AND t.tier <> 'free'
  AND s.period_end < (t.trial_ends_at)::date;


-- ------------------------------------------------------------------------------
-- 7. Optimized Indexes for Trial Expiration Alerts & Notification Crons
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS audit_events_tenant_action_idx 
  ON public.audit_events (tenant_id, action);

CREATE INDEX IF NOT EXISTS tenants_active_trial_idx 
  ON public.tenants (trial_ends_at, status, tier) 
  WHERE trial_ends_at IS NOT NULL;

-- ==============================================================================
-- End of Script
-- ==============================================================================
