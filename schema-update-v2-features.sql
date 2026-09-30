-- ==============================================================================
-- Mene:Log Schema Update: Leader Hierarchy, Online Services, Fast Indexes & Leader Features
-- Run this in your Supabase SQL Editor.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Services: Add is_live, stream_url, online_min_minutes
-- ------------------------------------------------------------------------------
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_live boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stream_url text,
  ADD COLUMN IF NOT EXISTS online_min_minutes integer NOT NULL DEFAULT 20;

-- ------------------------------------------------------------------------------
-- 2. Leader Types: Add reports_to_type_id for Leader Hierarchy Configuration
-- ------------------------------------------------------------------------------
ALTER TABLE public.leader_types
  ADD COLUMN IF NOT EXISTS reports_to_type_id uuid REFERENCES public.leader_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS level_rank integer NOT NULL DEFAULT 1;

-- ------------------------------------------------------------------------------
-- 3. Leader Profiles: Add reports_to_leader_id, group_name & meeting details
-- ------------------------------------------------------------------------------
ALTER TABLE public.leader_profiles
  ADD COLUMN IF NOT EXISTS reports_to_leader_id uuid REFERENCES public.leader_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS meeting_day text,
  ADD COLUMN IF NOT EXISTS meeting_time text,
  ADD COLUMN IF NOT EXISTS meeting_venue text;

