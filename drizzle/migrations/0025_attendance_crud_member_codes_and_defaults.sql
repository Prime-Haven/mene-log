-- ==============================================================================
-- Migration 0025: Attendance CRUD, Member Codes, and Default Services
-- ==============================================================================

-- 1. Member Codes: Add member_code column to members table
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS member_code text;

-- Create unique index on (tenant_id, lower(member_code))
CREATE UNIQUE INDEX IF NOT EXISTS members_tenant_code_uniq
  ON public.members (tenant_id, lower(member_code))
  WHERE member_code IS NOT NULL;

-- 2. Function to generate a clean, unique member code (e.g. ML-7B2K91)
CREATE OR REPLACE FUNCTION public.generate_member_code(p_tenant uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_code text;
  v_exists boolean;
  v_chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_len int := 6;
  i int;
BEGIN
  LOOP
    v_code := 'ML-';
    FOR i IN 1..v_len LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    SELECT EXISTS (
      SELECT 1 FROM public.members
      WHERE tenant_id = p_tenant AND lower(member_code) = lower(v_code)
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

-- 3. Trigger to auto-assign member_code on insert if missing
CREATE OR REPLACE FUNCTION public.members_assign_code_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.member_code IS NULL OR btrim(NEW.member_code) = '' THEN
    NEW.member_code := public.generate_member_code(NEW.tenant_id);
  ELSE
    NEW.member_code := upper(btrim(NEW.member_code));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_members_assign_code ON public.members;
CREATE TRIGGER trg_members_assign_code
  BEFORE INSERT ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.members_assign_code_trigger();

-- 4. Backfill any existing members that lack a member_code
UPDATE public.members
SET member_code = 'ML-' || upper(substr(encode(digest(id::text, 'sha256'), 'hex'), 1, 6))
WHERE member_code IS NULL OR btrim(member_code) = '';

-- 5. Service classification: Add service_type and program details to services table
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'regular';
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS speaker text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS target_attendance integer;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS notes text;

-- 6. Ensure default services (Sunday Service, Midweek Service, Prayer Service)
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
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE tenant_id = p_tenant AND name ILIKE '%Sunday Service%' AND service_date = v_sun_date) THEN
    INSERT INTO public.services (tenant_id, name, service_type, service_date, is_open)
    VALUES (p_tenant, 'Sunday Service', 'regular', v_sun_date, true);
    v_created := v_created + 1;
  END IF;

  -- Insert Midweek Service if not exists
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE tenant_id = p_tenant AND name ILIKE '%Midweek Service%' AND service_date = v_mid_date) THEN
    INSERT INTO public.services (tenant_id, name, service_type, service_date, is_open)
    VALUES (p_tenant, 'Midweek Service', 'regular', v_mid_date, true);
    v_created := v_created + 1;
  END IF;

  -- Insert Prayer Service if not exists
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE tenant_id = p_tenant AND name ILIKE '%Prayer Service%' AND service_date = v_pray_date) THEN
    INSERT INTO public.services (tenant_id, name, service_type, service_date, is_open)
    VALUES (p_tenant, 'Prayer Service', 'regular', v_pray_date, true);
    v_created := v_created + 1;
  END IF;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_default_services(uuid, date) TO authenticated;

