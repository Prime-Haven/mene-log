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

ALTER TABLE public.watch_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'watch_sessions' AND policyname = 'watch_sessions_service_role'
  ) THEN
    CREATE POLICY "watch_sessions_service_role" ON public.watch_sessions FOR ALL TO service_role USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'watch_sessions' AND policyname = 'watch_sessions_tenant_read'
  ) THEN
    CREATE POLICY "watch_sessions_tenant_read" ON public.watch_sessions FOR SELECT TO authenticated
      USING (public.is_tenant_member(tenant_id) OR public.is_platform_admin());
  END IF;
END $$;

-- 6. Guarantee unconstrained unique index on attendance(service_id, member_id)
-- Allows ON CONFLICT (service_id, member_id) to work reliably during door scans
CREATE UNIQUE INDEX IF NOT EXISTS attendance_service_member_idx
  ON public.attendance (service_id, member_id);

-- 7. Ensure plan_config table exists for Super Admin pricing and tier limits
CREATE TABLE IF NOT EXISTS public.plan_config (
  tier public.tenant_tier PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- 8. Ensure tenant_backup_jobs table exists with production columns
CREATE TABLE IF NOT EXISTS public.tenant_backup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  kind text NOT NULL DEFAULT 'backup',
  status text NOT NULL DEFAULT 'pending',
  storage_path text,
  schema_version integer NOT NULL DEFAULT 1,
  byte_size bigint NOT NULL DEFAULT 0,
  checksum text,
  record_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_backup_id uuid REFERENCES public.tenant_backup_jobs(id) ON DELETE SET NULL,
  error_summary text,
  expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all expected columns exist if the table was created earlier with a partial schema
DO $$
BEGIN
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'backup';
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS storage_path text;
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS byte_size bigint NOT NULL DEFAULT 0;
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS checksum text;
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS record_counts jsonb NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS source_backup_id uuid REFERENCES public.tenant_backup_jobs(id) ON DELETE SET NULL;
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS error_summary text;
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS expires_at timestamptz;
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
  ALTER TABLE public.tenant_backup_jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;
END $$;

-- 9. Ensure platform_system_state table exists
CREATE TABLE IF NOT EXISTS public.platform_system_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- 10. Rate Limit cleanup index and helper
-- Rate limits in Mene:Log use created_at with sliding time windows (maximum 86400 seconds).
CREATE INDEX IF NOT EXISTS rate_limit_hits_created_idx
  ON public.rate_limit_hits (created_at);

CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_lookup_idx
  ON public.rate_limit_hits (bucket, identifier, created_at DESC);

-- Safely add index on expires_at ONLY IF the column exists on rate_limit_hits
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rate_limit_hits' AND column_name = 'expires_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS rate_limit_hits_expiry_idx ON public.rate_limit_hits (expires_at)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
  v_has_expires_at boolean;
BEGIN
  -- Rate limits older than 24 hours are expired since the maximum sliding window in Mene:Log is 86400s
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rate_limit_hits' AND column_name = 'expires_at'
  ) INTO v_has_expires_at;

  IF v_has_expires_at THEN
    EXECUTE 'DELETE FROM public.rate_limit_hits WHERE expires_at < now() OR created_at < now() - interval ''1 day''';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSE
    DELETE FROM public.rate_limit_hits
    WHERE created_at < now() - interval '1 day';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

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
