-- ==============================================================================
-- Mene:Log Database Schema: Platform Overview Analytics & Enhanced Audit Trail
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor).
-- This script is idempotent, safe to run multiple times, and enables:
--   1. Enhanced platform_audit_events table with category, severity & actor metadata.
--   2. Helper procedure public.log_platform_audit for administrative event tracking.
--   3. Aggregated time-series trend procedure public.get_platform_metrics_trend.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Upgrade public.platform_audit_events
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all enhanced columns exist
ALTER TABLE public.platform_audit_events
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS actor_username text,
  ADD COLUMN IF NOT EXISTS tenant_name text;

-- Add check constraints if not present (using safe DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_audit_events_category_check'
  ) THEN
    ALTER TABLE public.platform_audit_events
      ADD CONSTRAINT platform_audit_events_category_check
      CHECK (category IN ('tenant', 'system', 'security', 'commercial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_audit_events_severity_check'
  ) THEN
    ALTER TABLE public.platform_audit_events
      ADD CONSTRAINT platform_audit_events_severity_check
      CHECK (severity IN ('info', 'warning', 'critical'));
  END IF;
END $$;

-- Indexes for lightning-fast queries and filtering in the console
CREATE INDEX IF NOT EXISTS platform_audit_events_created_idx
  ON public.platform_audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_events_category_idx
  ON public.platform_audit_events(category, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_events_severity_idx
  ON public.platform_audit_events(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_events_actor_idx
  ON public.platform_audit_events(actor_username);

CREATE INDEX IF NOT EXISTS platform_audit_events_tenant_idx
  ON public.platform_audit_events(tenant_id);

-- Backfill metadata on existing audit records
UPDATE public.platform_audit_events
SET
  category = CASE
    WHEN action LIKE 'tenant.%' OR action LIKE 'branch.%' THEN 'tenant'
    WHEN action LIKE 'operator.%' OR action LIKE '%password%' OR action LIKE '%auth%' THEN 'security'
    WHEN action LIKE '%pricing%' OR action LIKE '%coupon%' OR action LIKE '%payment%' OR action LIKE '%billing%' THEN 'commercial'
    ELSE 'system'
  END,
  severity = CASE
    WHEN action LIKE '%purged%' OR action LIKE '%delete%' OR action LIKE '%removed%' OR action LIKE '%maintenance%' THEN 'critical'
    WHEN action LIKE '%warning%' OR action LIKE '%reject%' OR action LIKE '%flag%' OR action LIKE '%reset%' OR action LIKE '%lockdown%' OR action LIKE '%broadcast%' THEN 'warning'
    ELSE 'info'
  END
WHERE category = 'system' AND severity = 'info';

-- RLS & Grants
GRANT SELECT, INSERT ON public.platform_audit_events TO authenticated;
GRANT ALL ON public.platform_audit_events TO service_role;
ALTER TABLE public.platform_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform admins read platform audit" ON public.platform_audit_events;
CREATE POLICY "platform admins read platform audit" ON public.platform_audit_events
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "service role manages platform audit" ON public.platform_audit_events;
CREATE POLICY "service role manages platform audit" ON public.platform_audit_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 2. Stored Procedure: public.log_platform_audit
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_platform_audit(
  p_action text,
  p_category text DEFAULT 'system',
  p_severity text DEFAULT 'info',
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_username text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_tenant_name text DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_actor_id uuid;
  v_tenant_name text;
BEGIN
  v_actor_id := coalesce(p_actor_user_id, auth.uid());

  -- If tenant_name was not provided, look it up from tenants table if tenant_id is valid
  IF p_tenant_name IS NULL AND p_tenant_id IS NOT NULL THEN
    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = p_tenant_id LIMIT 1;
  ELSE
    v_tenant_name := p_tenant_name;
  END IF;

  INSERT INTO public.platform_audit_events (
    action,
    category,
    severity,
    actor_user_id,
    actor_username,
    tenant_id,
    tenant_name,
    detail
  ) VALUES (
    p_action,
    coalesce(p_category, 'system'),
    coalesce(p_severity, 'info'),
    v_actor_id,
    p_actor_username,
    p_tenant_id,
    v_tenant_name,
    coalesce(p_detail, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_platform_audit TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 3. Analytics Aggregation: public.get_platform_metrics_trend(p_days)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_metrics_trend(p_days int DEFAULT 30)
RETURNS TABLE (
  day_date date,
  checkins bigint,
  new_churches bigint,
  active_churches bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
BEGIN
  -- Verify operator / platform admin access
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  v_days := coalesce(p_days, 30);
  IF v_days < 7 THEN v_days := 7; END IF;
  IF v_days > 180 THEN v_days := 180; END IF;

  RETURN QUERY
  WITH day_series AS (
    SELECT generate_series(
      (current_date - (v_days || ' days')::interval)::date,
      current_date,
      '1 day'::interval
    )::date AS day_dt
  ),
  att_agg AS (
    SELECT
      recorded_at::date AS att_date,
      count(*) AS cnt,
      count(DISTINCT tenant_id) AS church_cnt
    FROM public.attendance
    WHERE recorded_at >= (current_date - (v_days || ' days')::interval)
    GROUP BY recorded_at::date
  ),
  church_agg AS (
    SELECT
      created_at::date AS ch_date,
      count(*) AS cnt
    FROM public.tenants
    WHERE created_at >= (current_date - (v_days || ' days')::interval)
    GROUP BY created_at::date
  )
  SELECT
    d.day_dt AS day_date,
    coalesce(a.cnt, 0)::bigint AS checkins,
    coalesce(c.cnt, 0)::bigint AS new_churches,
    coalesce(a.church_cnt, 0)::bigint AS active_churches
  FROM day_series d
  LEFT JOIN att_agg a ON a.att_date = d.day_dt
  LEFT JOIN church_agg c ON c.ch_date = d.day_dt
  ORDER BY d.day_dt ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_metrics_trend TO authenticated, service_role;