-- 7. Secure Attendance CRUD: Delete attendance record (member stays visible)
CREATE OR REPLACE FUNCTION public.delete_attendance_record(p_service uuid, p_member uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_svc public.services;
  v_deleted int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_svc FROM public.services WHERE id = p_service;
  IF v_svc.id IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.has_tenant_role(v_svc.tenant_id, ARRAY['owner','church_admin','branch_admin','usher']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF NOT v_svc.is_open THEN RAISE EXCEPTION 'This service is closed'; END IF;

  DELETE FROM public.attendance
  WHERE service_id = p_service AND tenant_id = v_svc.tenant_id AND member_id = p_member;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  PERFORM public.log_audit(
    v_svc.tenant_id,
    'attendance.record_deleted',
    p_service::text,
    jsonb_build_object('member_id', p_member, 'deleted', v_deleted),
    NULL,
    auth.uid()
  );

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted, 'member_id', p_member);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_attendance_record(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_attendance_record(uuid, uuid) TO authenticated;

-- 8. Enhanced Attendance Register Function returning member_code, method, and timestamps
CREATE OR REPLACE FUNCTION public.attendance_register(p_service uuid, p_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_svc public.services;
  v_q text;
BEGIN
  SELECT * INTO v_svc FROM public.services WHERE id = p_service;
  IF v_svc.id IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.has_tenant_role(v_svc.tenant_id, ARRAY['owner','church_admin','branch_admin','usher']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  v_q := nullif(trim(left(coalesce(p_search,''), 80)), '');

  RETURN jsonb_build_object(
    'service', jsonb_build_object('id', v_svc.id, 'name', v_svc.name, 'date', v_svc.service_date, 'is_open', v_svc.is_open, 'service_type', v_svc.service_type),
    'writable', v_svc.is_open AND public.tenant_can_write(v_svc.tenant_id),
    'present_count', (SELECT count(*) FROM public.attendance a WHERE a.service_id = p_service AND a.member_id IS NOT NULL),
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'full_name', m.full_name,
        'member_code', m.member_code,
        'phone', m.phone,
        'status', m.status,
        'present', a.id IS NOT NULL,
        'attendance_id', a.id,
        'method', a.method,
        'designation', a.designation,
        'recorded_at', a.recorded_at
      ) ORDER BY m.full_name)
      FROM (
        SELECT * FROM public.members m0
        WHERE m0.tenant_id = v_svc.tenant_id
          AND m0.status IN ('active','first_timer')
          AND (v_q IS NULL OR m0.full_name ILIKE '%' || v_q || '%' OR m0.member_code ILIKE '%' || v_q || '%' OR (m0.phone IS NOT NULL AND m0.phone ILIKE '%' || v_q || '%'))
        ORDER BY m0.full_name
        LIMIT 500
      ) m
      LEFT JOIN public.attendance a ON a.service_id = p_service AND a.member_id = m.id
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.attendance_register(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attendance_register(uuid, text) TO authenticated;

-- 9. Universal Scanner Resolver: supports QR hash, raw token, and member_code fallback
CREATE OR REPLACE FUNCTION public.resolve_scan(p_token text, p_service uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_tenant uuid;
  v_member uuid;
  v_name text;
  v_code text;
  v_branch uuid;
  v_pos uuid;
  v_svc record;
  v_new boolean;
  v_kind text := 'member';
  v_clean text;
  v_existing record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.check_rate_limit('scan', auth.uid()::text, 600, 3600) THEN RAISE EXCEPTION 'Rate limit exceeded'; END IF;

  SELECT * INTO v_svc FROM public.services WHERE id = p_service;
  IF v_svc IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.is_tenant_member(v_svc.tenant_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.tenant_can_write(v_svc.tenant_id) THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
  IF NOT v_svc.is_open THEN RAISE EXCEPTION 'Service is closed'; END IF;

  v_clean := lower(btrim(coalesce(p_token,'')));
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_code', 'message', 'Please scan or enter a member code');
  END IF;

  -- 1) Try lookup via qr_tokens hash
  SELECT q.tenant_id, q.member_id, q.kind INTO v_tenant, v_member, v_kind
  FROM public.qr_tokens q
  WHERE q.token_hash = digest(v_clean, 'sha256') AND q.revoked_at IS NULL AND q.tenant_id = v_svc.tenant_id
  ORDER BY q.issued_at DESC LIMIT 1;

  -- 2) Fallback: Try lookup directly by member_code (e.g. ML-XXXXXX, with or without 'ML-')
  IF v_member IS NULL THEN
    SELECT m.id, m.tenant_id, m.full_name, m.member_code, m.branch_id, m.position_id,
           CASE WHEN m.is_leader THEN 'leader' ELSE 'member' END
    INTO v_member, v_tenant, v_name, v_code, v_branch, v_pos, v_kind
    FROM public.members m
    WHERE m.tenant_id = v_svc.tenant_id
      AND (
        lower(m.member_code) = v_clean
        OR lower(replace(m.member_code, '-', '')) = replace(v_clean, '-', '')
        OR lower(m.member_code) = 'ml-' || replace(v_clean, 'ml-', '')
        OR (length(v_clean) = 36 AND m.id::text = v_clean)
      )
    LIMIT 1;
  END IF;

  IF v_member IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code', 'message', 'Code not recognised. Check the member code or search by name.');
  END IF;

  -- Retrieve member details if not loaded in fallback
  IF v_name IS NULL THEN
    SELECT full_name, member_code, branch_id, position_id INTO v_name, v_code, v_branch, v_pos
    FROM public.members WHERE id = v_member;
  END IF;

  -- Check scope permissions
  IF NOT public.can_read_member(v_svc.tenant_id, v_branch, v_pos)
     AND NOT public.has_tenant_role(v_svc.tenant_id, ARRAY['usher','church_admin','owner']::public.app_role[]) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'out_of_scope', 'message', 'Not in your assigned group or branch');
  END IF;

  -- Check if member is ALREADY present for this service today
  SELECT id, recorded_at, method INTO v_existing
  FROM public.attendance
  WHERE service_id = p_service AND member_id = v_member;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'member_name', v_name,
      'member_code', coalesce(v_code, ''),
      'duplicate', true,
      'already_present', true,
      'recorded_at', v_existing.recorded_at,
      'designation', coalesce(v_kind,'member'),
      'message', v_name || ' is already marked present for this service'
    );
  END IF;

  -- Record new attendance cleanly
  INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, position_id, scanned_by_user_id, method, designation)
  VALUES (v_svc.tenant_id, p_service, v_member, coalesce(v_branch, v_svc.branch_id), v_pos, auth.uid(), 'scan', coalesce(v_kind,'member'))
  ON CONFLICT (service_id, member_id) WHERE member_id IS NOT NULL DO NOTHING;
  v_new := found;

  RETURN jsonb_build_object(
    'ok', true,
    'member_name', v_name,
    'member_code', coalesce(v_code, ''),
    'duplicate', not v_new,
    'already_present', not v_new,
    'designation', coalesce(v_kind,'member'),
    'message', CASE WHEN v_new THEN 'Attendance recorded successfully' ELSE v_name || ' is already marked present' END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_scan(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_scan(text, uuid) TO authenticated;

-- Also update scan_attendance alias to identical behavior
CREATE OR REPLACE FUNCTION public.scan_attendance(p_service uuid, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  RETURN public.resolve_scan(p_token, p_service);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.scan_attendance(uuid, text) TO authenticated;