-- ------------------------------------------------------------------------------
-- 4. High-Performance Database Indexes (Fasten Database Loading)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_service ON public.attendance (tenant_id, service_id);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON public.attendance (member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_recorded_at ON public.attendance (recorded_at);
CREATE INDEX IF NOT EXISTS idx_members_tenant_status ON public.members (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_members_code ON public.members (tenant_id, member_code);
CREATE INDEX IF NOT EXISTS idx_services_tenant_date ON public.services (tenant_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_services_is_live ON public.services (tenant_id, is_live) WHERE is_live = true;
CREATE INDEX IF NOT EXISTS idx_leader_profiles_tenant ON public.leader_profiles (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leader_profiles_user ON public.leader_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_leader_profiles_reports_to ON public.leader_profiles (tenant_id, reports_to_leader_id);
CREATE INDEX IF NOT EXISTS idx_watch_sessions_service_member ON public.watch_sessions (service_id, member_id);

-- ------------------------------------------------------------------------------
-- 5. Updated tenant_has_feature: Trials & Active Plans
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_has_feature(_tenant uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    -- Active trial churches enjoy full access to test all leadership & streaming features
    (t.trial_ends_at IS NOT NULL AND t.trial_ends_at > now())
    OR (public.tier_entitlements(t.tier) ->> _feature) = 'true', 
    false
  )
  FROM public.tenants t WHERE t.id = _tenant
$$;

REVOKE ALL ON FUNCTION public.tenant_has_feature(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_has_feature(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. Updated public_leader_types: returns hierarchy reports_to_type_id & parent name
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.public_leader_types(text) CASCADE;
CREATE OR REPLACE FUNCTION public.public_leader_types(p_subdomain text)
RETURNS TABLE(
  id uuid,
  name text,
  reports_to_type_id uuid,
  reports_to_name text,
  level_rank integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    lt.id, 
    lt.name,
    lt.reports_to_type_id,
    parent.name AS reports_to_name,
    coalesce(lt.level_rank, 1) AS level_rank
  FROM public.leader_types lt
  JOIN public.tenants t ON t.id = lt.tenant_id
  LEFT JOIN public.leader_types parent ON parent.id = lt.reports_to_type_id
  WHERE t.subdomain = lower(btrim(coalesce(p_subdomain, '')))
    AND (
      public.tenant_has_feature(t.id, 'leaders') 
      OR (t.trial_ends_at IS NOT NULL AND t.trial_ends_at > now())
    )
  ORDER BY coalesce(lt.level_rank, 1), lt.name
  LIMIT 200
$$;

REVOKE ALL ON FUNCTION public.public_leader_types(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_leader_types(text) TO service_role;

-- ------------------------------------------------------------------------------
-- 7. Updated public_leader_options: returns leader_type_id & group_name
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.public_leader_options(text) CASCADE;
CREATE OR REPLACE FUNCTION public.public_leader_options(p_subdomain text)
RETURNS TABLE(
  id uuid,
  full_name text,
  leader_type text,
  leader_type_id uuid,
  group_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    lp.id, 
    lp.full_name, 
    lt.name AS leader_type,
    lp.leader_type_id,
    lp.group_name
  FROM public.leader_profiles lp
  JOIN public.tenants t ON t.id = lp.tenant_id
  LEFT JOIN public.leader_types lt ON lt.id = lp.leader_type_id
  WHERE t.subdomain = lower(btrim(coalesce(p_subdomain, '')))
    AND lp.status = 'active'
    AND (
      public.tenant_has_feature(t.id, 'leaders')
      OR (t.trial_ends_at IS NOT NULL AND t.trial_ends_at > now())
    )
  ORDER BY lp.full_name
  LIMIT 500
$$;

REVOKE ALL ON FUNCTION public.public_leader_options(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_leader_options(text) TO service_role;

-- ------------------------------------------------------------------------------
-- 8. Enhanced register_leader: Supports Hierarchy and Group Name
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS proc_name 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'register_leader'
      AND n.nspname = 'public'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.proc_name || ' CASCADE;';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.register_leader(
  p_subdomain text,
  p_user uuid,
  p_code text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_dob date DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_leader_type uuid DEFAULT NULL,
  p_photo_path text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_reports_to uuid DEFAULT NULL,
  p_group_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  v_tenant record; 
  v_code text; 
  v_leader uuid; 
  v_phone text;
  v_expected_code text;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants
   WHERE subdomain = lower(btrim(coalesce(p_subdomain, '')));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  IF v_tenant.status NOT IN ('active','grace') THEN RAISE EXCEPTION 'This church is not accepting leader sign-ups right now'; END IF;
  
  IF NOT (public.tenant_has_feature(v_tenant.id, 'leaders') OR (v_tenant.trial_ends_at IS NOT NULL AND v_tenant.trial_ends_at > now())) THEN
    RAISE EXCEPTION 'Leader accounts are not part of this package';
  END IF;

  IF NOT public.check_rate_limit('leader_register_ip', coalesce(p_ip, 'unknown'), 10, 3600) THEN
    RAISE EXCEPTION 'Too many attempts from this device. Please try again later.';
  END IF;

  SELECT code INTO v_code FROM public.tenant_leader_access WHERE tenant_id = v_tenant.id;
  IF v_code IS NULL THEN
    v_expected_code := 'LEAD-' || upper(substring(v_tenant.subdomain from 1 for 6));
  ELSE
    v_expected_code := v_code;
  END IF;

  IF upper(btrim(coalesce(p_code, ''))) <> upper(v_expected_code) THEN
    RAISE EXCEPTION 'That leader access code is not correct. Please ask your church administrator for the code.';
  END IF;

  IF length(btrim(coalesce(p_full_name, ''))) < 2 OR length(p_full_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your full name';
  END IF;

  IF p_leader_type IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leader_types WHERE id = p_leader_type AND tenant_id = v_tenant.id
  ) THEN 
    -- Fallback: if id not found in leader_types, allow null rather than failing registration
    p_leader_type := NULL;
  END IF;

  IF p_reports_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leader_profiles WHERE id = p_reports_to AND tenant_id = v_tenant.id
  ) THEN
    p_reports_to := NULL;
  END IF;

  v_phone := public.normalize_phone_gh(p_phone);

  INSERT INTO public.leader_profiles (
    tenant_id, user_id, full_name, email, phone, photo_path, date_of_birth, location, 
    leader_type_id, reports_to_leader_id, group_name
  ) VALUES (
    v_tenant.id, p_user, btrim(p_full_name), nullif(btrim(coalesce(p_email,'')),''), v_phone,
    nullif(btrim(coalesce(p_photo_path,'')),''), p_dob, nullif(btrim(coalesce(p_location,'')),''), 
    p_leader_type, p_reports_to, nullif(btrim(coalesce(p_group_name,'')),'')
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET 
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, leader_profiles.phone),
    leader_type_id = coalesce(excluded.leader_type_id, leader_profiles.leader_type_id),
    reports_to_leader_id = coalesce(excluded.reports_to_leader_id, leader_profiles.reports_to_leader_id),
    group_name = coalesce(excluded.group_name, leader_profiles.group_name)
  RETURNING id INTO v_leader;

  -- Ensure user account is recorded with role = leader
  INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
  VALUES (v_tenant.id, p_user, 'leader', 'active')
  ON CONFLICT DO NOTHING;

  PERFORM public.log_audit(v_tenant.id, 'leader.registered', v_leader::text, jsonb_build_object('name', p_full_name, 'group', p_group_name), p_ip, p_user);
  RETURN jsonb_build_object('ok', true, 'leader_id', v_leader, 'church', v_tenant.name);
END; $$;

REVOKE ALL ON FUNCTION public.register_leader(text,uuid,text,text,text,text,date,text,uuid,text,text,uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_leader(text,uuid,text,text,text,text,date,text,uuid,text,text,uuid,text) TO service_role;

-- ------------------------------------------------------------------------------
-- 9. Toggle Live Stream Function (For Online Services)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_service_live(
  p_service uuid,
  p_is_live boolean,
  p_stream_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.services WHERE id = p_service;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.is_tenant_admin(v_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;

  UPDATE public.services
  SET is_live = p_is_live,
      stream_url = coalesce(nullif(btrim(coalesce(p_stream_url, '')), ''), stream_url)
  WHERE id = p_service;

  RETURN jsonb_build_object('ok', true, 'is_live', p_is_live);
END; $$;

REVOKE ALL ON FUNCTION public.toggle_service_live(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.toggle_service_live(uuid, boolean, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 10. Leader Subordinates & Hierarchy Attendance Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leader_hierarchy_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_my_leader record;
  v_subordinates jsonb;
  v_groups jsonb;
BEGIN
  SELECT lp.* INTO v_my_leader
  FROM public.leader_profiles lp
  WHERE lp.user_id = auth.uid() LIMIT 1;

  IF v_my_leader IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Leader profile not found');
  END IF;

  -- 1. Get all leaders reporting directly or indirectly to this leader
  WITH RECURSIVE leader_tree AS (
    SELECT 
      lp.id, 
      lp.user_id, 
      lp.full_name, 
      lp.email, 
      lp.phone, 
      lp.group_name, 
      lp.leader_type_id, 
      lp.reports_to_leader_id,
      1 as depth
    FROM public.leader_profiles lp
    WHERE lp.reports_to_leader_id = v_my_leader.id
      AND lp.status = 'active'
    
    UNION ALL
    
    SELECT 
      c.id, 
      c.user_id, 
      c.full_name, 
      c.email, 
      c.phone, 
      c.group_name, 
      c.leader_type_id, 
      c.reports_to_leader_id,
      p.depth + 1
    FROM public.leader_profiles c
    JOIN leader_tree p ON c.reports_to_leader_id = p.id
    WHERE c.status = 'active'
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', lt.id,
      'full_name', lt.full_name,
      'email', lt.email,
      'phone', lt.phone,
      'group_name', lt.group_name,
      'depth', lt.depth,
      'role_name', types.name,
      'member_count', (
        SELECT count(*) FROM public.members m 
        WHERE m.invited_by_leader_id = lt.id AND m.status IN ('active', 'first_timer')
      )
    )
  ), '[]'::jsonb) INTO v_subordinates
  FROM leader_tree lt
  LEFT JOIN public.leader_types types ON types.id = lt.leader_type_id;

  RETURN jsonb_build_object(
    'ok', true,
    'my_group_name', v_my_leader.group_name,
    'my_meeting_day', v_my_leader.meeting_day,
    'my_meeting_time', v_my_leader.meeting_time,
    'my_meeting_venue', v_my_leader.meeting_venue,
    'subordinates', v_subordinates
  );
END; $$;

REVOKE ALL ON FUNCTION public.leader_hierarchy_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leader_hierarchy_overview() TO authenticated;
