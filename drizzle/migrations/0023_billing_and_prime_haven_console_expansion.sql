-- Migration 0023: Billing and Prime Haven console expansion
-- Automated risk flag checks, approval reasons, and tenant backup tables

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS approval_risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_reason text,
  ADD COLUMN IF NOT EXISTS correction_requested_at timestamptz;

CREATE TABLE IF NOT EXISTS public.tenant_backup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  kind text NOT NULL DEFAULT 'backup' CHECK (kind IN ('backup','pre_restore','restore')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','expired')),
  storage_path text,
  schema_version integer NOT NULL DEFAULT 1,
  byte_size bigint NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  checksum text,
  record_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_backup_id uuid REFERENCES public.tenant_backup_jobs(id) ON DELETE SET NULL,
  error_summary text,
  expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_backup_jobs TO authenticated;
GRANT ALL ON public.tenant_backup_jobs TO service_role;
ALTER TABLE public.tenant_backup_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_backup_jobs' AND policyname = 'Platform operators manage tenant backup jobs'
  ) THEN
    CREATE POLICY "Platform operators manage tenant backup jobs"
      ON public.tenant_backup_jobs FOR ALL TO authenticated
      USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_name text, p_subdomain text, p_tier public.tenant_tier,
  p_contact_email text DEFAULT NULL, p_contact_phone text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  v_branch uuid;
  v_sub text;
  v_start date := current_date;
  v_email text := lower(trim(coalesce(p_contact_email, '')));
  v_phone text := public.normalize_phone_gh(p_contact_phone);
  v_risk_flags jsonb := '[]'::jsonb;
  v_domain text;
  v_initial_approval text := 'approved';
  v_initial_status public.tenant_status := 'active';
  v_recent_signups int;
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

  -- Automated risk checks
  IF v_email LIKE '%@%' THEN
    v_domain := split_part(v_email, '@', 2);
    IF v_domain IN ('mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'throwawaymail.com', 'trashmail.com', 'yopmail.com', 'sharklasers.com', 'getairmail.com', 'dispostable.com') THEN
      v_risk_flags := v_risk_flags || jsonb_build_array('Disposable email domain: ' || v_domain);
    END IF;
  ELSE
    v_risk_flags := v_risk_flags || jsonb_build_array('Incomplete contact email provided');
  END IF;

  IF length(coalesce(v_phone, '')) < 9 THEN
    v_risk_flags := v_risk_flags || jsonb_build_array('Incomplete or missing contact phone number');
  ELSIF EXISTS (SELECT 1 FROM public.tenants WHERE contact_phone = v_phone LIMIT 1) THEN
    v_risk_flags := v_risk_flags || jsonb_build_array('Contact phone matches an existing registered church');
  END IF;

  IF lower(trim(p_name)) IN ('test', 'demo', 'asdf', 'sample church', 'fake church', 'testing') THEN
    v_risk_flags := v_risk_flags || jsonb_build_array('Placeholder church name detected');
  END IF;

  SELECT count(*) INTO v_recent_signups FROM public.tenants
  WHERE created_at > now() - interval '24 hours' AND contact_phone = v_phone;
  IF v_recent_signups > 0 THEN
    v_risk_flags := v_risk_flags || jsonb_build_array('Multiple signups within 24 hours from same contact');
  END IF;

  -- Flagged registrations enter Prime Haven review; normal clean ones open immediately
  IF jsonb_array_length(v_risk_flags) > 0 THEN
    v_initial_approval := 'pending_approval';
    v_initial_status := 'suspended';
  ELSE
    v_initial_approval := 'approved';
    v_initial_status := 'active';
  END IF;

  BEGIN
    INSERT INTO public.tenants (name, subdomain, tier, contact_email, contact_phone, approval_status, approval_risk_flags, status, trial_ends_at, approved_at)
    VALUES (trim(p_name), v_sub, p_tier, nullif(v_email,''), v_phone, v_initial_approval, v_risk_flags, v_initial_status, now() + interval '14 days', CASE WHEN v_initial_approval = 'approved' THEN now() ELSE NULL END)
    RETURNING id INTO v_tenant;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That check-in address is already taken';
  END;

  INSERT INTO public.branches (tenant_id, name, is_default) VALUES (v_tenant, 'Main', true) RETURNING id INTO v_branch;
  INSERT INTO public.tenant_users (tenant_id, user_id, role, branch_id) VALUES (v_tenant, auth.uid(), 'owner', v_branch);
  INSERT INTO public.subscriptions (tenant_id, tier, period_start, period_end) VALUES (v_tenant, p_tier, v_start, v_start + 14);

  IF p_tier IN ('standard','premium') THEN
    INSERT INTO public.structure_levels (tenant_id, name, rank) VALUES (v_tenant, 'Leader', 1);
  END IF;

  PERFORM public.log_audit(v_tenant, 'tenant.provisioned', v_sub, jsonb_build_object('tier', p_tier, 'trial_days', 14, 'approval_status', v_initial_approval, 'risk_flags', v_risk_flags));
  RETURN v_tenant;
END; $$;

REVOKE ALL ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) TO authenticated;
