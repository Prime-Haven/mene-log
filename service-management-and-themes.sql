-- ==============================================================================
-- Mene:Log Church Service Management, Themes, Permanent Defaults & Check-in Sync
-- Run this in your Supabase SQL Editor
-- ==============================================================================

-- 1. Allow service_date to be nullable for default templates, and add theme and is_default
ALTER TABLE public.services ALTER COLUMN service_date DROP NOT NULL;
ALTER TABLE public.services ALTER COLUMN service_date SET DEFAULT current_date;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS theme text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- 2. Consolidate and clean up duplicate services:
-- Ensure exactly one clean "Sunday Service", "Midweek Service", and "Prayer Service" per tenant
DO $$
DECLARE
  t_row RECORD;
  v_sun_id uuid;
  v_mid_id uuid;
  v_pray_id uuid;
BEGIN
  FOR t_row IN SELECT id FROM public.tenants LOOP
    -- Sunday Service canonical ID
    SELECT id INTO v_sun_id FROM public.services
    WHERE tenant_id = t_row.id AND (service_type = 'sunday' OR name ILIKE '%Sunday Service%')
    ORDER BY created_at ASC LIMIT 1;

    IF v_sun_id IS NOT NULL THEN
      -- Re-point any attendance from duplicate Sunday service rows to canonical ID
      UPDATE public.attendance SET service_id = v_sun_id
      WHERE service_id IN (
        SELECT id FROM public.services
        WHERE tenant_id = t_row.id AND id != v_sun_id AND (service_type = 'sunday' OR name ILIKE '%Sunday Service%')
      );
      -- Delete duplicate Sunday service rows
      DELETE FROM public.services
      WHERE tenant_id = t_row.id AND id != v_sun_id AND (service_type = 'sunday' OR name ILIKE '%Sunday Service%');

      -- Set clean canonical attributes (no dates attached)
      UPDATE public.services
      SET name = 'Sunday Service', service_type = 'sunday', is_default = true, is_open = true, theme = null
      WHERE id = v_sun_id;
    ELSE
      -- Insert canonical Sunday Service
      INSERT INTO public.services (tenant_id, name, service_type, is_default, is_open, service_date)
      VALUES (t_row.id, 'Sunday Service', 'sunday', true, true, current_date);
    END IF;

    -- Midweek Service canonical ID
    SELECT id INTO v_mid_id FROM public.services
    WHERE tenant_id = t_row.id AND (service_type = 'midweek' OR name ILIKE '%Midweek Service%')
    ORDER BY created_at ASC LIMIT 1;

    IF v_mid_id IS NOT NULL THEN
      UPDATE public.attendance SET service_id = v_mid_id
      WHERE service_id IN (
        SELECT id FROM public.services
        WHERE tenant_id = t_row.id AND id != v_mid_id AND (service_type = 'midweek' OR name ILIKE '%Midweek Service%')
      );
      DELETE FROM public.services
      WHERE tenant_id = t_row.id AND id != v_mid_id AND (service_type = 'midweek' OR name ILIKE '%Midweek Service%');

      UPDATE public.services
      SET name = 'Midweek Service', service_type = 'midweek', is_default = true, is_open = true, theme = null
      WHERE id = v_mid_id;
    ELSE
      INSERT INTO public.services (tenant_id, name, service_type, is_default, is_open, service_date)
      VALUES (t_row.id, 'Midweek Service', 'midweek', true, true, current_date);
    END IF;

    -- Prayer Service canonical ID
    SELECT id INTO v_pray_id FROM public.services
    WHERE tenant_id = t_row.id AND (service_type = 'prayer' OR name ILIKE '%Prayer Service%')
    ORDER BY created_at ASC LIMIT 1;

    IF v_pray_id IS NOT NULL THEN
      UPDATE public.attendance SET service_id = v_pray_id
      WHERE service_id IN (
        SELECT id FROM public.services
        WHERE tenant_id = t_row.id AND id != v_pray_id AND (service_type = 'prayer' OR name ILIKE '%Prayer Service%')
      );
      DELETE FROM public.services
      WHERE tenant_id = t_row.id AND id != v_pray_id AND (service_type = 'prayer' OR name ILIKE '%Prayer Service%');

      UPDATE public.services
      SET name = 'Prayer Service', service_type = 'prayer', is_default = true, is_open = true, theme = null
      WHERE id = v_pray_id;
    ELSE
      INSERT INTO public.services (tenant_id, name, service_type, is_default, is_open, service_date)
      VALUES (t_row.id, 'Prayer Service', 'prayer', true, true, current_date);
    END IF;
  END LOOP;
