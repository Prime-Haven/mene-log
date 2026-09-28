-- ==============================================================================
-- Migration 0028: Support Entitlement, Granular Account Permissions & Detailed Church Settings
-- ==============================================================================

-- 1. Add permissions column to tenant_users
ALTER TABLE public.tenant_users
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Add settings column to tenants for comprehensive owner configuration
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. Update plan_config with support entitlement & seat thresholds
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plan_config') THEN
    -- Free tier: support is locked (false), 1 staff seat (owner only)
    UPDATE public.plan_config
    SET config = config || '{"support": false, "staff_seats": 1}'::jsonb
    WHERE tier = 'free';

    -- Basic (Standard in UI): support is locked (false), 3 staff seats (1 owner + 2 staff)
    UPDATE public.plan_config
    SET config = config || '{"support": false, "staff_seats": 3}'::jsonb
    WHERE tier = 'basic';

    -- Standard (Pro in UI): support is unlocked (true), 10 staff seats
    UPDATE public.plan_config
    SET config = config || '{"support": true, "staff_seats": 10}'::jsonb
    WHERE tier = 'standard';

    -- Premium: support is unlocked (true), 40 staff seats
    UPDATE public.plan_config
    SET config = config || '{"support": true, "staff_seats": 40}'::jsonb
    WHERE tier = 'premium';
  END IF;
END $$;

-- 4. Update fallback tier_entitlements function
CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier public.tenant_tier)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    -- If plan_config table has a live record, respect it first
    WHEN EXISTS (SELECT 1 FROM public.plan_config WHERE tier = p_tier) THEN
      (SELECT config FROM public.plan_config WHERE tier = p_tier)
    -- Fallback hardcoded defaults
    WHEN p_tier = 'free' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', false,
      'reports_basic', false, 'reports_advanced', false, 'ask_mene', false, 'ask_mene_pro', false,
      'structure', false, 'groups', false, 'branches', false, 'leaders', false, 'leader_hierarchy', false,
      'space_addon', false, 'followups', false, 'email', false, 'sms', false, 'whatsapp', false,
      'broadcasts', false, 'automations', false, 'watch_live', false, 'audit', false,
      'support', false, 'staff_seats', 1, 'member_limit', 150, 'daily_messages', 0
    )
    WHEN p_tier = 'basic' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false, 'ask_mene', true, 'ask_mene_pro', false,
      'structure', false, 'groups', false, 'branches', false, 'leaders', false, 'leader_hierarchy', false,
      'space_addon', false, 'followups', false, 'email', true, 'sms', false, 'whatsapp', false,
      'broadcasts', false, 'automations', false, 'watch_live', false, 'audit', true,
      'support', false, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200
    )
    WHEN p_tier = 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true, 'ask_mene_pro', false,
      'structure', true, 'groups', true, 'branches', false, 'leaders', true, 'leader_hierarchy', false,
      'space_addon', true, 'followups', true, 'email', true, 'sms', false, 'whatsapp', false,
      'broadcasts', true, 'automations', true, 'watch_live', false, 'audit', true,
      'support', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000
    )
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true, 'ask_mene_pro', true,
      'structure', true, 'groups', true, 'branches', true, 'leaders', true, 'leader_hierarchy', true,
      'space_addon', true, 'followups', true, 'email', true, 'sms', true, 'whatsapp', true,
      'broadcasts', true, 'automations', true, 'watch_live', true, 'audit', true,
      'support', true, 'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.tier_entitlements(public.tenant_tier) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tier_entitlements(public.tenant_tier) TO authenticated, service_role;

-- 5. Helper function to update account permissions
CREATE OR REPLACE FUNCTION public.update_account_permissions(
  p_tenant uuid,
  p_account uuid,
  p_permissions jsonb,
  p_role text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_caller_role public.app_role;
  v_target record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Caller must be owner or church_admin of this church
  SELECT role INTO v_caller_role
  FROM public.tenant_users
  WHERE tenant_id = p_tenant AND user_id = auth.uid() AND status = 'active';

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'church_admin') THEN
    RAISE EXCEPTION 'Only church owners and administrators can manage permissions';
  END IF;

  SELECT * INTO v_target
  FROM public.tenant_users
  WHERE id = p_account AND tenant_id = p_tenant;

  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Team account not found'; END IF;

  -- Non-owners cannot edit the church owner's record
  IF v_target.role = 'owner' AND v_caller_role != 'owner' THEN
    RAISE EXCEPTION 'Cannot modify the church owner account';
  END IF;

  UPDATE public.tenant_users
  SET
    permissions = coalesce(p_permissions, '{}'::jsonb),
    role = CASE WHEN p_role IS NOT NULL AND p_role != '' AND v_target.role != 'owner'
                THEN p_role::public.app_role
                ELSE role END
  WHERE id = p_account AND tenant_id = p_tenant;

  PERFORM public.log_audit(
    p_tenant,
    'account.permissions_updated',
    p_account::text,
    jsonb_build_object('permissions', p_permissions, 'role', p_role),
    NULL,
    auth.uid()
  );

  RETURN jsonb_build_object('ok', true, 'account_id', p_account);
END;
$$;
REVOKE ALL ON FUNCTION public.update_account_permissions(uuid, uuid, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_account_permissions(uuid, uuid, jsonb, text) TO authenticated;

-- 6. Helper function to update comprehensive church settings
CREATE OR REPLACE FUNCTION public.update_tenant_settings(
  p_tenant uuid,
  p_settings jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_caller_role public.app_role;
  v_updated jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_caller_role
  FROM public.tenant_users
  WHERE tenant_id = p_tenant AND user_id = auth.uid() AND status = 'active';

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'church_admin') THEN
    RAISE EXCEPTION 'Only church administrators can update church settings';
  END IF;

  UPDATE public.tenants
  SET settings = coalesce(settings, '{}'::jsonb) || p_settings
  WHERE id = p_tenant
  RETURNING settings INTO v_updated;

  PERFORM public.log_audit(
    p_tenant,
    'tenant.settings_updated',
    p_tenant::text,
    p_settings,
    NULL,
    auth.uid()
  );

  RETURN jsonb_build_object('ok', true, 'settings', v_updated);
END;
$$;
REVOKE ALL ON FUNCTION public.update_tenant_settings(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_settings(uuid, jsonb) TO authenticated;

-- 7. Helper function to clear test attendance records (Owner only)
-- Deletes attendance records for this church; Member profiles, groups, and services are 100% kept!
CREATE OR REPLACE FUNCTION public.clear_test_attendance(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_caller_role public.app_role;
  v_deleted int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_caller_role
  FROM public.tenant_users
  WHERE tenant_id = p_tenant AND user_id = auth.uid() AND status = 'active';

  IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
    RAISE EXCEPTION 'Only the church owner can reset attendance data';
  END IF;

  DELETE FROM public.attendance WHERE tenant_id = p_tenant;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  PERFORM public.log_audit(
    p_tenant,
    'attendance.cleared_test_records',
    p_tenant::text,
    jsonb_build_object('records_deleted', v_deleted),
    NULL,
    auth.uid()
  );

  RETURN jsonb_build_object('ok', true, 'deleted_count', v_deleted);
END;
$$;
REVOKE ALL ON FUNCTION public.clear_test_attendance(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clear_test_attendance(uuid) TO authenticated;
