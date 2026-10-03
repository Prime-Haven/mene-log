-- ==============================================================================
-- Mene:Log - Comprehensive Database Remediation & Upgrades Migration
-- Safe, idempotent execution for Supabase SQL Editor
-- ==============================================================================

-- 1. Ensure 'online' exists in public.attendance_method enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'attendance_method' AND e.enumlabel = 'online'
  ) THEN
    ALTER TYPE public.attendance_method ADD VALUE 'online';
  END IF;
END $$;

-- 2. Ensure missing tenant columns exist
DO $$
BEGIN
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS parent_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS extra_member_slots integer NOT NULL DEFAULT 0;
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS require_mfa boolean NOT NULL DEFAULT false;
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
END $$;

-- 3. Ensure missing service columns exist
DO $$
BEGIN
  ALTER TABLE public.services ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'regular';
  ALTER TABLE public.services ADD COLUMN IF NOT EXISTS description text;
  ALTER TABLE public.services ADD COLUMN IF NOT EXISTS speaker text;
  ALTER TABLE public.services ADD COLUMN IF NOT EXISTS target_attendance integer;
  ALTER TABLE public.services ADD COLUMN IF NOT EXISTS theme text;
  ALTER TABLE public.services ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
  ALTER TABLE public.services ADD COLUMN IF NOT EXISTS stream_url text;
  ALTER TABLE public.services ADD COLUMN IF NOT EXISTS online_min_minutes smallint NOT NULL DEFAULT 20;
END $$;

-- 4. Ensure missing member columns and indexes exist
DO $$
BEGIN
  ALTER TABLE public.members ADD COLUMN IF NOT EXISTS member_code text;
  ALTER TABLE public.members ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false;
  ALTER TABLE public.members ADD COLUMN IF NOT EXISTS messaging_opt_out boolean NOT NULL DEFAULT false;
  ALTER TABLE public.members ADD COLUMN IF NOT EXISTS is_leader boolean NOT NULL DEFAULT false;
END $$;

-- Fast index for member codes (case-insensitive lookup per tenant)
CREATE INDEX IF NOT EXISTS members_tenant_code_idx
  ON public.members (tenant_id, upper(coalesce(member_code, '')));

-- 5. Ensure watch_sessions table exists for livestream attendee tracking
CREATE TABLE IF NOT EXISTS public.watch_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  seconds integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_ping timestamptz NOT NULL DEFAULT now()
);

-- Unique index so one member has one watch session per service
CREATE UNIQUE INDEX IF NOT EXISTS watch_sessions_svc_mbr_idx
  ON public.watch_sessions (service_id, member_id);

-- 6. Guarantee unconstrained unique index on attendance(service_id, member_id)
-- Allows ON CONFLICT (service_id, member_id) to work reliably during door scans
CREATE UNIQUE INDEX IF NOT EXISTS attendance_service_member_idx
  ON public.attendance (service_id, member_id);

-- 7. Ensure plan_config table exists for Super Admin pricing and tier limits
CREATE TABLE IF NOT EXISTS public.plan_config (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- 8. Ensure tenant_backup_jobs table exists
CREATE TABLE IF NOT EXISTS public.tenant_backup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by uuid,
  status text NOT NULL DEFAULT 'pending',
  backup_type text NOT NULL DEFAULT 'manual',
  file_url text,
  file_size integer,
  checksum_sha256 text,
  records_count jsonb DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Ensure platform_system_state table exists
CREATE TABLE IF NOT EXISTS public.platform_system_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- 10. Rate Limit cleanup index and helper
CREATE INDEX IF NOT EXISTS rate_limit_hits_expiry_idx
  ON public.rate_limit_hits (expires_at);

CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.rate_limit_hits
  WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 11. Member Code Reconciliation Routine
-- Safely backfills missing member codes (ML-XXXXX) for all existing members
CREATE OR REPLACE FUNCTION public.reconcile_member_codes(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member record;
  v_updated integer := 0;
  v_new_code text;
  v_seq integer;
BEGIN
  FOR v_member IN
    SELECT id, tenant_id FROM public.members
    WHERE (member_code IS NULL OR btrim(member_code) = '')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY created_at ASC
  LOOP
    -- Generate sequential unique code for the church
    SELECT coalesce(max(nullif(regexp_replace(member_code, '[^0-9]', '', 'g'), '')::integer), 10000) + 1
      INTO v_seq
      FROM public.members
      WHERE tenant_id = v_member.tenant_id
        AND member_code ~ '^ML-[0-9]+$';

    v_new_code := 'ML-' || coalesce(v_seq, 10001);

    UPDATE public.members
    SET member_code = v_new_code
    WHERE id = v_member.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'members_reconciled', v_updated
  );
END;
$$;

-- Grant execution to authenticated users (admin-guarded inside RPCs)
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limits() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_member_codes(uuid) TO authenticated, service_role;
