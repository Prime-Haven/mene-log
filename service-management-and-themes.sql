-- ==============================================================================
-- Mene:Log Church Service Management, Themes, Permanent Defaults & Check-in Sync
-- Run this in your Supabase SQL Editor
-- ==============================================================================

-- 1. Add theme and is_default columns to services
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS theme text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- 2. Mark existing default services as is_default = true and set proper service_type
UPDATE public.services
SET is_default = true, service_type = 'sunday'
WHERE (service_type = 'sunday' OR name ILIKE '%Sunday Service%');

UPDATE public.services
SET is_default = true, service_type = 'midweek'
WHERE (service_type = 'midweek' OR name ILIKE '%Midweek Service%');

UPDATE public.services
SET is_default = true, service_type = 'prayer'
WHERE (service_type = 'prayer' OR name ILIKE '%Prayer Service%');

-- 3. Upgrade ensure_default_services
DROP FUNCTION IF EXISTS public.ensure_default_services(uuid, date);
DROP FUNCTION IF EXISTS public.ensure_default_services(uuid);

CREATE OR REPLACE FUNCTION public.ensure_default_services(p_tenant uuid, p_date date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_sun_date date;
  v_mid_date date;
  v_pray_date date;
  v_created int := 0;
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;

  -- Calculate nearest Sunday, Wednesday (midweek), and Friday (prayer)
  v_sun_date := p_date + ((7 - extract(dow from p_date)::int) % 7);
  v_mid_date := p_date + ((3 - extract(dow from p_date)::int + 7) % 7);
  v_pray_date := p_date + ((5 - extract(dow from p_date)::int + 7) % 7);

  -- Insert Sunday Service if not exists
  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE tenant_id = p_tenant AND (service_type = 'sunday' OR name ILIKE '%Sunday Service%') AND service_date = v_sun_date
  ) THEN
    INSERT INTO public.services (tenant_id, name, service_type, service_date, is_open, is_default)
    VALUES (p_tenant, 'Sunday Service', 'sunday', v_sun_date, true, true);
    v_created := v_created + 1;
  END IF;

  -- Insert Midweek Service if not exists
  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE tenant_id = p_tenant AND (service_type = 'midweek' OR name ILIKE '%Midweek Service%') AND service_date = v_mid_date
  ) THEN
    INSERT INTO public.services (tenant_id, name, service_type, service_date, is_open, is_default)
    VALUES (p_tenant, 'Midweek Service', 'midweek', v_mid_date, true, true);
    v_created := v_created + 1;
  END IF;

  -- Insert Prayer Service if not exists
  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE tenant_id = p_tenant AND (service_type = 'prayer' OR name ILIKE '%Prayer Service%') AND service_date = v_pray_date
  ) THEN
    INSERT INTO public.services (tenant_id, name, service_type, service_date, is_open, is_default)
    VALUES (p_tenant, 'Prayer Service', 'prayer', v_pray_date, true, true);
    v_created := v_created + 1;
  END IF;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_default_services(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_services(uuid, date) TO authenticated;

-- 4. Delete service function with protection for permanent defaults
-- Note: DROP FUNCTION is required first because previously delete_service returned void
DROP FUNCTION IF EXISTS public.delete_service(uuid);

CREATE OR REPLACE FUNCTION public.delete_service(p_service uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_svc public.services;
  v_att_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_svc FROM public.services WHERE id = p_service;
  IF v_svc.id IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;

  IF NOT public.has_tenant_role(v_svc.tenant_id, ARRAY['owner','church_admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Only church administrators can delete services';
  END IF;

  -- Default templates cannot be deleted; they must be kept permanent
  IF v_svc.is_default THEN
    RAISE EXCEPTION 'Default weekly services (Sunday, Midweek, Prayer) cannot be deleted. You can close them to disable check-in.';
  END IF;

  SELECT count(*) INTO v_att_count FROM public.attendance WHERE service_id = p_service;

  -- Delete attendance records for this service first
  DELETE FROM public.attendance WHERE service_id = p_service;
  -- Delete the service
  DELETE FROM public.services WHERE id = p_service;

  PERFORM public.log_audit(
    v_svc.tenant_id,
    'service.deleted',
    p_service::text,
    jsonb_build_object('name', v_svc.name, 'date', v_svc.service_date, 'removed_attendances', v_att_count),
    NULL,
    auth.uid()
  );

  RETURN jsonb_build_object('ok', true, 'service_id', p_service, 'name', v_svc.name);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_service(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_service(uuid) TO authenticated;

-- 5. Upgrade public_open_services RPC
-- Note: DROP FUNCTION is required first because the return table structure is expanded
DROP FUNCTION IF EXISTS public.public_open_services(text);

CREATE OR REPLACE FUNCTION public.public_open_services(p_subdomain text)
RETURNS TABLE(
  id uuid,
  name text,
  service_date date,
  service_type text,
  theme text,
  description text,
  speaker text,
  is_default boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.id,
    s.name,
    s.service_date,
    s.service_type,
    s.theme,
    s.description,
    s.speaker,
    s.is_default
  FROM public.services s
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE t.subdomain = lower(trim(coalesce(p_subdomain,'')))
    AND t.status IN ('active','grace')
    AND s.is_open = true
  ORDER BY
    CASE
      WHEN s.service_type = 'sunday' THEN 1
      WHEN s.service_type = 'midweek' THEN 2
      WHEN s.service_type = 'prayer' THEN 3
      ELSE 4
    END,
    s.service_date DESC,
    s.created_at DESC
  LIMIT 50
$$;
REVOKE ALL ON FUNCTION public.public_open_services(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_open_services(text) TO service_role;