END;
$$;

-- 3. Upgrade ensure_default_services function (Drops old signatures to avoid 42P13)
DROP FUNCTION IF EXISTS public.ensure_default_services(uuid, date);
DROP FUNCTION IF EXISTS public.ensure_default_services(uuid);

CREATE OR REPLACE FUNCTION public.ensure_default_services(p_tenant uuid, p_date date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_created int := 0;
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;

  -- Ensure Sunday Service (Perpetual default, no date attached)
  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE tenant_id = p_tenant AND (service_type = 'sunday' OR name = 'Sunday Service')
  ) THEN
    INSERT INTO public.services (tenant_id, name, service_type, is_open, is_default, service_date)
    VALUES (p_tenant, 'Sunday Service', 'sunday', true, true, current_date);
    v_created := v_created + 1;
  ELSE
    UPDATE public.services SET is_open = true, is_default = true
    WHERE tenant_id = p_tenant AND (service_type = 'sunday' OR name = 'Sunday Service');
  END IF;

  -- Ensure Midweek Service (Perpetual default, no date attached)
  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE tenant_id = p_tenant AND (service_type = 'midweek' OR name = 'Midweek Service')
  ) THEN
    INSERT INTO public.services (tenant_id, name, service_type, is_open, is_default, service_date)
    VALUES (p_tenant, 'Midweek Service', 'midweek', true, true, current_date);
    v_created := v_created + 1;
  ELSE
    UPDATE public.services SET is_open = true, is_default = true
    WHERE tenant_id = p_tenant AND (service_type = 'midweek' OR name = 'Midweek Service');
  END IF;

  -- Ensure Prayer Service (Perpetual default, no date attached)
  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE tenant_id = p_tenant AND (service_type = 'prayer' OR name = 'Prayer Service')
  ) THEN
    INSERT INTO public.services (tenant_id, name, service_type, is_open, is_default, service_date)
    VALUES (p_tenant, 'Prayer Service', 'prayer', true, true, current_date);
    v_created := v_created + 1;
  ELSE
    UPDATE public.services SET is_open = true, is_default = true
    WHERE tenant_id = p_tenant AND (service_type = 'prayer' OR name = 'Prayer Service');
  END IF;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_default_services(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_services(uuid, date) TO authenticated;

-- 4. Delete service function with protection for permanent defaults and full CRUD for admin-created services
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

  -- Default templates (Sunday, Midweek, Prayer) cannot be deleted; they must be kept permanent
  IF v_svc.is_default THEN
    RAISE EXCEPTION 'Default weekly services (Sunday Service, Midweek Service, Prayer Service) are permanent and cannot be deleted. You can close them to disable check-in.';
  END IF;

  SELECT count(*) INTO v_att_count FROM public.attendance WHERE service_id = p_service;

  -- Delete attendance records for this service first
  DELETE FROM public.attendance WHERE service_id = p_service;
  -- Delete the custom service
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
-- Shows the 3 defaults (without date constraint), followed by any admin-created open services
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
    s.service_date DESC NULLS LAST,
    s.created_at DESC
  LIMIT 50
$$;
REVOKE ALL ON FUNCTION public.public_open_services(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_open_services(text) TO service_role;
