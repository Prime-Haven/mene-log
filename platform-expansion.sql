-- ==============================================================================
-- Mene:Log Prime Haven Console Expansion & Platform Risk Approval Schema
-- Run this script in the Supabase SQL Editor if you are updating an existing database.
-- ==============================================================================

-- 1. Ensure columns for platform risk approvals and correction requests exist
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS approval_risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_reason text,
  ADD COLUMN IF NOT EXISTS correction_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS tenants_risk_approval_idx
  ON public.tenants (approval_status, created_at DESC)
  WHERE approval_status = 'pending_approval';

-- 2. Tenant backup jobs table for isolated AES-256-GCM encrypted church backups
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

DROP POLICY IF EXISTS "Platform operators manage tenant backup jobs" ON public.tenant_backup_jobs;
CREATE POLICY "Platform operators manage tenant backup jobs"
  ON public.tenant_backup_jobs FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE UNIQUE INDEX IF NOT EXISTS tenant_backup_one_active_job_idx
  ON public.tenant_backup_jobs (tenant_id)
  WHERE status IN ('pending','running');

CREATE INDEX IF NOT EXISTS tenant_backup_jobs_tenant_created_idx
  ON public.tenant_backup_jobs (tenant_id, created_at DESC);

-- 3. Procedure to request correction for a flagged church
CREATE OR REPLACE FUNCTION public.platform_request_correction(p_tenant uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF length(trim(p_reason)) < 5 THEN RAISE EXCEPTION 'A correction reason is required (minimum 5 characters)'; END IF;
  
  UPDATE public.tenants
  SET approval_status = 'correction_requested',
      approval_reason = trim(p_reason),
      correction_requested_at = now(),
      status = 'suspended'
  WHERE id = p_tenant;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Church not found'; END IF;
  
  INSERT INTO public.platform_audit_events(actor_user_id, action, tenant_id, detail)
  VALUES (auth.uid(), 'tenant.correction_requested', p_tenant, jsonb_build_object('reason', trim(p_reason)));
END;
$$;

REVOKE ALL ON FUNCTION public.platform_request_correction(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_correction(uuid,text) TO authenticated, service_role;

-- 4. Procedure to manually flag a church for review
CREATE OR REPLACE FUNCTION public.platform_flag_church(p_tenant uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF length(trim(p_reason)) < 5 THEN RAISE EXCEPTION 'A flag reason is required (minimum 5 characters)'; END IF;
  
  UPDATE public.tenants
  SET approval_status = 'pending_approval',
      approval_reason = trim(p_reason),
      approval_risk_flags = approval_risk_flags || jsonb_build_array(trim(p_reason)),
      status = 'suspended'
  WHERE id = p_tenant;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Church not found'; END IF;
  
  INSERT INTO public.platform_audit_events(actor_user_id, action, tenant_id, detail)
  VALUES (auth.uid(), 'tenant.flagged_for_review', p_tenant, jsonb_build_object('reason', trim(p_reason)));
END;
$$;

REVOKE ALL ON FUNCTION public.platform_flag_church(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_flag_church(uuid,text) TO authenticated, service_role;
