-- Migration 0024: Fix attendance unique constraint and QR code self check-in
-- Resolves: "there is no unique or exclusion constraint matching the ON CONFLICT specification"

-- 1. Create an unconstrained unique index on attendance(service_id, member_id).
-- In PostgreSQL, multiple (service_id, NULL) rows remain allowed because NULL != NULL.
-- This ensures plain "ON CONFLICT (service_id, member_id)" clauses succeed.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_service_member_idx
  ON public.attendance (service_id, member_id);

-- 2. Update self_checkin_v3 to include WHERE member_id IS NOT NULL in ON CONFLICT.
-- This matches BOTH the original partial index (attendance_service_member_uniq)
-- and the unconstrained index, ensuring QR codes generate cleanly without conflict errors.
CREATE OR REPLACE FUNCTION public.self_checkin_v3(
  p_subdomain text,
  p_service uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_dob date,
  p_gender gender_type,
  p_marital_status text,
  p_area text,
  p_occupation text,
  p_education text,
  p_leader uuid,
  p_ip text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_tenant record;
  v_branch uuid;
  v_member uuid;
  v_service record;
  v_phone text;
  v_token text;
  v_existing boolean := false;
  v_channel text;
  v_dest text;
  v_email text;
  v_leader uuid;
  v_is_leader boolean := false;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants WHERE subdomain = lower(btrim(coalesce(p_subdomain,'')));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  IF v_tenant.status NOT IN ('active','grace') THEN RAISE EXCEPTION 'This church is not accepting check-ins right now'; END IF;
  IF NOT public.check_rate_limit('self_checkin_ip', coalesce(p_ip,'unknown'), 10, 600) THEN
    RAISE EXCEPTION 'Too many check-ins from this device. Please wait a few minutes.';
  END IF;
  IF NOT public.check_rate_limit('self_checkin_tenant', v_tenant.id::text, 400, 3600) THEN
    RAISE EXCEPTION 'Check-in is temporarily unavailable. Please ask an usher for help.';
  END IF;
  IF length(btrim(coalesce(p_full_name,''))) < 2 OR length(p_full_name) > 120 THEN RAISE EXCEPTION 'Please enter your full name'; END IF;
  IF p_marital_status IS NOT NULL AND p_marital_status NOT IN ('single','married','divorced','widowed','separated','prefer_not_to_say') THEN
    RAISE EXCEPTION 'Please select a valid marital status';
  END IF;
  IF length(coalesce(p_occupation,'')) > 120 OR length(coalesce(p_area,'')) > 120 OR length(coalesce(p_education,'')) > 60 THEN
    RAISE EXCEPTION 'A member detail is too long';
  END IF;
  v_email := nullif(btrim(coalesce(p_email,'')),'');
  IF v_email IS NOT NULL AND (length(v_email) > 160 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN RAISE EXCEPTION 'Please enter a valid email address'; END IF;
  SELECT s.* INTO v_service FROM public.services s WHERE s.id = p_service AND s.tenant_id = v_tenant.id AND s.is_open;
  IF v_service IS NULL THEN RAISE EXCEPTION 'Please select an open service'; END IF;
  v_phone := public.normalize_phone_gh(p_phone);
  IF v_phone IS NULL OR length(v_phone) < 10 THEN RAISE EXCEPTION 'Please enter a valid phone number'; END IF;
  IF p_leader IS NOT NULL THEN
    IF NOT public.tenant_has_feature(v_tenant.id, 'leaders') THEN RAISE EXCEPTION 'Please choose Self / walk-in'; END IF;
    SELECT id INTO v_leader FROM public.leader_profiles WHERE id = p_leader AND tenant_id = v_tenant.id AND status = 'active';
    IF v_leader IS NULL THEN RAISE EXCEPTION 'Please choose a leader from the list'; END IF;
  END IF;
  SELECT id INTO v_branch FROM public.branches WHERE tenant_id = v_tenant.id AND (v_service.branch_id IS NULL OR id = v_service.branch_id)
   ORDER BY is_default DESC, created_at LIMIT 1;
  SELECT id, is_leader INTO v_member, v_is_leader FROM public.members WHERE tenant_id = v_tenant.id AND phone = v_phone LIMIT 1;
  IF v_member IS NULL THEN
    IF (SELECT count(*) FROM public.members WHERE tenant_id = v_tenant.id) >= public.tenant_limit(v_tenant.id, 'member_limit') THEN
      RAISE EXCEPTION 'This church has reached its member limit. Please ask an usher for help.';
    END IF;
    INSERT INTO public.members (tenant_id, branch_id, full_name, phone, email, date_of_birth, gender,
      marital_status, residential_area, occupation, education_level, invited_by_leader_id, status)
    VALUES (v_tenant.id, v_branch, btrim(p_full_name), v_phone, v_email, p_dob, p_gender, p_marital_status,
      nullif(btrim(coalesce(p_area,'')),''), nullif(btrim(coalesce(p_occupation,'')),''), nullif(btrim(coalesce(p_education,'')),''),
      v_leader, 'first_timer') RETURNING id INTO v_member;
    v_is_leader := false;
  ELSE
    v_existing := true;
    UPDATE public.members SET full_name = btrim(p_full_name), email = coalesce(v_email, email),
      date_of_birth = coalesce(p_dob, date_of_birth), gender = coalesce(p_gender, gender),
      marital_status = coalesce(p_marital_status, marital_status),
      residential_area = coalesce(nullif(btrim(coalesce(p_area,'')),''), residential_area),
      occupation = coalesce(nullif(btrim(coalesce(p_occupation,'')),''), occupation),
      education_level = coalesce(nullif(btrim(coalesce(p_education,'')),''), education_level),
      invited_by_leader_id = coalesce(v_leader, invited_by_leader_id)
    WHERE id = v_member;
  END IF;
  v_token := private.new_qr(v_tenant.id, v_member, CASE WHEN coalesce(v_is_leader,false) THEN 'leader' ELSE 'member' END);
  INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, method, designation)
  VALUES (v_tenant.id, v_service.id, v_member, coalesce(v_branch, v_service.branch_id), 'self_checkin',
    CASE WHEN coalesce(v_is_leader,false) THEN 'leader' ELSE 'member' END)
  ON CONFLICT (service_id, member_id) WHERE member_id IS NOT NULL DO NOTHING;
  IF NOT v_existing THEN
    v_channel := CASE WHEN v_email IS NOT NULL AND public.tenant_has_feature(v_tenant.id,'email') THEN 'email'
      WHEN public.tenant_has_feature(v_tenant.id,'sms') THEN 'sms' ELSE NULL END;
    IF v_channel IS NOT NULL THEN
      v_dest := CASE WHEN v_channel = 'email' THEN v_email ELSE v_phone END;
      PERFORM public.enqueue_message(v_tenant.id, v_channel, v_member, v_dest, 'Welcome to ' || v_tenant.name,
        'Welcome to ' || v_tenant.name || ', ' || split_part(btrim(p_full_name),' ',1) ||
        '! Your member code is ' || v_token || '. Keep your QR code safe and show it when you arrive next time.',
        'welcome', 'welcome:' || v_member::text);
    END IF;
  END IF;
  PERFORM public.log_audit(v_tenant.id, 'member.self_checkin', v_member::text,
    jsonb_build_object('returning', v_existing, 'service_id', v_service.id), p_ip, null);
  RETURN jsonb_build_object('ok', true, 'member_id', v_member, 'token', v_token, 'returning', v_existing,
    'checked_in', true, 'church', v_tenant.name, 'service', v_service.name,
    'kind', CASE WHEN coalesce(v_is_leader,false) THEN 'leader' ELSE 'member' END);
END; $function$;

-- 3. Update scan_attendance to also match WHERE member_id IS NOT NULL
CREATE OR REPLACE FUNCTION public.scan_attendance(p_service uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_member uuid;
  v_name text;
  v_branch uuid;
  v_pos uuid;
  v_svc record;
  v_new boolean;
  v_kind text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.check_rate_limit('scan', auth.uid()::text, 600, 3600) THEN RAISE EXCEPTION 'Rate limit exceeded'; END IF;
  SELECT * INTO v_svc FROM public.services WHERE id = p_service;
  IF v_svc IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.is_tenant_member(v_svc.tenant_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.tenant_can_write(v_svc.tenant_id) THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
  IF NOT v_svc.is_open THEN RAISE EXCEPTION 'Service is closed'; END IF;
  SELECT q.tenant_id, q.member_id, q.kind INTO v_tenant, v_member, v_kind
  FROM public.qr_tokens q
  WHERE q.token_hash = digest(coalesce(p_token,''), 'sha256') AND q.revoked_at IS NULL AND q.tenant_id = v_svc.tenant_id;
  IF v_member IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code'); END IF;
  SELECT full_name, branch_id, position_id INTO v_name, v_branch, v_pos FROM public.members WHERE id = v_member;
  IF NOT public.can_read_member(v_tenant, v_branch, v_pos)
     AND NOT public.has_tenant_role(v_tenant, array['usher']::public.app_role[]) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'out_of_scope');
  END IF;
  INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, position_id, scanned_by_user_id, method, designation)
  VALUES (v_tenant, p_service, v_member, coalesce(v_branch, v_svc.branch_id), v_pos, auth.uid(), 'scan', coalesce(v_kind,'member'))
  ON CONFLICT (service_id, member_id) WHERE member_id IS NOT NULL DO NOTHING;
  v_new := found;
  RETURN jsonb_build_object('ok', true, 'member_name', v_name, 'duplicate', not v_new, 'designation', coalesce(v_kind,'member'));
END; $function$;
