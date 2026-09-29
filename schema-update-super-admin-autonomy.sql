-- ==============================================================================
-- Mene:Log Database Schema: Super Admin Autonomy & Complete Church Purge Suite
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor).
-- This script is safe, idempotent, and grants full database control to operators.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Global Platform System State (Maintenance Mode & Platform Broadcast Banner)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_system_state (
  id text PRIMARY KEY DEFAULT 'current',
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text DEFAULT 'Mene:Log is currently undergoing scheduled platform maintenance. Services will resume shortly.',
  pause_signups boolean NOT NULL DEFAULT false,
  global_banner_enabled boolean NOT NULL DEFAULT false,
  global_banner_message text DEFAULT '',
  global_banner_level text NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
  global_banner_show_on_checkin boolean NOT NULL DEFAULT true,
  global_banner_show_on_admin boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Seed initial row if not present
INSERT INTO public.platform_system_state (id)
VALUES ('current')
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.platform_system_state TO anon, authenticated;
GRANT ALL ON public.platform_system_state TO service_role;

ALTER TABLE public.platform_system_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read platform system state" ON public.platform_system_state;
CREATE POLICY "Public can read platform system state" ON public.platform_system_state
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Super admins can update system state" ON public.platform_system_state;
CREATE POLICY "Super admins can update system state" ON public.platform_system_state
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());


-- ------------------------------------------------------------------------------
-- 2. Complete Church Purge Stored Procedure (Cascading Hard Delete)
-- ------------------------------------------------------------------------------
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS proc_name 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'platform_purge_tenant'
      AND n.nspname = 'public'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.proc_name || ' CASCADE;';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.platform_purge_tenant(
  p_tenant_id uuid,
  p_confirm_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_church_name text;
  v_subdomain text;
  v_tier public.tenant_tier;
  v_stats jsonb;
  v_deleted_members int := 0;
  v_deleted_attendance int := 0;
  v_deleted_branches int := 0;
BEGIN
  -- 1. Security Check: Only platform super admins can execute a hard purge
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Only Prime Haven platform operators can execute a complete church purge.';
  END IF;

  -- 2. Verify target church exists
  SELECT name, subdomain, tier INTO v_church_name, v_subdomain, v_tier
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Church with ID % was not found.', p_tenant_id;
  END IF;

  -- 3. Safety Confirmation Match
  IF lower(trim(p_confirm_name)) <> lower(trim(v_church_name)) THEN
    RAISE EXCEPTION 'Safety check failed: Confirmation name "%" does not match church name "%".', p_confirm_name, v_church_name;
  END IF;

  -- Count records for audit receipt
  SELECT count(*) INTO v_deleted_members FROM public.members WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_deleted_attendance FROM public.attendance_records WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_deleted_branches FROM public.branches WHERE tenant_id = p_tenant_id;

  -- 4. Cascading Hard Delete of all Church Sub-entities
  DELETE FROM public.watch_sessions WHERE tenant_id = p_tenant_id;
  DELETE FROM public.attendance_records WHERE tenant_id = p_tenant_id;
  DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
  DELETE FROM public.members WHERE tenant_id = p_tenant_id;
  DELETE FROM public.services WHERE tenant_id = p_tenant_id;
  DELETE FROM public.support_tickets WHERE tenant_id = p_tenant_id;
  DELETE FROM public.structure_levels WHERE tenant_id = p_tenant_id;
  DELETE FROM public.backups WHERE tenant_id = p_tenant_id;
  DELETE FROM public.subscriptions WHERE tenant_id = p_tenant_id;
  DELETE FROM public.tenant_users WHERE tenant_id = p_tenant_id;

  -- Delete branches and unlink any child branch tenants
  UPDATE public.tenants SET parent_tenant_id = NULL WHERE parent_tenant_id = p_tenant_id;
  DELETE FROM public.branches WHERE tenant_id = p_tenant_id;

  -- Delete audit events belonging to this tenant
  DELETE FROM public.audit_events WHERE tenant_id = p_tenant_id;

  -- Finally, permanently delete the tenant row
  DELETE FROM public.tenants WHERE id = p_tenant_id;

  -- 5. Record immutable platform audit event
  v_stats := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'church_name', v_church_name,
    'subdomain', v_subdomain,
    'tier', v_tier,
    'deleted_members', v_deleted_members,
    'deleted_attendance', v_deleted_attendance,
    'deleted_branches', v_deleted_branches,
    'purged_at', now(),
    'purged_by', auth.uid()
  );

  INSERT INTO public.platform_audit_events (
    actor_user_id,
    action,
    tenant_id,
    detail
  ) VALUES (
    auth.uid(),
    'tenant.permanently_purged',
    p_tenant_id,
    v_stats
  );

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Church "' || v_church_name || '" and all associated records have been completely purged from the database.',
    'stats', v_stats
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_purge_tenant(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_purge_tenant(uuid, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 3. Super Admin Profile & Customization Function
-- ------------------------------------------------------------------------------
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS proc_name 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'platform_update_my_profile'
      AND n.nspname = 'public'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.proc_name || ' CASCADE;';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.platform_update_my_profile(
  p_username text,
  p_display_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clean_username text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Only operators can update platform profile credentials.';
  END IF;

  v_clean_username := lower(trim(p_username));
  IF length(v_clean_username) < 3 OR length(v_clean_username) > 40 THEN
    RAISE EXCEPTION 'Username must be between 3 and 40 characters.';
  END IF;

  IF v_clean_username !~ '^[a-z0-9_.-]+$' THEN
    RAISE EXCEPTION 'Username can only contain lowercase letters, numbers, underscores, and hyphens.';
  END IF;

  -- Update auth user raw metadata and operator entry
  UPDATE auth.users
  SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'operator_username', v_clean_username,
    'display_name', trim(coalesce(p_display_name, '')),
    'phone', trim(coalesce(p_phone, ''))
  )
  WHERE id = auth.uid();

  UPDATE auth.users
  SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'operator_username', v_clean_username
  )
  WHERE id = auth.uid();

  -- Record audit
  INSERT INTO public.platform_audit_events (
    actor_user_id,
    action,
    detail
  ) VALUES (
    auth.uid(),
    'operator.profile_updated',
    jsonb_build_object('username', v_clean_username, 'display_name', p_display_name)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'username', v_clean_username,
    'message', 'Operator profile updated successfully.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_update_my_profile(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_my_profile(text, text, text) TO authenticated;
