-- Mene:Log — Free plan. Run once in the backend SQL editor.
-- Step 1 must be committed before step 2, so run them as two separate runs if your editor wraps everything in one transaction.

-- 1) Add the Free package
ALTER TYPE public.tenant_tier ADD VALUE IF NOT EXISTS 'free' BEFORE 'basic';

-- 2) Free plan features (branded check-in, QR attendance, member registry, Excel export; 1 seat, 150 members, no messages)
CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier tenant_tier)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_tier::text = 'free' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', false,
      'reports_basic', false, 'reports_advanced', false, 'ask_mene', false,
      'structure', false, 'groups', false, 'branches', false,
      'leaders', false, 'space_addon', false, 'followups', false,
      'email', false, 'sms', false, 'broadcasts', false, 'automations', false,
      'audit', false, 'staff_seats', 1, 'member_limit', 150, 'daily_messages', 0)
    WHEN p_tier::text = 'basic' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false, 'ask_mene', true,
      'structure', false, 'groups', false, 'branches', false,
      'leaders', false, 'space_addon', false, 'followups', false,
      'email', true, 'sms', false, 'broadcasts', false, 'automations', false,
      'audit', true, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200)
    WHEN p_tier::text = 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', false,
      'leaders', true, 'space_addon', true, 'followups', true,
      'email', true, 'sms', false, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000)
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', true,
      'leaders', true, 'space_addon', true, 'followups', true,
      'email', true, 'sms', true, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000)
  END
$function$;

-- 3) Free churches get no trial and never lapse
CREATE OR REPLACE FUNCTION public.provision_tenant(p_name text, p_subdomain text, p_tier tenant_tier, p_contact_email text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid; v_branch uuid; v_sub text; v_start date := current_date; v_free boolean := p_tier::text = 'free';
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
            CASE WHEN v_free THEN NULL ELSE now() + interval '14 days' END)
    RETURNING id INTO v_tenant;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That check-in address is already taken';
  END;
  INSERT INTO public.branches (tenant_id, name, is_default) VALUES (v_tenant, 'Main', true) RETURNING id INTO v_branch;
  INSERT INTO public.tenant_users (tenant_id, user_id, role, branch_id) VALUES (v_tenant, auth.uid(), 'owner', v_branch);
  INSERT INTO public.subscriptions (tenant_id, tier, period_start, period_end)
  VALUES (v_tenant, p_tier, v_start, CASE WHEN v_free THEN DATE '9999-12-31' ELSE v_start + 14 END);
  IF p_tier IN ('standard','premium') THEN
    INSERT INTO public.structure_levels (tenant_id, name, rank) VALUES (v_tenant, 'Leader', 1);
  END IF;
  PERFORM public.log_audit(v_tenant, 'tenant.provisioned', v_sub, jsonb_build_object('tier', p_tier, 'trial_days', CASE WHEN v_free THEN 0 ELSE 14 END));
  RETURN v_tenant;
END; $function$;
