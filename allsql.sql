-- Mene:Log full database schema (tables, relations, security rules, functions, rate limiting)
-- Built from all migrations 0000-0020 in order. Run on a fresh Lovable Cloud / Postgres database.


-- ============ 0000_grace_city_hub_core.sql ============
-- ============================================================
-- Grace City Hub — core multi-tenant schema
-- ============================================================
create extension if not exists ltree;
create extension if not exists citext;
create extension if not exists pgcrypto;

create type public.app_role as enum ('owner','church_admin','branch_admin','leader','usher','platform_admin');
create type public.tenant_tier as enum ('basic','standard','premium');
create type public.tenant_status as enum ('active','grace','suspended','closed');
create type public.member_status as enum ('first_timer','active','archived','anonymised');
create type public.gender_type as enum ('male','female','other');
create type public.attendance_method as enum ('scan','self_checkin','manual','corrected');
create type public.pay_method as enum ('card','momo');
create type public.account_status as enum ('active','suspended');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email citext,
  phone text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- tenants ----------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subdomain citext not null unique,
  tier public.tenant_tier not null default 'basic',
  status public.tenant_status not null default 'active',
  logo_path text,
  contact_email citext,
  contact_phone text,
  group_vocabulary text not null default 'Group',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.tenants to authenticated;
grant all on public.tenants to service_role;
alter table public.tenants enable row level security;

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  city text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.branches (tenant_id);
grant select, insert, update, delete on public.branches to authenticated;
grant all on public.branches to service_role;
alter table public.branches enable row level security;

-- roles live in their own table, never on profiles
create table public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  branch_id uuid references public.branches(id) on delete set null,
  position_id uuid,
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, role)
);
create index on public.tenant_users (user_id);
create index on public.tenant_users (tenant_id);
grant select, insert, update, delete on public.tenant_users to authenticated;
grant all on public.tenant_users to service_role;
alter table public.tenant_users enable row level security;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;

-- ---------- structure ----------
create table public.structure_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  rank int not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, rank)
);
grant select, insert, update, delete on public.structure_levels to authenticated;
grant all on public.structure_levels to service_role;
alter table public.structure_levels enable row level security;

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  level_id uuid not null references public.structure_levels(id) on delete cascade,
  parent_id uuid references public.positions(id) on delete set null,
  path ltree,
  group_name text not null,
  branch_id uuid references public.branches(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.positions (tenant_id);
create index on public.positions using gist (path);
grant select, insert, update, delete on public.positions to authenticated;
grant all on public.positions to service_role;
alter table public.positions enable row level security;

create or replace function public.positions_set_path()
returns trigger language plpgsql security definer set search_path = public as $$
declare parent_path ltree;
begin
  if new.parent_id is null then
    new.path := text2ltree(replace(new.id::text,'-','_'));
  else
    select path into parent_path from public.positions where id = new.parent_id;
    new.path := parent_path || text2ltree(replace(new.id::text,'-','_'));
  end if;
  return new;
end; $$;
create trigger positions_path_biu before insert or update of parent_id on public.positions
  for each row execute function public.positions_set_path();

-- ---------- members ----------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  full_name text not null,
  phone text,
  email citext,
  date_of_birth date,
  gender public.gender_type,
  residential_area text,
  is_minor boolean not null default false,
  status public.member_status not null default 'active',
  joined_on date not null default current_date,
  import_batch_id uuid,
  created_at timestamptz not null default now()
);
create index on public.members (tenant_id);
create index on public.members (tenant_id, branch_id);
create index on public.members (position_id);
create unique index members_tenant_phone_uniq on public.members (tenant_id, phone) where phone is not null;
grant select, insert, update, delete on public.members to authenticated;
grant all on public.members to service_role;
alter table public.members enable row level security;

create or replace function public.members_derive_minor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_minor := new.date_of_birth is not null
    and new.date_of_birth > (current_date - interval '18 years');
  return new;
end; $$;
create trigger members_minor_biu before insert or update on public.members
  for each row execute function public.members_derive_minor();

-- ---------- qr tokens (hash only) ----------
create table public.qr_tokens (
  token_hash bytea primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index on public.qr_tokens (member_id);
grant all on public.qr_tokens to service_role;
alter table public.qr_tokens enable row level security;
-- no policies for authenticated: tokens are only ever touched by security-definer functions

-- ---------- services & attendance ----------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  service_date date not null,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.services (tenant_id, service_date desc);
grant select, insert, update, delete on public.services to authenticated;
grant all on public.services to service_role;
alter table public.services enable row level security;

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  scanned_by_user_id uuid references auth.users(id) on delete set null,
  method public.attendance_method not null default 'scan',
  recorded_at timestamptz not null default now()
);
create unique index attendance_service_member_uniq on public.attendance (service_id, member_id) where member_id is not null;
create index on public.attendance (tenant_id, recorded_at desc);
grant select, insert, update, delete on public.attendance to authenticated;
grant all on public.attendance to service_role;
alter table public.attendance enable row level security;

-- ---------- subscription & payments ----------
create table public.subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  tier public.tenant_tier not null default 'basic',
  pending_tier public.tenant_tier,
  period_start date not null default current_date,
  period_end date not null default (current_date + interval '30 days'),
  payment_method public.pay_method not null default 'momo',
  auto_renew boolean not null default false,
  paystack_customer_code text,
  created_at timestamptz not null default now()
);
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reference text not null unique,
  amount_kobo bigint not null,
  currency text not null default 'GHS',
  tier public.tenant_tier not null,
  status text not null default 'pending',
  channel text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.payments (tenant_id, created_at desc);
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  filename text,
  row_count int not null default 0,
  inserted_count int not null default 0,
  skipped_count int not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert on public.import_batches to authenticated;
grant all on public.import_batches to service_role;
alter table public.import_batches enable row level security;

-- ---------- audit (append only) ----------
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  branch_id uuid,
  action text not null,
  target text,
  detail jsonb,
  source_ip text,
  created_at timestamptz not null default now()
);
create index on public.audit_events (tenant_id, created_at desc);
grant select on public.audit_events to authenticated;
grant all on public.audit_events to service_role;
alter table public.audit_events enable row level security;

-- ---------- rate limiting ----------
create table public.rate_limit_hits (
  id bigserial primary key,
  bucket text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);
create index on public.rate_limit_hits (bucket, identifier, created_at desc);
grant all on public.rate_limit_hits to service_role;
alter table public.rate_limit_hits enable row level security;

-- ============================================================
-- Helper functions (security definer, no RLS recursion)
-- ============================================================
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.is_tenant_member(_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_users
    where tenant_id = _tenant and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.has_tenant_role(_tenant uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_users
    where tenant_id = _tenant and user_id = auth.uid()
      and status = 'active' and role = any(_roles)
  );
$$;

create or replace function public.user_branch(_tenant uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from public.tenant_users
  where tenant_id = _tenant and user_id = auth.uid() and status = 'active'
  order by created_at limit 1;
$$;

create or replace function public.user_position_path(_tenant uuid)
returns ltree language sql stable security definer set search_path = public as $$
  select p.path from public.tenant_users tu
  join public.positions p on p.id = tu.position_id
  where tu.tenant_id = _tenant and tu.user_id = auth.uid() and tu.status = 'active'
  limit 1;
$$;

-- tenant-wide admin (owner/church_admin)
create or replace function public.is_tenant_admin(_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(_tenant, array['owner','church_admin']::public.app_role[]);
$$;

create or replace function public.can_read_member(_tenant uuid, _branch uuid, _position uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_tenant_admin(_tenant)
    or (public.has_tenant_role(_tenant, array['branch_admin']::public.app_role[])
        and _branch is not distinct from public.user_branch(_tenant))
    or (public.has_tenant_role(_tenant, array['leader']::public.app_role[])
        and _position is not null
        and exists (
          select 1 from public.positions p
          where p.id = _position and p.path <@ public.user_position_path(_tenant)
        ));
$$;

create or replace function public.tenant_can_write(_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenants t where t.id = _tenant and t.status in ('active','grace'));
$$;

create or replace function public.log_audit(
  _tenant uuid, _action text, _target text default null,
  _detail jsonb default null, _ip text default null, _actor uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events (tenant_id, actor_user_id, action, target, detail, source_ip)
  values (_tenant, coalesce(_actor, auth.uid()), _action, _target, _detail, _ip);
end; $$;

create or replace function public.check_rate_limit(
  _bucket text, _identifier text, _max int, _window_seconds int
) returns boolean language plpgsql security definer set search_path = public as $$
declare hits int;
begin
  delete from public.rate_limit_hits
   where created_at < now() - interval '1 day';
  select count(*) into hits from public.rate_limit_hits
   where bucket = _bucket and identifier = _identifier
     and created_at > now() - make_interval(secs => _window_seconds);
  if hits >= _max then
    return false;
  end if;
  insert into public.rate_limit_hits (bucket, identifier) values (_bucket, _identifier);
  return true;
end; $$;

-- ============================================================
-- RLS policies
-- ============================================================
create policy "tenant readable by its members" on public.tenants for select to authenticated
  using (public.is_tenant_member(id) or public.is_platform_admin());
create policy "owner updates tenant" on public.tenants for update to authenticated
  using (public.has_tenant_role(id, array['owner']::public.app_role[]));

create policy "branches read" on public.branches for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy "branches write premium owner" on public.branches for insert to authenticated
  with check (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.tier = 'premium'));
create policy "branches update premium owner" on public.branches for update to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.tier = 'premium'));
create policy "branches delete premium owner" on public.branches for delete to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.tier = 'premium'));

create policy "own memberships" on public.tenant_users for select to authenticated
  using (user_id = auth.uid() or public.is_tenant_admin(tenant_id));
create policy "admins manage accounts" on public.tenant_users for insert to authenticated
  with check (public.is_tenant_admin(tenant_id)
    and role <> 'platform_admin'
    and (role <> 'branch_admin' or exists (select 1 from public.tenants t where t.id = tenant_id and t.tier = 'premium'))
    and (role <> 'leader' or exists (select 1 from public.tenants t where t.id = tenant_id and t.tier in ('standard','premium'))));
create policy "admins update accounts" on public.tenant_users for update to authenticated
  using (public.is_tenant_admin(tenant_id));
create policy "admins remove accounts" on public.tenant_users for delete to authenticated
  using (public.is_tenant_admin(tenant_id));

create policy "own platform admin row" on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

create policy "levels read" on public.structure_levels for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy "levels owner write" on public.structure_levels for all to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.tier in ('standard','premium')))
  with check (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.tier in ('standard','premium')));

create policy "positions read" on public.positions for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy "positions admin write" on public.positions for all to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id) and public.tenant_can_write(tenant_id));

create policy "members scoped read" on public.members for select to authenticated
  using (public.can_read_member(tenant_id, branch_id, position_id));
create policy "members insert" on public.members for insert to authenticated
  with check (public.tenant_can_write(tenant_id) and (
    public.is_tenant_admin(tenant_id)
    or (public.has_tenant_role(tenant_id, array['branch_admin','usher']::public.app_role[])
        and branch_id is not distinct from public.user_branch(tenant_id))));
create policy "members update" on public.members for update to authenticated
  using (public.tenant_can_write(tenant_id) and (
    public.is_tenant_admin(tenant_id)
    or (public.has_tenant_role(tenant_id, array['branch_admin']::public.app_role[])
        and branch_id is not distinct from public.user_branch(tenant_id))));
create policy "members delete admin only" on public.members for delete to authenticated
  using (public.is_tenant_admin(tenant_id));

create policy "services read" on public.services for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy "services write" on public.services for all to authenticated
  using (public.is_tenant_admin(tenant_id)
    or (public.has_tenant_role(tenant_id, array['branch_admin']::public.app_role[])
        and branch_id is not distinct from public.user_branch(tenant_id)))
  with check (public.tenant_can_write(tenant_id) and (public.is_tenant_admin(tenant_id)
    or (public.has_tenant_role(tenant_id, array['branch_admin']::public.app_role[])
        and branch_id is not distinct from public.user_branch(tenant_id))));

create policy "attendance scoped read" on public.attendance for select to authenticated
  using (public.is_tenant_admin(tenant_id)
    or (public.has_tenant_role(tenant_id, array['branch_admin','usher']::public.app_role[])
        and branch_id is not distinct from public.user_branch(tenant_id))
    or (public.has_tenant_role(tenant_id, array['leader']::public.app_role[])
        and position_id is not null
        and exists (select 1 from public.positions p where p.id = attendance.position_id
                    and p.path <@ public.user_position_path(tenant_id))));
create policy "attendance insert" on public.attendance for insert to authenticated
  with check (public.tenant_can_write(tenant_id) and public.is_tenant_member(tenant_id));
create policy "attendance correct admin" on public.attendance for update to authenticated
  using (public.is_tenant_admin(tenant_id) and public.tenant_can_write(tenant_id));
create policy "attendance delete admin" on public.attendance for delete to authenticated
  using (public.is_tenant_admin(tenant_id) and public.tenant_can_write(tenant_id));

create policy "subscription owner read" on public.subscriptions for select to authenticated
  using (public.is_tenant_admin(tenant_id));
create policy "payments owner read" on public.payments for select to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[]));
create policy "imports read" on public.import_batches for select to authenticated
  using (public.is_tenant_admin(tenant_id));
create policy "imports insert" on public.import_batches for insert to authenticated
  with check (public.is_tenant_admin(tenant_id) and public.tenant_can_write(tenant_id));
create policy "audit owner read" on public.audit_events for select to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[]));


-- ============ 0001_grace_city_hub_functions.sql ============
-- ============================================================
-- Business logic as security-definer functions
-- ============================================================
create or replace function public.normalize_phone_gh(_phone text)
returns text language plpgsql immutable set search_path = public as $$
declare d text;
begin
  if _phone is null then return null; end if;
  d := regexp_replace(_phone, '[^0-9+]', '', 'g');
  if d = '' then return null; end if;
  if left(d,1) = '+' then return d; end if;
  if left(d,3) = '233' then return '+' || d; end if;
  if left(d,1) = '0' then return '+233' || substr(d,2); end if;
  return '+233' || d;
end; $$;

-- ---------- tenant provisioning ----------
create or replace function public.provision_tenant(
  p_name text, p_subdomain text, p_tier public.tenant_tier,
  p_contact_email text default null, p_contact_phone text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_branch uuid; v_sub text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.check_rate_limit('provision_tenant', auth.uid()::text, 5, 3600) then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  v_sub := lower(trim(p_subdomain));
  if v_sub !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' then
    raise exception 'Subdomain must be 3-40 characters, lowercase letters, numbers and hyphens';
  end if;
  if v_sub in ('www','admin','api','app','mail','status','support','billing','static','assets') then
    raise exception 'That subdomain is reserved';
  end if;
  if exists (select 1 from public.tenants where subdomain = v_sub) then
    raise exception 'That subdomain is already taken';
  end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Church name is required'; end if;

  insert into public.tenants (name, subdomain, tier, contact_email, contact_phone)
  values (trim(p_name), v_sub, p_tier, nullif(p_contact_email,''), public.normalize_phone_gh(p_contact_phone))
  returning id into v_tenant;

  insert into public.branches (tenant_id, name, is_default)
  values (v_tenant, 'Main', true) returning id into v_branch;

  insert into public.tenant_users (tenant_id, user_id, role, branch_id)
  values (v_tenant, auth.uid(), 'owner', v_branch);

  insert into public.subscriptions (tenant_id, tier) values (v_tenant, p_tier);

  if p_tier in ('standard','premium') then
    insert into public.structure_levels (tenant_id, name, rank) values (v_tenant, 'Leader', 1);
  end if;

  perform public.log_audit(v_tenant, 'tenant.provisioned', v_sub,
    jsonb_build_object('tier', p_tier));
  return v_tenant;
end; $$;
revoke all on function public.provision_tenant(text,text,public.tenant_tier,text,text) from public, anon;
grant execute on function public.provision_tenant(text,text,public.tenant_tier,text,text) to authenticated;

create or replace function public.subdomain_available(p_subdomain text)
returns boolean language sql security definer set search_path = public as $$
  select not exists (select 1 from public.tenants where subdomain = lower(trim(p_subdomain)))
     and lower(trim(p_subdomain)) not in ('www','admin','api','app','mail','status','support','billing','static','assets');
$$;
revoke all on function public.subdomain_available(text) from public, anon;
grant execute on function public.subdomain_available(text) to authenticated, service_role;

-- ---------- QR issuing ----------
create or replace function public.issue_qr_token(p_member uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_branch uuid; v_token text;
begin
  select tenant_id, branch_id into v_tenant, v_branch from public.members where id = p_member;
  if v_tenant is null then raise exception 'Member not found'; end if;
  if not (public.is_tenant_admin(v_tenant)
     or (public.has_tenant_role(v_tenant, array['branch_admin']::public.app_role[])
         and v_branch is not distinct from public.user_branch(v_tenant))) then
    raise exception 'Not permitted';
  end if;
  if not public.check_rate_limit('issue_qr', auth.uid()::text, 300, 3600) then
    raise exception 'Rate limit exceeded';
  end if;

  update public.qr_tokens set revoked_at = now()
   where member_id = p_member and revoked_at is null;

  v_token := encode(gen_random_bytes(16), 'hex');
  insert into public.qr_tokens (token_hash, tenant_id, member_id)
  values (digest(v_token, 'sha256'), v_tenant, p_member);

  perform public.log_audit(v_tenant, 'qr.issued', p_member::text);
  return v_token;
end; $$;
revoke all on function public.issue_qr_token(uuid) from public, anon;
grant execute on function public.issue_qr_token(uuid) to authenticated;

-- ---------- scanning ----------
create or replace function public.resolve_scan(p_token text, p_service uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_member uuid; v_name text; v_branch uuid; v_pos uuid; v_svc record; v_new boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.check_rate_limit('scan', auth.uid()::text, 600, 3600) then
    raise exception 'Rate limit exceeded';
  end if;

  select * into v_svc from public.services where id = p_service;
  if v_svc is null then raise exception 'Service not found'; end if;
  if not public.is_tenant_member(v_svc.tenant_id) then raise exception 'Not permitted'; end if;
  if not public.tenant_can_write(v_svc.tenant_id) then raise exception 'Subscription inactive'; end if;
  if not v_svc.is_open then raise exception 'Service is closed'; end if;

  select q.tenant_id, q.member_id into v_tenant, v_member
  from public.qr_tokens q
  where q.token_hash = digest(coalesce(p_token,''), 'sha256')
    and q.revoked_at is null and q.tenant_id = v_svc.tenant_id;

  if v_member is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_code');
  end if;

  select full_name, branch_id, position_id into v_name, v_branch, v_pos
  from public.members where id = v_member;

  if not public.can_read_member(v_tenant, v_branch, v_pos)
     and not public.has_tenant_role(v_tenant, array['usher']::public.app_role[]) then
    return jsonb_build_object('ok', false, 'reason', 'out_of_scope');
  end if;

  insert into public.attendance (tenant_id, service_id, member_id, branch_id, position_id, scanned_by_user_id, method)
  values (v_tenant, p_service, v_member, coalesce(v_branch, v_svc.branch_id), v_pos, auth.uid(), 'scan')
  on conflict (service_id, member_id) do nothing;
  v_new := found;

  return jsonb_build_object('ok', true, 'member_name', v_name, 'duplicate', not v_new);
end; $$;
revoke all on function public.resolve_scan(text, uuid) from public, anon;
grant execute on function public.resolve_scan(text, uuid) to authenticated;

create or replace function public.manual_attendance(p_member uuid, p_service uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_svc record; v_branch uuid; v_pos uuid; v_tenant uuid; v_new boolean;
begin
  select * into v_svc from public.services where id = p_service;
  if v_svc is null then raise exception 'Service not found'; end if;
  if not public.is_tenant_member(v_svc.tenant_id) then raise exception 'Not permitted'; end if;
  if not public.tenant_can_write(v_svc.tenant_id) then raise exception 'Subscription inactive'; end if;
  select tenant_id, branch_id, position_id into v_tenant, v_branch, v_pos from public.members where id = p_member;
  if v_tenant is distinct from v_svc.tenant_id then raise exception 'Member not found'; end if;
  insert into public.attendance (tenant_id, service_id, member_id, branch_id, position_id, scanned_by_user_id, method)
  values (v_tenant, p_service, p_member, coalesce(v_branch, v_svc.branch_id), v_pos, auth.uid(), 'manual')
  on conflict (service_id, member_id) do nothing;
  v_new := found;
  return jsonb_build_object('ok', true, 'duplicate', not v_new);
end; $$;
revoke all on function public.manual_attendance(uuid, uuid) from public, anon;
grant execute on function public.manual_attendance(uuid, uuid) to authenticated;

-- ---------- public self check-in (called only from the server with service role) ----------
create or replace function public.tenant_branding(p_subdomain text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select id, name, subdomain, logo_path, status, group_vocabulary
    into t from public.tenants where subdomain = lower(trim(coalesce(p_subdomain,'')));
  if t is null then return null; end if;
  return jsonb_build_object('id', t.id, 'name', t.name, 'subdomain', t.subdomain,
    'logo_path', t.logo_path, 'active', t.status in ('active','grace'));
end; $$;
revoke all on function public.tenant_branding(text) from public, anon;
grant execute on function public.tenant_branding(text) to service_role;

create or replace function public.self_checkin(
  p_subdomain text, p_full_name text, p_phone text, p_email text default null,
  p_dob date default null, p_gender public.gender_type default null,
  p_area text default null, p_ip text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant record; v_branch uuid; v_service uuid; v_member uuid;
        v_phone text; v_token text; v_existing boolean := false;
begin
  select * into v_tenant from public.tenants where subdomain = lower(trim(coalesce(p_subdomain,'')));
  if v_tenant is null then raise exception 'Church not found'; end if;
  if v_tenant.status not in ('active','grace') then raise exception 'This church is not accepting check-ins right now'; end if;

  if not public.check_rate_limit('self_checkin_ip', coalesce(p_ip,'unknown'), 10, 600) then
    raise exception 'Too many check-ins from this device. Please wait a few minutes.';
  end if;
  if not public.check_rate_limit('self_checkin_tenant', v_tenant.id::text, 400, 3600) then
    raise exception 'Check-in is temporarily unavailable. Please ask an usher for help.';
  end if;

  if length(trim(coalesce(p_full_name,''))) < 2 then raise exception 'Please enter your full name'; end if;
  v_phone := public.normalize_phone_gh(p_phone);
  if v_phone is null or length(v_phone) < 10 then raise exception 'Please enter a valid phone number'; end if;

  select id into v_branch from public.branches where tenant_id = v_tenant.id order by is_default desc, created_at limit 1;

  select id into v_member from public.members
   where tenant_id = v_tenant.id and phone = v_phone limit 1;

  if v_member is null then
    insert into public.members (tenant_id, branch_id, full_name, phone, email, date_of_birth,
                                gender, residential_area, status)
    values (v_tenant.id, v_branch, trim(p_full_name), v_phone, nullif(p_email,''), p_dob,
            p_gender, nullif(p_area,''), 'first_timer')
    returning id into v_member;
  else
    v_existing := true;
  end if;

  update public.qr_tokens set revoked_at = now() where member_id = v_member and revoked_at is null;
  v_token := encode(gen_random_bytes(16), 'hex');
  insert into public.qr_tokens (token_hash, tenant_id, member_id)
  values (digest(v_token, 'sha256'), v_tenant.id, v_member);

  select id into v_service from public.services
   where tenant_id = v_tenant.id and is_open and service_date = current_date
   order by created_at desc limit 1;

  if v_service is not null then
    insert into public.attendance (tenant_id, service_id, member_id, branch_id, method)
    values (v_tenant.id, v_service, v_member, v_branch, 'self_checkin')
    on conflict (service_id, member_id) do nothing;
  end if;

  perform public.log_audit(v_tenant.id, 'member.self_checkin', v_member::text,
    jsonb_build_object('returning', v_existing), p_ip, null);

  return jsonb_build_object('ok', true, 'member_id', v_member, 'token', v_token,
    'returning', v_existing, 'checked_in', v_service is not null,
    'church', v_tenant.name);
end; $$;
revoke all on function public.self_checkin(text,text,text,text,date,public.gender_type,text,text) from public, anon, authenticated;
grant execute on function public.self_checkin(text,text,text,text,date,public.gender_type,text,text) to service_role;

-- ---------- dashboard metrics ----------
create or replace function public.tenant_dashboard(p_tenant uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_tenant_member(p_tenant) then raise exception 'Not permitted'; end if;
  select jsonb_build_object(
    'members', (select count(*) from public.members where tenant_id = p_tenant and status <> 'anonymised'),
    'first_timers_30d', (select count(*) from public.members where tenant_id = p_tenant and status = 'first_timer' and created_at > now() - interval '30 days'),
    'services', (select count(*) from public.services where tenant_id = p_tenant),
    'last_service_attendance', (
      select count(distinct a.member_id) from public.attendance a
      where a.tenant_id = p_tenant and a.service_id = (
        select id from public.services where tenant_id = p_tenant order by service_date desc, created_at desc limit 1)),
    'trend', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select s.name, s.service_date,
               (select count(distinct a.member_id) from public.attendance a where a.service_id = s.id) as attendance
        from public.services s where s.tenant_id = p_tenant
        order by s.service_date desc limit 12
      ) t),
    'gender', (
      select coalesce(jsonb_agg(row_to_json(g)), '[]'::jsonb) from (
        select coalesce(gender::text,'unspecified') as label, count(*) as value
        from public.members where tenant_id = p_tenant group by 1
      ) g),
    'age_bands', (
      select coalesce(jsonb_agg(row_to_json(b)), '[]'::jsonb) from (
        select case
          when date_of_birth is null then 'Unknown'
          when date_of_birth > current_date - interval '18 years' then '0-17'
          when date_of_birth > current_date - interval '30 years' then '18-29'
          when date_of_birth > current_date - interval '45 years' then '30-44'
          when date_of_birth > current_date - interval '60 years' then '45-59'
          else '60+' end as label, count(*) as value
        from public.members where tenant_id = p_tenant group by 1 order by 1
      ) b)
  ) into v;
  return v;
end; $$;
revoke all on function public.tenant_dashboard(uuid) from public, anon;
grant execute on function public.tenant_dashboard(uuid) to authenticated;

create or replace function public.birthdays_this_month(p_tenant uuid)
returns table (id uuid, full_name text, date_of_birth date, phone text)
language sql security definer set search_path = public as $$
  select m.id, m.full_name, m.date_of_birth,
         case when m.is_minor and not public.is_tenant_admin(p_tenant) then null else m.phone end
  from public.members m
  where m.tenant_id = p_tenant
    and public.is_tenant_member(p_tenant)
    and m.date_of_birth is not null
    and extract(month from m.date_of_birth) = extract(month from current_date)
    and m.status <> 'anonymised'
  order by extract(day from m.date_of_birth);
$$;
revoke all on function public.birthdays_this_month(uuid) from public, anon;
grant execute on function public.birthdays_this_month(uuid) to authenticated;

-- ---------- data subject rights ----------
create or replace function public.anonymise_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.members where id = p_member;
  if v_tenant is null or not public.is_tenant_admin(v_tenant) then raise exception 'Not permitted'; end if;
  delete from public.qr_tokens where member_id = p_member;
  update public.attendance set member_id = null where member_id = p_member;
  update public.members set full_name = 'Anonymised member', phone = null, email = null,
     date_of_birth = null, gender = null, residential_area = null, status = 'anonymised'
   where id = p_member;
  perform public.log_audit(v_tenant, 'member.anonymised', p_member::text);
end; $$;
revoke all on function public.anonymise_member(uuid) from public, anon;
grant execute on function public.anonymise_member(uuid) to authenticated;


-- ============ 0002_payment_application_and_platform_stats.sql ============
-- Applies a verified successful Paystack charge: marks the payment, promotes any
-- pending tier, extends the subscription period and reactivates the church.
-- Service-role only: called from the signature-verified webhook route.
CREATE OR REPLACE FUNCTION public.apply_successful_payment(
  p_reference text,
  p_channel text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now(),
  p_amount bigint DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments;
  v_start date;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown payment reference';
  END IF;

  -- Idempotent: a repeated webhook delivery is a no-op.
  IF v_payment.status = 'success' THEN
    RETURN;
  END IF;

  IF p_amount IS NOT NULL AND p_amount < v_payment.amount_kobo THEN
    UPDATE public.payments
       SET status = 'underpaid', channel = p_channel, paid_at = p_paid_at
     WHERE id = v_payment.id;
    RETURN;
  END IF;

  UPDATE public.payments
     SET status = 'success', channel = p_channel, paid_at = p_paid_at
   WHERE id = v_payment.id;

  SELECT GREATEST(period_end, CURRENT_DATE) INTO v_start
    FROM public.subscriptions WHERE tenant_id = v_payment.tenant_id;

  UPDATE public.subscriptions
     SET tier = v_payment.tier,
         pending_tier = NULL,
         period_start = COALESCE(v_start, CURRENT_DATE),
         period_end = COALESCE(v_start, CURRENT_DATE) + INTERVAL '1 year',
         payment_method = CASE WHEN p_channel = 'mobile_money' THEN 'momo'::pay_method ELSE 'card'::pay_method END
   WHERE tenant_id = v_payment.tenant_id;

  UPDATE public.tenants
     SET tier = v_payment.tier, status = 'active'
   WHERE id = v_payment.tenant_id;

  PERFORM public.log_audit(
    v_payment.tenant_id,
    'payment.succeeded',
    p_reference,
    jsonb_build_object('tier', v_payment.tier, 'channel', p_channel),
    NULL,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_successful_payment(text, text, timestamptz, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_successful_payment(text, text, timestamptz, bigint) TO service_role;

-- Platform-wide roll-up for Prime Haven staff. Readable only by platform admins.
CREATE OR REPLACE FUNCTION public.platform_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  SELECT jsonb_build_object(
    'tenants', (SELECT count(*) FROM public.tenants),
    'active_tenants', (SELECT count(*) FROM public.tenants WHERE status = 'active'),
    'members', (SELECT count(*) FROM public.members WHERE status <> 'anonymised'),
    'attendance_30d', (SELECT count(*) FROM public.attendance WHERE recorded_at > now() - INTERVAL '30 days'),
    'by_tier', (SELECT jsonb_object_agg(tier, n) FROM (SELECT tier, count(*) AS n FROM public.tenants GROUP BY tier) t),
    'revenue_ghs_90d', (SELECT COALESCE(sum(amount_kobo), 0) / 100.0 FROM public.payments WHERE status = 'success' AND paid_at > now() - INTERVAL '90 days'),
    'churches', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', x.id, 'name', x.name, 'subdomain', x.subdomain, 'tier', x.tier,
        'status', x.status, 'created_at', x.created_at, 'members', x.members
      ) ORDER BY x.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT t.id, t.name, t.subdomain, t.tier, t.status, t.created_at,
               (SELECT count(*) FROM public.members m WHERE m.tenant_id = t.id AND m.status <> 'anonymised') AS members
        FROM public.tenants t
        ORDER BY t.created_at DESC
        LIMIT 200
      ) x
    )
  ) INTO v;

  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_overview() TO service_role;

-- Platform staff can suspend or restore a church account (support action).
CREATE OR REPLACE FUNCTION public.platform_set_tenant_status(p_tenant uuid, p_status tenant_status)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  UPDATE public.tenants SET status = p_status WHERE id = p_tenant;

  PERFORM public.log_audit(p_tenant, 'tenant.status_changed', p_status::text, NULL, NULL, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_set_tenant_status(uuid, tenant_status) TO authenticated;

-- ============ 0003_monthly_billing_period.sql ============
CREATE OR REPLACE FUNCTION public.apply_successful_payment(p_reference text, p_channel text DEFAULT NULL, p_paid_at timestamptz DEFAULT now(), p_amount bigint DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay public.payments;
  v_start date;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE reference = p_reference FOR UPDATE;
  IF v_pay.id IS NULL THEN
    RAISE EXCEPTION 'unknown payment reference';
  END IF;
  IF v_pay.status = 'success' THEN
    RETURN;
  END IF;

  UPDATE public.payments
     SET status = 'success',
         channel = COALESCE(p_channel, channel),
         paid_at = COALESCE(p_paid_at, now()),
         amount_kobo = COALESCE(p_amount, amount_kobo)
   WHERE id = v_pay.id;

  SELECT GREATEST(period_end, CURRENT_DATE) INTO v_start
    FROM public.subscriptions WHERE tenant_id = v_pay.tenant_id FOR UPDATE;

  UPDATE public.subscriptions
     SET tier = v_pay.tier,
         pending_tier = NULL,
         period_start = COALESCE(v_start, CURRENT_DATE),
         period_end = COALESCE(v_start, CURRENT_DATE) + INTERVAL '1 month',
         payment_method = CASE WHEN p_channel = 'mobile_money' THEN 'momo'::pay_method ELSE 'card'::pay_method END
   WHERE tenant_id = v_pay.tenant_id;

  UPDATE public.tenants
     SET tier = v_pay.tier,
         status = 'active'
   WHERE id = v_pay.tenant_id;

  PERFORM public.log_audit(v_pay.tenant_id, 'payment.succeeded', p_reference,
    jsonb_build_object('tier', v_pay.tier, 'amount', COALESCE(p_amount, v_pay.amount_kobo)), NULL, NULL);
END;
$$;

-- ============ 0004_member_service_branding_upgrade.sql ============
ALTER TABLE public.members
  ADD COLUMN marital_status text,
  ADD COLUMN occupation text;

ALTER TABLE public.tenants
  ADD COLUMN brand_primary text NOT NULL DEFAULT '#3b82f6',
  ADD COLUMN brand_accent text NOT NULL DEFAULT '#0f172a',
  ADD COLUMN welcome_message text,
  ADD COLUMN submit_button_text text NOT NULL DEFAULT 'Check in',
  ADD COLUMN background_path text;

CREATE OR REPLACE FUNCTION public.tenant_branding(p_subdomain text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  SELECT id, name, subdomain, logo_path, background_path, brand_primary, brand_accent,
         welcome_message, submit_button_text, status, group_vocabulary
    INTO t FROM public.tenants WHERE subdomain = lower(trim(coalesce(p_subdomain,'')));
  IF t IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', t.id, 'name', t.name, 'subdomain', t.subdomain,
    'logo_path', t.logo_path, 'background_path', t.background_path,
    'brand_primary', t.brand_primary, 'brand_accent', t.brand_accent,
    'welcome_message', t.welcome_message, 'submit_button_text', t.submit_button_text,
    'active', t.status IN ('active','grace')
  );
END; $$;
REVOKE ALL ON FUNCTION public.tenant_branding(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_branding(text) TO service_role;

CREATE OR REPLACE FUNCTION public.public_open_services(p_subdomain text)
RETURNS TABLE(id uuid, name text, service_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.service_date
  FROM public.services s
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE t.subdomain = lower(trim(coalesce(p_subdomain,'')))
    AND t.status IN ('active','grace')
    AND s.is_open
  ORDER BY s.service_date DESC, s.created_at DESC
  LIMIT 30
$$;
REVOKE ALL ON FUNCTION public.public_open_services(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_open_services(text) TO service_role;

CREATE OR REPLACE FUNCTION public.self_checkin_v2(
  p_subdomain text, p_service uuid, p_full_name text, p_phone text, p_email text,
  p_dob date, p_gender public.gender_type, p_marital_status text,
  p_area text, p_occupation text, p_ip text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant record; v_branch uuid; v_member uuid; v_service record;
  v_phone text; v_token text; v_existing boolean := false;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants
   WHERE subdomain = lower(trim(coalesce(p_subdomain,'')));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  IF v_tenant.status NOT IN ('active','grace') THEN
    RAISE EXCEPTION 'This church is not accepting check-ins right now';
  END IF;
  IF NOT public.check_rate_limit('self_checkin_ip', coalesce(p_ip,'unknown'), 10, 600) THEN
    RAISE EXCEPTION 'Too many check-ins from this device. Please wait a few minutes.';
  END IF;
  IF NOT public.check_rate_limit('self_checkin_tenant', v_tenant.id::text, 400, 3600) THEN
    RAISE EXCEPTION 'Check-in is temporarily unavailable. Please ask an usher for help.';
  END IF;
  IF length(trim(coalesce(p_full_name,''))) < 2 THEN RAISE EXCEPTION 'Please enter your full name'; END IF;
  IF p_marital_status IS NOT NULL AND p_marital_status NOT IN ('single','married','divorced','widowed','separated','prefer_not_to_say') THEN
    RAISE EXCEPTION 'Please select a valid marital status';
  END IF;
  IF length(coalesce(p_occupation,'')) > 120 OR length(coalesce(p_area,'')) > 120 THEN
    RAISE EXCEPTION 'A member detail is too long';
  END IF;
  SELECT s.* INTO v_service FROM public.services s
   WHERE s.id = p_service AND s.tenant_id = v_tenant.id AND s.is_open;
  IF v_service IS NULL THEN RAISE EXCEPTION 'Please select an open service'; END IF;
  v_phone := public.normalize_phone_gh(p_phone);
  IF v_phone IS NULL OR length(v_phone) < 10 THEN RAISE EXCEPTION 'Please enter a valid phone number'; END IF;
  SELECT id INTO v_branch FROM public.branches
   WHERE tenant_id = v_tenant.id ORDER BY is_default DESC, created_at LIMIT 1;
  SELECT id INTO v_member FROM public.members
   WHERE tenant_id = v_tenant.id AND phone = v_phone LIMIT 1;
  IF v_member IS NULL THEN
    INSERT INTO public.members (
      tenant_id, branch_id, full_name, phone, email, date_of_birth, gender,
      marital_status, residential_area, occupation, status
    ) VALUES (
      v_tenant.id, v_branch, trim(p_full_name), v_phone, nullif(trim(coalesce(p_email,'')),''),
      p_dob, p_gender, p_marital_status, nullif(trim(coalesce(p_area,'')),''),
      nullif(trim(coalesce(p_occupation,'')),''), 'first_timer'
    ) RETURNING id INTO v_member;
  ELSE
    v_existing := true;
    UPDATE public.members SET
      full_name = trim(p_full_name),
      email = coalesce(nullif(trim(coalesce(p_email,'')),''), email),
      date_of_birth = coalesce(p_dob, date_of_birth),
      gender = coalesce(p_gender, gender),
      marital_status = coalesce(p_marital_status, marital_status),
      residential_area = coalesce(nullif(trim(coalesce(p_area,'')),''), residential_area),
      occupation = coalesce(nullif(trim(coalesce(p_occupation,'')),''), occupation)
    WHERE id = v_member;
  END IF;
  UPDATE public.qr_tokens SET revoked_at = now() WHERE member_id = v_member AND revoked_at IS NULL;
  v_token := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.qr_tokens (token_hash, tenant_id, member_id)
  VALUES (digest(v_token, 'sha256'), v_tenant.id, v_member);
  INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, method)
  VALUES (v_tenant.id, v_service.id, v_member, v_branch, 'self_checkin')
  ON CONFLICT (service_id, member_id) DO NOTHING;
  PERFORM public.log_audit(v_tenant.id, 'member.self_checkin', v_member::text,
    jsonb_build_object('returning', v_existing, 'service_id', v_service.id), p_ip, null);
  RETURN jsonb_build_object('ok', true, 'member_id', v_member, 'token', v_token,
    'returning', v_existing, 'checked_in', true, 'church', v_tenant.name,
    'service', v_service.name);
END; $$;
REVOKE ALL ON FUNCTION public.self_checkin_v2(text,uuid,text,text,text,date,public.gender_type,text,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_checkin_v2(text,uuid,text,text,text,date,public.gender_type,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.update_tenant_branding(
  p_tenant uuid, p_name text, p_primary text, p_accent text,
  p_welcome text, p_button text, p_logo_path text, p_background_path text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_primary !~ '^#[0-9A-Fa-f]{6}$' OR p_accent !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid brand colour';
  END IF;
  IF length(trim(coalesce(p_name,''))) < 2 OR length(p_name) > 120 THEN RAISE EXCEPTION 'Invalid church name'; END IF;
  IF length(coalesce(p_welcome,'')) > 240 OR length(coalesce(p_button,'')) > 40 THEN RAISE EXCEPTION 'Brand text is too long'; END IF;
  IF p_logo_path IS NOT NULL AND p_logo_path NOT LIKE p_tenant::text || '/%' THEN RAISE EXCEPTION 'Invalid logo path'; END IF;
  IF p_background_path IS NOT NULL AND p_background_path NOT LIKE p_tenant::text || '/%' THEN RAISE EXCEPTION 'Invalid background path'; END IF;
  UPDATE public.tenants SET
    name = trim(p_name), brand_primary = lower(p_primary), brand_accent = lower(p_accent),
    welcome_message = nullif(trim(coalesce(p_welcome,'')),''),
    submit_button_text = coalesce(nullif(trim(coalesce(p_button,'')),''),'Check in'),
    logo_path = p_logo_path, background_path = p_background_path
  WHERE id = p_tenant;
  PERFORM public.log_audit(p_tenant, 'branding.updated', p_tenant::text, '{}'::jsonb, null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.update_tenant_branding(uuid,text,text,text,text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_branding(uuid,text,text,text,text,text,text,text) TO authenticated;

CREATE POLICY "tenant admins upload branding" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "tenant admins update branding" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "tenant admins delete branding" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "public reads tenant branding" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'tenant-branding');

-- ============ 0005_harden_tenant_branding_access.sql ============
REVOKE UPDATE ON public.tenants FROM authenticated;

CREATE OR REPLACE FUNCTION public.update_tenant_vocabulary(p_tenant uuid, p_vocabulary text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF length(trim(coalesce(p_vocabulary,''))) < 2 OR length(p_vocabulary) > 40 THEN
    RAISE EXCEPTION 'Invalid group name';
  END IF;
  UPDATE public.tenants SET group_vocabulary = trim(p_vocabulary) WHERE id = p_tenant;
END; $$;
REVOKE ALL ON FUNCTION public.update_tenant_vocabulary(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_vocabulary(uuid,text) TO authenticated;

DROP POLICY IF EXISTS "public reads tenant branding" ON storage.objects;
DROP POLICY IF EXISTS "tenant admins upload branding" ON storage.objects;
DROP POLICY IF EXISTS "tenant admins update branding" ON storage.objects;
CREATE POLICY "tenant admins upload branding" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
  AND lower(storage.extension(name)) IN ('png','jpg','jpeg','webp')
  AND coalesce((metadata->>'mimetype')::text, '') IN ('image/png','image/jpeg','image/webp')
);
CREATE POLICY "tenant admins update branding" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
  AND lower(storage.extension(name)) IN ('png','jpg','jpeg','webp')
  AND coalesce((metadata->>'mimetype')::text, '') IN ('image/png','image/jpeg','image/webp')
);

-- ============ 0006_secure_member_admin_and_branding_nulls.sql ============
CREATE OR REPLACE FUNCTION public.update_tenant_branding(
  p_tenant uuid, p_name text, p_primary text, p_accent text,
  p_welcome text, p_button text, p_logo_path text, p_background_path text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_logo text := nullif(trim(coalesce(p_logo_path,'')),''); v_background text := nullif(trim(coalesce(p_background_path,'')),'');
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_primary !~ '^#[0-9A-Fa-f]{6}$' OR p_accent !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid brand colour'; END IF;
  IF length(trim(coalesce(p_name,''))) < 2 OR length(p_name) > 120 THEN RAISE EXCEPTION 'Invalid church name'; END IF;
  IF length(coalesce(p_welcome,'')) > 240 OR length(coalesce(p_button,'')) > 40 THEN RAISE EXCEPTION 'Brand text is too long'; END IF;
  IF v_logo IS NOT NULL AND v_logo NOT LIKE p_tenant::text || '/%' THEN RAISE EXCEPTION 'Invalid logo path'; END IF;
  IF v_background IS NOT NULL AND v_background NOT LIKE p_tenant::text || '/%' THEN RAISE EXCEPTION 'Invalid background path'; END IF;
  UPDATE public.tenants SET name = trim(p_name), brand_primary = lower(p_primary), brand_accent = lower(p_accent),
    welcome_message = nullif(trim(coalesce(p_welcome,'')),''), submit_button_text = coalesce(nullif(trim(coalesce(p_button,'')),''),'Check in'),
    logo_path = v_logo, background_path = v_background WHERE id = p_tenant;
  PERFORM public.log_audit(p_tenant, 'branding.updated', p_tenant::text, '{}'::jsonb, null, auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.create_member(
  p_tenant uuid, p_branch uuid, p_full_name text, p_phone text, p_email text,
  p_dob date, p_gender public.gender_type, p_marital_status text, p_area text, p_occupation text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_phone text;
BEGIN
  IF NOT public.has_tenant_role(p_tenant, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_branch IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id=p_branch AND tenant_id=p_tenant) THEN RAISE EXCEPTION 'Invalid branch'; END IF;
  IF length(trim(coalesce(p_full_name,''))) < 2 OR length(p_full_name) > 120 THEN RAISE EXCEPTION 'Invalid full name'; END IF;
  IF p_marital_status IS NOT NULL AND p_marital_status NOT IN ('single','married','divorced','widowed','separated','prefer_not_to_say') THEN RAISE EXCEPTION 'Invalid marital status'; END IF;
  v_phone := CASE WHEN nullif(trim(coalesce(p_phone,'')),'') IS NULL THEN NULL ELSE public.normalize_phone_gh(p_phone) END;
  INSERT INTO public.members(tenant_id,branch_id,full_name,phone,email,date_of_birth,gender,marital_status,residential_area,occupation)
  VALUES(p_tenant,p_branch,trim(p_full_name),v_phone,nullif(trim(coalesce(p_email,'')),''),p_dob,p_gender,p_marital_status,nullif(trim(coalesce(p_area,'')),''),nullif(trim(coalesce(p_occupation,'')),''))
  RETURNING id INTO v_id;
  PERFORM public.log_audit(p_tenant,'member.created',v_id::text,'{}'::jsonb,null,auth.uid());
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_member(uuid,uuid,text,text,text,date,public.gender_type,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_member(uuid,uuid,text,text,text,date,public.gender_type,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.anonymise_member(p_member uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.members WHERE id = p_member;
  IF v_tenant IS NULL OR NOT public.is_tenant_admin(v_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  UPDATE public.members SET full_name='Anonymised member', phone=NULL, email=NULL, date_of_birth=NULL,
    gender=NULL, marital_status=NULL, residential_area=NULL, occupation=NULL, position_id=NULL, status='anonymised'
  WHERE id=p_member;
  UPDATE public.qr_tokens SET revoked_at=now() WHERE member_id=p_member AND revoked_at IS NULL;
  PERFORM public.log_audit(v_tenant,'member.anonymised',p_member::text,'{}'::jsonb,null,auth.uid());
END; $$;

-- ============ 0007_entitlements_messaging_and_scale.sql ============
-- ============================================================
-- 1. Package entitlements (single source of truth)
-- ============================================================
CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier public.tenant_tier)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_tier
    WHEN 'basic' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false,
      'structure', false, 'groups', false, 'branches', false,
      'email', true, 'sms', false, 'broadcasts', false, 'automations', false,
      'audit', true, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200)
    WHEN 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true,
      'structure', true, 'groups', true, 'branches', false,
      'email', true, 'sms', false, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000)
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true,
      'structure', true, 'groups', true, 'branches', true,
      'email', true, 'sms', true, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000)
  END
$$;
REVOKE ALL ON FUNCTION public.tier_entitlements(public.tenant_tier) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tier_entitlements(public.tenant_tier) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_features(_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tier public.tenant_tier;
BEGIN
  SELECT tier INTO v_tier FROM public.tenants WHERE id = _tenant;
  IF v_tier IS NULL THEN RETURN '{}'::jsonb; END IF;
  RETURN public.tier_entitlements(v_tier);
END; $$;
REVOKE ALL ON FUNCTION public.tenant_features(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_features(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_has_feature(_tenant uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((public.tier_entitlements(t.tier) ->> _feature) = 'true', false)
  FROM public.tenants t WHERE t.id = _tenant
$$;
REVOKE ALL ON FUNCTION public.tenant_has_feature(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_has_feature(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_limit(_tenant uuid, _key text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((public.tier_entitlements(t.tier) ->> _key)::int, 0)
  FROM public.tenants t WHERE t.id = _tenant
$$;
REVOKE ALL ON FUNCTION public.tenant_limit(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_limit(uuid, text) TO authenticated, service_role;

-- ============================================================
-- 2. Messaging columns
-- ============================================================
ALTER TABLE public.members
  ADD COLUMN messaging_opt_out boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenants
  ADD COLUMN reply_to_email citext,
  ADD COLUMN sms_sender_id text,
  ADD COLUMN quiet_hour_start smallint NOT NULL DEFAULT 21,
  ADD COLUMN quiet_hour_end smallint NOT NULL DEFAULT 7,
  ADD COLUMN absence_threshold smallint NOT NULL DEFAULT 3;

-- ============================================================
-- 3. Broadcasts + message queue
-- ============================================================
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  subject text,
  body text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read broadcasts" ON public.broadcasts
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  broadcast_id uuid REFERENCES public.broadcasts(id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  recipient text NOT NULL,
  subject text,
  body text NOT NULL,
  trigger text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','failed','skipped','cancelled')),
  provider_id text,
  error text,
  attempts smallint NOT NULL DEFAULT 0,
  dedupe_key text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read messages" ON public.messages
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE UNIQUE INDEX messages_dedupe_idx
  ON public.messages (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX messages_tenant_status_idx ON public.messages (tenant_id, status, created_at DESC);
CREATE INDEX messages_pending_idx ON public.messages (scheduled_at) WHERE status = 'queued';
CREATE INDEX broadcasts_tenant_idx ON public.broadcasts (tenant_id, created_at DESC);

-- ============================================================
-- 4. Scale: indexes for the queries that grow
-- ============================================================
CREATE INDEX IF NOT EXISTS attendance_tenant_recorded_idx
  ON public.attendance (tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS attendance_member_idx
  ON public.attendance (member_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS attendance_branch_idx
  ON public.attendance (tenant_id, branch_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS members_tenant_name_idx
  ON public.members (tenant_id, full_name);
CREATE INDEX IF NOT EXISTS members_tenant_phone_idx
  ON public.members (tenant_id, phone);
CREATE INDEX IF NOT EXISTS members_tenant_status_idx
  ON public.members (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS members_tenant_position_idx
  ON public.members (tenant_id, position_id);
CREATE INDEX IF NOT EXISTS members_dob_idx
  ON public.members (tenant_id, date_of_birth);
CREATE INDEX IF NOT EXISTS services_tenant_date_idx
  ON public.services (tenant_id, service_date DESC);
CREATE INDEX IF NOT EXISTS audit_tenant_created_idx
  ON public.audit_events (tenant_id, created_at DESC);

-- ============================================================
-- 5. Usage counters against package limits
-- ============================================================
CREATE OR REPLACE FUNCTION public.tenant_usage(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_members int; v_staff int; v_today int; v_month int;
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT count(*) INTO v_members FROM public.members
   WHERE tenant_id = p_tenant AND status <> 'anonymised';
  SELECT count(*) INTO v_staff FROM public.tenant_users
   WHERE tenant_id = p_tenant AND status = 'active';
  SELECT count(*) INTO v_today FROM public.messages
   WHERE tenant_id = p_tenant AND created_at >= current_date;
  SELECT count(*) INTO v_month FROM public.messages
   WHERE tenant_id = p_tenant AND created_at >= date_trunc('month', now());
  RETURN jsonb_build_object(
    'members', v_members, 'staff', v_staff,
    'messages_today', v_today, 'messages_month', v_month,
    'features', public.tenant_features(p_tenant));
END; $$;
REVOKE ALL ON FUNCTION public.tenant_usage(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_usage(uuid) TO authenticated;

-- ============================================================
-- 6. Secure bulk member import (replaces direct table writes)
-- ============================================================
CREATE OR REPLACE FUNCTION public.import_members_batch(
  p_tenant uuid, p_branch uuid, p_filename text, p_rows jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb; v_batch uuid; v_phone text; v_branch uuid; v_limit int;
  v_total int := 0; v_inserted int := 0; v_skipped int := 0; v_existing uuid;
  v_name text; v_email text; v_dob date; v_gender public.gender_type; v_marital text;
BEGIN
  IF NOT (public.is_tenant_admin(p_tenant)
     OR public.has_tenant_role(p_tenant, ARRAY['branch_admin']::public.app_role[])) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF NOT public.tenant_can_write(p_tenant) THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
  IF NOT public.check_rate_limit('import_members', auth.uid()::text, 20, 3600) THEN
    RAISE EXCEPTION 'Too many imports. Please try again later.';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Invalid import data'; END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total = 0 THEN RAISE EXCEPTION 'The file has no rows'; END IF;
  IF v_total > 2000 THEN RAISE EXCEPTION 'Please import at most 2000 rows at a time'; END IF;

  v_limit := public.tenant_limit(p_tenant, 'member_limit');
  IF (SELECT count(*) FROM public.members WHERE tenant_id = p_tenant) + v_total > v_limit THEN
    RAISE EXCEPTION 'This import would exceed your package limit of % members', v_limit;
  END IF;

  IF public.tenant_has_feature(p_tenant, 'branches') AND p_branch IS NOT NULL THEN
    SELECT id INTO v_branch FROM public.branches WHERE id = p_branch AND tenant_id = p_tenant;
  END IF;
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM public.branches
     WHERE tenant_id = p_tenant ORDER BY is_default DESC, created_at LIMIT 1;
  END IF;

  INSERT INTO public.import_batches (tenant_id, created_by, filename, row_count)
  VALUES (p_tenant, auth.uid(), left(coalesce(p_filename,'upload'), 200), v_total)
  RETURNING id INTO v_batch;

  FOR r IN SELECT jsonb_array_elements(p_rows) LOOP
    v_name := nullif(btrim(coalesce(r->>'full_name','')), '');
    v_phone := public.normalize_phone_gh(r->>'phone');
    IF v_name IS NULL OR length(v_name) > 120 OR v_phone IS NULL OR length(v_phone) < 10 THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    v_email := nullif(btrim(coalesce(r->>'email','')), '');
    IF v_email IS NOT NULL AND (length(v_email) > 160 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
      v_email := NULL;
    END IF;
    BEGIN v_dob := nullif(r->>'date_of_birth','')::date; EXCEPTION WHEN others THEN v_dob := NULL; END;
    v_gender := CASE lower(coalesce(r->>'gender',''))
      WHEN 'male' THEN 'male'::public.gender_type
      WHEN 'female' THEN 'female'::public.gender_type
      WHEN 'other' THEN 'other'::public.gender_type ELSE NULL END;
    v_marital := CASE lower(coalesce(r->>'marital_status',''))
      WHEN 'single' THEN 'single' WHEN 'married' THEN 'married' WHEN 'divorced' THEN 'divorced'
      WHEN 'widowed' THEN 'widowed' WHEN 'separated' THEN 'separated' ELSE NULL END;

    SELECT id INTO v_existing FROM public.members
     WHERE tenant_id = p_tenant AND phone = v_phone LIMIT 1;
    IF v_existing IS NOT NULL THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    INSERT INTO public.members (
      tenant_id, branch_id, full_name, phone, email, date_of_birth, gender,
      marital_status, residential_area, occupation, status, import_batch_id
    ) VALUES (
      p_tenant, v_branch, v_name, v_phone, v_email, v_dob, v_gender, v_marital,
      left(nullif(btrim(coalesce(r->>'residential_area','')),''), 120),
      left(nullif(btrim(coalesce(r->>'occupation','')),''), 120),
      'active', v_batch
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  UPDATE public.import_batches
     SET inserted_count = v_inserted, skipped_count = v_skipped WHERE id = v_batch;
  PERFORM public.log_audit(p_tenant, 'members.imported', v_batch::text,
    jsonb_build_object('rows', v_total, 'inserted', v_inserted, 'skipped', v_skipped),
    null, auth.uid());
  RETURN jsonb_build_object('batch_id', v_batch, 'rows', v_total,
    'inserted', v_inserted, 'skipped', v_skipped);
END; $$;
REVOKE ALL ON FUNCTION public.import_members_batch(uuid,uuid,text,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.import_members_batch(uuid,uuid,text,jsonb) TO authenticated;

-- ============================================================
-- 7. Auditable exports
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_member_export(p_tenant uuid, p_count integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.check_rate_limit('member_export', auth.uid()::text, 20, 3600) THEN
    RAISE EXCEPTION 'Too many exports. Please try again later.';
  END IF;
  PERFORM public.log_audit(p_tenant, 'members.exported', null,
    jsonb_build_object('rows', greatest(coalesce(p_count,0), 0)), null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.log_member_export(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_member_export(uuid, integer) TO authenticated;

-- ============================================================
-- 8. Message enqueueing
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_message(
  p_tenant uuid, p_channel text, p_member uuid, p_recipient text,
  p_subject text, p_body text, p_trigger text, p_dedupe text,
  p_broadcast uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_cap int; v_today int; v_opt boolean;
BEGIN
  IF p_channel NOT IN ('email','sms') THEN RAISE EXCEPTION 'Invalid channel'; END IF;
  IF NOT public.tenant_has_feature(p_tenant, p_channel) THEN RETURN NULL; END IF;
  IF nullif(btrim(coalesce(p_recipient,'')),'') IS NULL THEN RETURN NULL; END IF;
  IF length(coalesce(p_body,'')) = 0 THEN RETURN NULL; END IF;

  IF p_member IS NOT NULL THEN
    SELECT messaging_opt_out INTO v_opt FROM public.members
     WHERE id = p_member AND tenant_id = p_tenant;
    IF v_opt IS NULL OR v_opt THEN RETURN NULL; END IF;
  END IF;

  v_cap := public.tenant_limit(p_tenant, 'daily_messages');
  SELECT count(*) INTO v_today FROM public.messages
   WHERE tenant_id = p_tenant AND created_at >= current_date;
  IF v_today >= v_cap THEN RETURN NULL; END IF;

  INSERT INTO public.messages (
    tenant_id, broadcast_id, member_id, channel, recipient, subject, body, trigger, dedupe_key
  ) VALUES (
    p_tenant, p_broadcast, p_member, p_channel, btrim(p_recipient),
    left(nullif(btrim(coalesce(p_subject,'')),''), 200), left(p_body, 4000),
    coalesce(nullif(btrim(coalesce(p_trigger,'')),''),'manual'),
    nullif(btrim(coalesce(p_dedupe,'')),'')
  )
  ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_message(uuid,text,uuid,text,text,text,text,text,uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_message(uuid,text,uuid,text,text,text,text,text,uuid)
  TO service_role;

-- ============================================================
-- 9. Audience resolution (drives broadcasts and reports)
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_audience(
  p_tenant uuid, p_channel text, p_kind text, p_ref uuid
) RETURNS TABLE(member_id uuid, full_name text, recipient text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_threshold smallint;
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT absence_threshold INTO v_threshold FROM public.tenants WHERE id = p_tenant;

  RETURN QUERY
  SELECT m.id, m.full_name,
         CASE WHEN p_channel = 'email' THEN m.email::text ELSE m.phone END AS recipient
  FROM public.members m
  WHERE m.tenant_id = p_tenant
    AND m.status IN ('first_timer','active')
    AND NOT m.messaging_opt_out
    AND NOT m.is_minor
    AND public.can_read_member(m.tenant_id, m.branch_id, m.position_id)
    AND CASE WHEN p_channel = 'email' THEN m.email IS NOT NULL ELSE m.phone IS NOT NULL END
    AND CASE p_kind
      WHEN 'all' THEN true
      WHEN 'branch' THEN m.branch_id = p_ref
      WHEN 'group' THEN m.position_id = p_ref
      WHEN 'first_timers' THEN m.status = 'first_timer'
      WHEN 'birthdays_month' THEN extract(month from m.date_of_birth) = extract(month from now())
      WHEN 'absent' THEN NOT EXISTS (
        SELECT 1 FROM public.attendance a
        JOIN public.services s ON s.id = a.service_id
        WHERE a.member_id = m.id
          AND s.service_date >= current_date - (coalesce(v_threshold,3) * 7))
      ELSE false END
  ORDER BY m.full_name
  LIMIT 5000;
END; $$;
REVOKE ALL ON FUNCTION public.resolve_audience(uuid,text,text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_audience(uuid,text,text,uuid) TO authenticated, service_role;

-- ============================================================
-- 10. Broadcast queueing (admins; dry run supported)
-- ============================================================
CREATE OR REPLACE FUNCTION public.queue_broadcast(
  p_tenant uuid, p_channel text, p_subject text, p_body text,
  p_kind text, p_ref uuid, p_dry_run boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_broadcast uuid; v_row record; v_queued int := 0; v_total int := 0;
  v_cap int; v_today int;
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.tenant_can_write(p_tenant) THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
  IF p_channel NOT IN ('email','sms') THEN RAISE EXCEPTION 'Invalid channel'; END IF;
  IF NOT public.tenant_has_feature(p_tenant, 'broadcasts') THEN
    RAISE EXCEPTION 'Broadcasts are not included in your package';
  END IF;
  IF NOT public.tenant_has_feature(p_tenant, p_channel) THEN
    RAISE EXCEPTION 'That channel is not included in your package';
  END IF;
  IF p_kind NOT IN ('all','branch','group','first_timers','absent','birthdays_month') THEN
    RAISE EXCEPTION 'Please choose a valid audience';
  END IF;
  IF p_kind IN ('branch','group') AND p_ref IS NULL THEN
    RAISE EXCEPTION 'Please choose which one to send to';
  END IF;
  IF p_kind = 'branch' AND NOT public.tenant_has_feature(p_tenant, 'branches') THEN
    RAISE EXCEPTION 'Branches are not included in your package';
  END IF;
  IF p_kind = 'group' AND NOT public.tenant_has_feature(p_tenant, 'groups') THEN
    RAISE EXCEPTION 'Groups are not included in your package';
  END IF;
  IF length(btrim(coalesce(p_body,''))) < 2 THEN RAISE EXCEPTION 'Please write a message'; END IF;
  IF length(p_body) > 1200 THEN RAISE EXCEPTION 'Please keep the message under 1200 characters'; END IF;
  IF p_channel = 'sms' AND length(p_body) > 480 THEN
    RAISE EXCEPTION 'Text messages must be under 480 characters';
  END IF;
  IF p_channel = 'email' AND length(btrim(coalesce(p_subject,''))) < 2 THEN
    RAISE EXCEPTION 'Please add a subject';
  END IF;
  IF NOT public.check_rate_limit('broadcast', p_tenant::text, 20, 3600) THEN
    RAISE EXCEPTION 'Too many sends in the last hour. Please try again later.';
  END IF;

  SELECT count(*) INTO v_total FROM public.resolve_audience(p_tenant, p_channel, p_kind, p_ref);

  IF p_dry_run THEN
    RETURN jsonb_build_object('dry_run', true, 'recipients', v_total, 'queued', 0);
  END IF;
  IF v_total = 0 THEN RAISE EXCEPTION 'Nobody in that audience has a usable contact detail'; END IF;

  v_cap := public.tenant_limit(p_tenant, 'daily_messages');
  SELECT count(*) INTO v_today FROM public.messages
   WHERE tenant_id = p_tenant AND created_at >= current_date;
  IF v_today + v_total > v_cap THEN
    RAISE EXCEPTION 'This send would pass your daily limit of % messages', v_cap;
  END IF;

  INSERT INTO public.broadcasts (tenant_id, created_by, channel, audience, subject, body, recipient_count)
  VALUES (p_tenant, auth.uid(), p_channel,
          jsonb_build_object('kind', p_kind, 'ref', p_ref),
          left(nullif(btrim(coalesce(p_subject,'')),''), 200), p_body, v_total)
  RETURNING id INTO v_broadcast;

  FOR v_row IN SELECT * FROM public.resolve_audience(p_tenant, p_channel, p_kind, p_ref) LOOP
    INSERT INTO public.messages (
      tenant_id, broadcast_id, member_id, channel, recipient, subject, body, trigger
    ) VALUES (
      p_tenant, v_broadcast, v_row.member_id, p_channel, v_row.recipient,
      left(nullif(btrim(coalesce(p_subject,'')),''), 200),
      replace(p_body, '{{name}}', split_part(v_row.full_name, ' ', 1)), 'broadcast'
    );
    v_queued := v_queued + 1;
  END LOOP;

  PERFORM public.log_audit(p_tenant, 'broadcast.queued', v_broadcast::text,
    jsonb_build_object('channel', p_channel, 'audience', p_kind, 'recipients', v_queued),
    null, auth.uid());
  RETURN jsonb_build_object('dry_run', false, 'broadcast_id', v_broadcast,
    'recipients', v_total, 'queued', v_queued);
END; $$;
REVOKE ALL ON FUNCTION public.queue_broadcast(uuid,text,text,text,text,uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.queue_broadcast(uuid,text,text,text,text,uuid,boolean) TO authenticated;

-- ============================================================
-- 11. Queue worker surface (service role only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_pending_messages(p_limit integer)
RETURNS TABLE(
  id uuid, tenant_id uuid, channel text, recipient text, subject text, body text,
  church_name text, reply_to text, sms_sender text, brand_primary text, logo_path text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE public.messages m SET status = 'sending', attempts = m.attempts + 1
    WHERE m.id IN (
      SELECT c.id FROM public.messages c
      JOIN public.tenants t ON t.id = c.tenant_id
      WHERE c.status = 'queued'
        AND c.scheduled_at <= now()
        AND c.attempts < 3
        AND t.status IN ('active','grace')
        AND NOT (
          CASE WHEN t.quiet_hour_start > t.quiet_hour_end
            THEN extract(hour from now()) >= t.quiet_hour_start
              OR extract(hour from now()) < t.quiet_hour_end
            ELSE extract(hour from now()) >= t.quiet_hour_start
             AND extract(hour from now()) < t.quiet_hour_end END)
      ORDER BY c.scheduled_at
      LIMIT greatest(least(coalesce(p_limit, 50), 200), 1)
      FOR UPDATE SKIP LOCKED)
    RETURNING m.*)
  SELECT c.id, c.tenant_id, c.channel, c.recipient, c.subject, c.body,
         t.name, t.reply_to_email::text, t.sms_sender_id, t.brand_primary, t.logo_path
  FROM claimed c JOIN public.tenants t ON t.id = c.tenant_id;
END; $$;
REVOKE ALL ON FUNCTION public.claim_pending_messages(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_messages(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_message_result(
  p_id uuid, p_ok boolean, p_provider_id text, p_error text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_attempts smallint;
BEGIN
  SELECT attempts INTO v_attempts FROM public.messages WHERE id = p_id;
  IF v_attempts IS NULL THEN RETURN; END IF;
  IF p_ok THEN
    UPDATE public.messages SET status = 'sent', sent_at = now(),
      provider_id = left(coalesce(p_provider_id,''), 200), error = NULL
     WHERE id = p_id;
  ELSE
    UPDATE public.messages SET
      status = CASE WHEN v_attempts >= 3 THEN 'failed' ELSE 'queued' END,
      scheduled_at = now() + (v_attempts * interval '10 minutes'),
      error = left(coalesce(p_error,'Send failed'), 400)
     WHERE id = p_id;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.mark_message_result(uuid,boolean,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_message_result(uuid,boolean,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_delivery_event(
  p_provider_id text, p_event text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_msg record;
BEGIN
  SELECT * INTO v_msg FROM public.messages
   WHERE provider_id = p_provider_id ORDER BY created_at DESC LIMIT 1;
  IF v_msg IS NULL THEN RETURN; END IF;
  IF p_event IN ('bounced','complained','failed') THEN
    UPDATE public.messages SET status = 'failed', error = p_event WHERE id = v_msg.id;
    IF v_msg.member_id IS NOT NULL AND p_event IN ('bounced','complained') THEN
      UPDATE public.members SET messaging_opt_out = true WHERE id = v_msg.member_id;
    END IF;
    PERFORM public.log_audit(v_msg.tenant_id, 'message.' || p_event, v_msg.id::text,
      jsonb_build_object('channel', v_msg.channel));
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.record_delivery_event(text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_delivery_event(text,text) TO service_role;

-- ============================================================
-- 12. Automations: birthdays + absence follow-up
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_daily_automations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record; m record; v_birthdays int := 0; v_absent int := 0; v_channel text; v_dest text;
BEGIN
  FOR t IN SELECT * FROM public.tenants WHERE status IN ('active','grace') LOOP
    IF NOT public.tenant_has_feature(t.id, 'automations') THEN CONTINUE; END IF;
    v_channel := CASE WHEN public.tenant_has_feature(t.id, 'sms') THEN 'sms' ELSE 'email' END;

    FOR m IN
      SELECT id, full_name, email, phone FROM public.members
      WHERE tenant_id = t.id AND status IN ('first_timer','active')
        AND NOT messaging_opt_out AND NOT is_minor AND date_of_birth IS NOT NULL
        AND extract(month from date_of_birth) = extract(month from current_date)
        AND extract(day from date_of_birth) = extract(day from current_date)
      LIMIT 500
    LOOP
      v_dest := CASE WHEN v_channel = 'sms' THEN m.phone ELSE m.email::text END;
      IF public.enqueue_message(t.id, v_channel, m.id, v_dest,
        'Happy birthday, ' || split_part(m.full_name,' ',1) || '!',
        'Happy birthday ' || split_part(m.full_name,' ',1) ||
        '! The whole family at ' || t.name || ' is celebrating with you today. God bless you.',
        'birthday', 'birthday:' || m.id::text || ':' || to_char(current_date,'YYYY')) IS NOT NULL
      THEN v_birthdays := v_birthdays + 1; END IF;
    END LOOP;

    IF extract(dow from current_date) = 2 THEN
      FOR m IN
        SELECT ra.member_id AS id, ra.full_name, ra.recipient
        FROM public.resolve_audience(t.id, v_channel, 'absent', NULL) ra
        LIMIT 300
      LOOP
        IF public.enqueue_message(t.id, v_channel, m.id, m.recipient,
          'We have missed you at ' || t.name,
          'Hello ' || split_part(m.full_name,' ',1) ||
          ', we have missed you at ' || t.name ||
          '. We would love to see you at our next service.',
          'absence', 'absence:' || m.id::text || ':' || to_char(current_date,'IYYY-IW')) IS NOT NULL
        THEN v_absent := v_absent + 1; END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('birthdays', v_birthdays, 'absence', v_absent);
END; $$;
REVOKE ALL ON FUNCTION public.run_daily_automations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_daily_automations() TO service_role;

-- ============================================================
-- 13. Welcome message on first check-in (extends self check-in)
-- ============================================================
CREATE OR REPLACE FUNCTION public.self_checkin_v2(
  p_subdomain text, p_service uuid, p_full_name text, p_phone text, p_email text,
  p_dob date, p_gender public.gender_type, p_marital_status text,
  p_area text, p_occupation text, p_ip text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant record; v_branch uuid; v_member uuid; v_service record;
  v_phone text; v_token text; v_existing boolean := false;
  v_channel text; v_dest text; v_email text;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants
   WHERE subdomain = lower(trim(coalesce(p_subdomain,'')));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  IF v_tenant.status NOT IN ('active','grace') THEN
    RAISE EXCEPTION 'This church is not accepting check-ins right now';
  END IF;
  IF NOT public.check_rate_limit('self_checkin_ip', coalesce(p_ip,'unknown'), 10, 600) THEN
    RAISE EXCEPTION 'Too many check-ins from this device. Please wait a few minutes.';
  END IF;
  IF NOT public.check_rate_limit('self_checkin_tenant', v_tenant.id::text, 400, 3600) THEN
    RAISE EXCEPTION 'Check-in is temporarily unavailable. Please ask an usher for help.';
  END IF;
  IF length(trim(coalesce(p_full_name,''))) < 2 OR length(p_full_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your full name';
  END IF;
  IF p_marital_status IS NOT NULL AND p_marital_status NOT IN
     ('single','married','divorced','widowed','separated','prefer_not_to_say') THEN
    RAISE EXCEPTION 'Please select a valid marital status';
  END IF;
  IF length(coalesce(p_occupation,'')) > 120 OR length(coalesce(p_area,'')) > 120 THEN
    RAISE EXCEPTION 'A member detail is too long';
  END IF;
  v_email := nullif(btrim(coalesce(p_email,'')),'');
  IF v_email IS NOT NULL AND (length(v_email) > 160 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'Please enter a valid email address';
  END IF;
  SELECT s.* INTO v_service FROM public.services s
   WHERE s.id = p_service AND s.tenant_id = v_tenant.id AND s.is_open;
  IF v_service IS NULL THEN RAISE EXCEPTION 'Please select an open service'; END IF;

  v_phone := public.normalize_phone_gh(p_phone);
  IF v_phone IS NULL OR length(v_phone) < 10 THEN RAISE EXCEPTION 'Please enter a valid phone number'; END IF;

  SELECT id INTO v_branch FROM public.branches
   WHERE tenant_id = v_tenant.id
     AND (v_service.branch_id IS NULL OR id = v_service.branch_id)
   ORDER BY is_default DESC, created_at LIMIT 1;

  SELECT id INTO v_member FROM public.members
   WHERE tenant_id = v_tenant.id AND phone = v_phone LIMIT 1;

  IF v_member IS NULL THEN
    IF (SELECT count(*) FROM public.members WHERE tenant_id = v_tenant.id)
       >= public.tenant_limit(v_tenant.id, 'member_limit') THEN
      RAISE EXCEPTION 'This church has reached its member limit. Please ask an usher for help.';
    END IF;
    INSERT INTO public.members (
      tenant_id, branch_id, full_name, phone, email, date_of_birth, gender,
      marital_status, residential_area, occupation, status
    ) VALUES (
      v_tenant.id, v_branch, trim(p_full_name), v_phone, v_email,
      p_dob, p_gender, p_marital_status, nullif(trim(coalesce(p_area,'')),''),
      nullif(trim(coalesce(p_occupation,'')),''), 'first_timer'
    ) RETURNING id INTO v_member;
  ELSE
    v_existing := true;
    UPDATE public.members SET
      full_name = trim(p_full_name),
      email = coalesce(v_email, email),
      date_of_birth = coalesce(p_dob, date_of_birth),
      gender = coalesce(p_gender, gender),
      marital_status = coalesce(p_marital_status, marital_status),
      residential_area = coalesce(nullif(trim(coalesce(p_area,'')),''), residential_area),
      occupation = coalesce(nullif(trim(coalesce(p_occupation,'')),''), occupation)
    WHERE id = v_member;
  END IF;

  UPDATE public.qr_tokens SET revoked_at = now() WHERE member_id = v_member AND revoked_at IS NULL;
  v_token := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.qr_tokens (token_hash, tenant_id, member_id)
  VALUES (digest(v_token, 'sha256'), v_tenant.id, v_member);

  INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, method)
  VALUES (v_tenant.id, v_service.id, v_member, coalesce(v_branch, v_service.branch_id), 'self_checkin')
  ON CONFLICT (service_id, member_id) DO NOTHING;

  IF NOT v_existing THEN
    v_channel := CASE
      WHEN v_email IS NOT NULL AND public.tenant_has_feature(v_tenant.id,'email') THEN 'email'
      WHEN public.tenant_has_feature(v_tenant.id,'sms') THEN 'sms' ELSE NULL END;
    IF v_channel IS NOT NULL THEN
      v_dest := CASE WHEN v_channel = 'email' THEN v_email ELSE v_phone END;
      PERFORM public.enqueue_message(v_tenant.id, v_channel, v_member, v_dest,
        'Welcome to ' || v_tenant.name,
        'Welcome to ' || v_tenant.name || ', ' || split_part(trim(p_full_name),' ',1) ||
        '! Your member code is ' || v_token ||
        '. Keep your QR code safe and show it when you arrive next time.',
        'welcome', 'welcome:' || v_member::text);
    END IF;
  END IF;

  PERFORM public.log_audit(v_tenant.id, 'member.self_checkin', v_member::text,
    jsonb_build_object('returning', v_existing, 'service_id', v_service.id), p_ip, null);
  RETURN jsonb_build_object('ok', true, 'member_id', v_member, 'token', v_token,
    'returning', v_existing, 'checked_in', true, 'church', v_tenant.name,
    'service', v_service.name);
END; $$;
REVOKE ALL ON FUNCTION public.self_checkin_v2(text,uuid,text,text,text,date,public.gender_type,text,text,text,text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_checkin_v2(text,uuid,text,text,text,date,public.gender_type,text,text,text,text)
  TO service_role;

-- ============================================================
-- 14. Package-aware guards on existing surfaces
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_member_messaging(p_member uuid, p_opt_out boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.members WHERE id = p_member;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT public.is_tenant_admin(v_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  UPDATE public.members SET messaging_opt_out = coalesce(p_opt_out, false) WHERE id = p_member;
  PERFORM public.log_audit(v_tenant, 'member.messaging_changed', p_member::text,
    jsonb_build_object('opt_out', p_opt_out), null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.set_member_messaging(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_member_messaging(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_messaging_settings(
  p_tenant uuid, p_reply_to text, p_sms_sender text,
  p_quiet_start smallint, p_quiet_end smallint, p_absence smallint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_reply_to IS NOT NULL AND btrim(p_reply_to) <> ''
     AND btrim(p_reply_to) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter a valid reply-to email address';
  END IF;
  IF p_sms_sender IS NOT NULL AND btrim(p_sms_sender) <> ''
     AND btrim(p_sms_sender) !~ '^[A-Za-z0-9 ]{3,11}$' THEN
    RAISE EXCEPTION 'The text-message sender name must be 3-11 letters or numbers';
  END IF;
  IF coalesce(p_quiet_start,21) NOT BETWEEN 0 AND 23
     OR coalesce(p_quiet_end,7) NOT BETWEEN 0 AND 23 THEN
    RAISE EXCEPTION 'Quiet hours must be between 0 and 23';
  END IF;
  IF coalesce(p_absence,3) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Follow-up weeks must be between 1 and 12';
  END IF;
  UPDATE public.tenants SET
    reply_to_email = nullif(btrim(coalesce(p_reply_to,'')),'')::citext,
    sms_sender_id = nullif(btrim(coalesce(p_sms_sender,'')),''),
    quiet_hour_start = coalesce(p_quiet_start, 21),
    quiet_hour_end = coalesce(p_quiet_end, 7),
    absence_threshold = coalesce(p_absence, 3)
  WHERE id = p_tenant;
  PERFORM public.log_audit(p_tenant, 'messaging.settings_updated', p_tenant::text,
    '{}'::jsonb, null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.update_messaging_settings(uuid,text,text,smallint,smallint,smallint)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_messaging_settings(uuid,text,text,smallint,smallint,smallint)
  TO authenticated;

-- ============================================================
-- 15. Advanced reports (Standard/Premium), server-side aggregates
-- ============================================================
CREATE OR REPLACE FUNCTION public.attendance_insights(p_tenant uuid, p_weeks integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from date; v_series jsonb; v_groups jsonb; v_branches jsonb; v_demo jsonb;
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  v_from := current_date - (greatest(least(coalesce(p_weeks,12), 52), 1) * 7);

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'service_date'), '[]'::jsonb) INTO v_series FROM (
    SELECT jsonb_build_object('service_date', s.service_date, 'name', s.name,
      'total', count(a.id),
      'first_timers', count(a.id) FILTER (WHERE m.status = 'first_timer')) AS x
    FROM public.services s
    LEFT JOIN public.attendance a ON a.service_id = s.id
    LEFT JOIN public.members m ON m.id = a.member_id
    WHERE s.tenant_id = p_tenant AND s.service_date >= v_from
    GROUP BY s.id, s.service_date, s.name) q;

  IF public.tenant_has_feature(p_tenant, 'groups') THEN
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_groups FROM (
      SELECT jsonb_build_object('group_name', p.group_name,
        'members', count(DISTINCT m.id), 'attendances', count(a.id)) AS x
      FROM public.positions p
      LEFT JOIN public.members m ON m.position_id = p.id
      LEFT JOIN public.attendance a ON a.member_id = m.id AND a.recorded_at >= v_from
      WHERE p.tenant_id = p_tenant
      GROUP BY p.id, p.group_name ORDER BY count(a.id) DESC LIMIT 40) q;
  ELSE v_groups := '[]'::jsonb; END IF;

  IF public.tenant_has_feature(p_tenant, 'branches') THEN
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_branches FROM (
      SELECT jsonb_build_object('branch', b.name,
        'members', count(DISTINCT m.id), 'attendances', count(a.id)) AS x
      FROM public.branches b
      LEFT JOIN public.members m ON m.branch_id = b.id
      LEFT JOIN public.attendance a ON a.branch_id = b.id AND a.recorded_at >= v_from
      WHERE b.tenant_id = p_tenant
      GROUP BY b.id, b.name ORDER BY b.name) q;
  ELSE v_branches := '[]'::jsonb; END IF;

  SELECT jsonb_build_object(
    'male', count(*) FILTER (WHERE gender = 'male'),
    'female', count(*) FILTER (WHERE gender = 'female'),
    'married', count(*) FILTER (WHERE marital_status = 'married'),
    'single', count(*) FILTER (WHERE marital_status = 'single'),
    'minors', count(*) FILTER (WHERE is_minor),
    'total', count(*)) INTO v_demo
  FROM public.members WHERE tenant_id = p_tenant AND status IN ('first_timer','active');

  RETURN jsonb_build_object('services', v_series, 'groups', v_groups,
    'branches', v_branches, 'demographics', v_demo);
END; $$;
REVOKE ALL ON FUNCTION public.attendance_insights(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attendance_insights(uuid, integer) TO authenticated;

-- ============================================================
-- 16. Seat limit enforcement on staff invitations
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_add_staff(p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT count(*) FROM public.tenant_users
          WHERE tenant_id = p_tenant AND status = 'active')
         < public.tenant_limit(p_tenant, 'staff_seats')
$$;
REVOKE ALL ON FUNCTION public.can_add_staff(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_add_staff(uuid) TO authenticated, service_role;

-- ============ 0008_ask_mene_and_platform_operations.sql ============
CREATE TABLE public.ask_mene_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_mene_conversations TO authenticated;
GRANT ALL ON public.ask_mene_conversations TO service_role;
ALTER TABLE public.ask_mene_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read ask mene conversation" ON public.ask_mene_conversations
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins create ask mene conversation" ON public.ask_mene_conversations
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_admin(tenant_id) AND updated_by = auth.uid());
CREATE POLICY "tenant admins update ask mene conversation" ON public.ask_mene_conversations
  FOR UPDATE TO authenticated USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id) AND updated_by = auth.uid());
CREATE POLICY "tenant admins delete ask mene conversation" ON public.ask_mene_conversations
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE TABLE public.ask_mene_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ask_mene_conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 12000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.ask_mene_messages TO authenticated;
GRANT ALL ON public.ask_mene_messages TO service_role;
ALTER TABLE public.ask_mene_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read ask mene messages" ON public.ask_mene_messages
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins create ask mene messages" ON public.ask_mene_messages
  FOR INSERT TO authenticated WITH CHECK (
    public.is_tenant_admin(tenant_id)
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.ask_mene_conversations c WHERE c.id = conversation_id AND c.tenant_id = tenant_id)
  );
CREATE POLICY "tenant admins clear ask mene messages" ON public.ask_mene_messages
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));
CREATE INDEX ask_mene_messages_conversation_created_idx
  ON public.ask_mene_messages(conversation_id, created_at);

CREATE TABLE public.platform_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_audit_events TO authenticated;
GRANT ALL ON public.platform_audit_events TO service_role;
ALTER TABLE public.platform_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins read platform audit" ON public.platform_audit_events
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE INDEX platform_audit_events_created_idx ON public.platform_audit_events(created_at DESC);

CREATE OR REPLACE FUNCTION public.ask_mene_context(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT jsonb_build_object(
    'church', jsonb_build_object('name', t.name, 'tier', t.tier, 'status', t.status),
    'summary', jsonb_build_object(
      'members', (SELECT count(*) FROM public.members m WHERE m.tenant_id=t.id AND m.status IN ('active','first_timer')),
      'first_timers_30d', (SELECT count(*) FROM public.members m WHERE m.tenant_id=t.id AND m.status='first_timer' AND m.created_at >= now()-interval '30 days'),
      'services_30d', (SELECT count(*) FROM public.services s WHERE s.tenant_id=t.id AND s.service_date >= current_date-30),
      'attendance_30d', (SELECT count(*) FROM public.attendance a WHERE a.tenant_id=t.id AND a.recorded_at >= now()-interval '30 days')
    ),
    'demographics', (SELECT jsonb_build_object(
      'male', count(*) FILTER (WHERE gender='male'), 'female', count(*) FILTER (WHERE gender='female'),
      'other', count(*) FILTER (WHERE gender='other'), 'minors', count(*) FILTER (WHERE is_minor),
      'single', count(*) FILTER (WHERE marital_status='single'), 'married', count(*) FILTER (WHERE marital_status='married'))
      FROM public.members m WHERE m.tenant_id=t.id AND m.status IN ('active','first_timer')),
    'recent_services', (SELECT coalesce(jsonb_agg(x ORDER BY x.service_date DESC), '[]'::jsonb) FROM (
      SELECT s.name, s.service_date, count(a.id) AS attendance
      FROM public.services s LEFT JOIN public.attendance a ON a.service_id=s.id
      WHERE s.tenant_id=t.id GROUP BY s.id, s.name, s.service_date ORDER BY s.service_date DESC LIMIT 16
    ) x),
    'branches', CASE WHEN public.tenant_has_feature(t.id,'branches') THEN
      (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT b.name, count(DISTINCT m.id) AS members, count(DISTINCT a.id) AS attendance_30d
        FROM public.branches b LEFT JOIN public.members m ON m.branch_id=b.id AND m.status IN ('active','first_timer')
        LEFT JOIN public.attendance a ON a.branch_id=b.id AND a.recorded_at >= now()-interval '30 days'
        WHERE b.tenant_id=t.id GROUP BY b.id,b.name ORDER BY b.name
      ) x) ELSE '[]'::jsonb END,
    'groups', CASE WHEN public.tenant_has_feature(t.id,'groups') THEN
      (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT p.group_name, count(DISTINCT m.id) AS members, count(DISTINCT a.id) AS attendance_30d
        FROM public.positions p LEFT JOIN public.members m ON m.position_id=p.id AND m.status IN ('active','first_timer')
        LEFT JOIN public.attendance a ON a.position_id=p.id AND a.recorded_at >= now()-interval '30 days'
        WHERE p.tenant_id=t.id GROUP BY p.id,p.group_name ORDER BY p.group_name LIMIT 50
      ) x) ELSE '[]'::jsonb END,
    'limits', jsonb_build_object(
      'member_limit', public.tenant_limit(t.id,'member_limit'),
      'staff_seats', public.tenant_limit(t.id,'staff_seats'),
      'daily_messages', public.tenant_limit(t.id,'daily_messages'))
  ) INTO v FROM public.tenants t WHERE t.id=p_tenant;
  IF v IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.ask_mene_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_mene_context(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ask_mene_allow_request(p_tenant uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.check_rate_limit('ask_mene_user', auth.uid()::text, 20, 3600) THEN RETURN false; END IF;
  IF NOT public.check_rate_limit('ask_mene_tenant', p_tenant::text, 100, 3600) THEN RETURN false; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ask_mene_allow_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_mene_allow_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  SELECT jsonb_build_object(
    'tenants', (SELECT count(*) FROM public.tenants),
    'active_tenants', (SELECT count(*) FROM public.tenants WHERE status='active'),
    'grace_tenants', (SELECT count(*) FROM public.tenants WHERE status='grace'),
    'suspended_tenants', (SELECT count(*) FROM public.tenants WHERE status='suspended'),
    'members', (SELECT count(*) FROM public.members WHERE status <> 'anonymised'),
    'attendance_30d', (SELECT count(*) FROM public.attendance WHERE recorded_at > now()-interval '30 days'),
    'by_tier', (SELECT coalesce(jsonb_object_agg(tier,n),'{}'::jsonb) FROM (SELECT tier,count(*) n FROM public.tenants GROUP BY tier) q),
    'revenue_usd_90d', (SELECT coalesce(sum(amount_kobo),0)/100.0 FROM public.payments WHERE status='success' AND currency='USD' AND paid_at>now()-interval '90 days'),
    'payments_30d', (SELECT count(*) FROM public.payments WHERE created_at>now()-interval '30 days'),
    'failed_payments_30d', (SELECT count(*) FROM public.payments WHERE created_at>now()-interval '30 days' AND status='failed'),
    'churches', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'name',x.name,'subdomain',x.subdomain,'tier',x.tier,'status',x.status,
      'contact_email',x.contact_email,'contact_phone',x.contact_phone,'created_at',x.created_at,
      'members',x.members,'staff',x.staff,'period_end',x.period_end,'auto_renew',x.auto_renew,
      'last_payment_status',x.last_payment_status,'last_payment_at',x.last_payment_at
    ) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
      SELECT t.id,t.name,t.subdomain,t.tier,t.status,t.contact_email,t.contact_phone,t.created_at,
        (SELECT count(*) FROM public.members m WHERE m.tenant_id=t.id AND m.status<>'anonymised') members,
        (SELECT count(*) FROM public.tenant_users tu WHERE tu.tenant_id=t.id AND tu.status='active') staff,
        s.period_end,s.auto_renew,
        (SELECT p.status FROM public.payments p WHERE p.tenant_id=t.id ORDER BY p.created_at DESC LIMIT 1) last_payment_status,
        (SELECT p.created_at FROM public.payments p WHERE p.tenant_id=t.id ORDER BY p.created_at DESC LIMIT 1) last_payment_at
      FROM public.tenants t LEFT JOIN public.subscriptions s ON s.tenant_id=t.id
      ORDER BY t.created_at DESC LIMIT 500
    ) x),
    'recent_payments', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'church',t.name,'tier',p.tier,'amount',p.amount_kobo/100.0,'currency',p.currency,
      'status',p.status,'channel',p.channel,'created_at',p.created_at,'paid_at',p.paid_at
    ) ORDER BY p.created_at DESC),'[]'::jsonb) FROM public.payments p JOIN public.tenants t ON t.id=p.tenant_id WHERE p.created_at>now()-interval '90 days' LIMIT 200),
    'audit', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'action',a.action,'tenant_id',a.tenant_id,'church',t.name,'detail',a.detail,'created_at',a.created_at
    ) ORDER BY a.created_at DESC),'[]'::jsonb) FROM public.platform_audit_events a LEFT JOIN public.tenants t ON t.id=a.tenant_id LIMIT 200)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_overview() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_update_tenant(
  p_tenant uuid, p_name text, p_subdomain text, p_tier public.tenant_tier,
  p_status public.tenant_status, p_contact_email text, p_contact_phone text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_old jsonb; v_sub text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.check_rate_limit('platform_mutation',auth.uid()::text,60,3600) THEN RAISE EXCEPTION 'Too many changes. Please try again later.'; END IF;
  IF length(btrim(coalesce(p_name,'')))<2 OR length(p_name)>120 THEN RAISE EXCEPTION 'Enter a valid church name'; END IF;
  v_sub:=lower(btrim(coalesce(p_subdomain,'')));
  IF v_sub !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' THEN RAISE EXCEPTION 'Subdomain must be 3-40 lowercase letters, numbers or hyphens'; END IF;
  IF v_sub IN ('www','admin','api','app','mail','status','support','billing','static','assets') THEN RAISE EXCEPTION 'That subdomain is reserved'; END IF;
  SELECT jsonb_build_object('name',name,'subdomain',subdomain,'tier',tier,'status',status) INTO v_old FROM public.tenants WHERE id=p_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  UPDATE public.tenants SET name=btrim(p_name),subdomain=v_sub,tier=p_tier,status=p_status,
    contact_email=nullif(btrim(coalesce(p_contact_email,'')),''),
    contact_phone=public.normalize_phone_gh(p_contact_phone) WHERE id=p_tenant;
  UPDATE public.subscriptions SET tier=p_tier WHERE tenant_id=p_tenant;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail)
    VALUES(auth.uid(),'tenant.updated',p_tenant,jsonb_build_object('before',v_old,'after',jsonb_build_object('name',btrim(p_name),'subdomain',v_sub,'tier',p_tier,'status',p_status)));
END;
$$;
REVOKE ALL ON FUNCTION public.platform_update_tenant(uuid,text,text,public.tenant_tier,public.tenant_status,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_tenant(uuid,text,text,public.tenant_tier,public.tenant_status,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_create_tenant(
  p_name text,p_subdomain text,p_tier public.tenant_tier,p_contact_email text,p_contact_phone text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_sub text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.check_rate_limit('platform_create',auth.uid()::text,15,3600) THEN RAISE EXCEPTION 'Too many church creations. Please try again later.'; END IF;
  IF length(btrim(coalesce(p_name,'')))<2 OR length(p_name)>120 THEN RAISE EXCEPTION 'Enter a valid church name'; END IF;
  v_sub:=lower(btrim(coalesce(p_subdomain,'')));
  IF v_sub !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' THEN RAISE EXCEPTION 'Subdomain must be 3-40 lowercase letters, numbers or hyphens'; END IF;
  IF v_sub IN ('www','admin','api','app','mail','status','support','billing','static','assets') THEN RAISE EXCEPTION 'That subdomain is reserved'; END IF;
  INSERT INTO public.tenants(name,subdomain,tier,status,contact_email,contact_phone)
    VALUES(btrim(p_name),v_sub,p_tier,'active',nullif(btrim(coalesce(p_contact_email,'')),''),public.normalize_phone_gh(p_contact_phone)) RETURNING id INTO v_id;
  INSERT INTO public.branches(tenant_id,name,is_default) VALUES(v_id,'Main',true);
  INSERT INTO public.subscriptions(tenant_id,tier) VALUES(v_id,p_tier);
  IF p_tier IN ('standard','premium') THEN INSERT INTO public.structure_levels(tenant_id,name,rank) VALUES(v_id,'Leader',1); END IF;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail)
    VALUES(auth.uid(),'tenant.created',v_id,jsonb_build_object('name',btrim(p_name),'subdomain',v_sub,'tier',p_tier));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_create_tenant(text,text,public.tenant_tier,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_tenant(text,text,public.tenant_tier,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_tenant_status(p_tenant uuid,p_status public.tenant_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_old public.tenant_status;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.check_rate_limit('platform_mutation',auth.uid()::text,60,3600) THEN RAISE EXCEPTION 'Too many changes. Please try again later.'; END IF;
  SELECT status INTO v_old FROM public.tenants WHERE id=p_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  UPDATE public.tenants SET status=p_status WHERE id=p_tenant;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail)
    VALUES(auth.uid(),'tenant.status_changed',p_tenant,jsonb_build_object('from',v_old,'to',p_status));
END;
$$;
REVOKE ALL ON FUNCTION public.platform_set_tenant_status(uuid,public.tenant_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_status(uuid,public.tenant_status) TO authenticated;


-- ============ 0009_ask_mene_entitlement.sql ============
CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier public.tenant_tier)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_tier
    WHEN 'basic' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false, 'ask_mene', true,
      'structure', false, 'groups', false, 'branches', false,
      'email', true, 'sms', false, 'broadcasts', false, 'automations', false,
      'audit', true, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200)
    WHEN 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', false,
      'email', true, 'sms', false, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000)
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', true,
      'email', true, 'sms', true, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000)
  END
$$;
REVOKE ALL ON FUNCTION public.tier_entitlements(public.tenant_tier) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tier_entitlements(public.tenant_tier) TO authenticated, service_role;

-- ============ 0010_leaders_reviews_space_and_checkin_v3.sql ============
-- ============================================================
-- 1. Additive columns
-- ============================================================
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS education_level text;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS invited_by_leader_id uuid;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS extra_member_slots integer NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Entitlements: leaders + paid member-space add-on
-- ============================================================
CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier public.tenant_tier)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_tier
    WHEN 'basic' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false, 'ask_mene', true,
      'structure', false, 'groups', false, 'branches', false,
      'leaders', false, 'space_addon', false,
      'email', true, 'sms', false, 'broadcasts', false, 'automations', false,
      'audit', true, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200)
    WHEN 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', false,
      'leaders', true, 'space_addon', true,
      'email', true, 'sms', false, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000)
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', true,
      'leaders', true, 'space_addon', true,
      'email', true, 'sms', true, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000)
  END
$$;
REVOKE ALL ON FUNCTION public.tier_entitlements(public.tenant_tier) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tier_entitlements(public.tenant_tier) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_limit(_tenant uuid, _key text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((public.tier_entitlements(t.tier) ->> _key)::int, 0)
       + CASE WHEN _key = 'member_limit' THEN coalesce(t.extra_member_slots, 0) ELSE 0 END
  FROM public.tenants t WHERE t.id = _tenant
$$;
REVOKE ALL ON FUNCTION public.tenant_limit(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_limit(uuid, text) TO authenticated, service_role;

-- ============================================================
-- 3. Leader types (admin-defined list)
-- ============================================================
CREATE TABLE public.leader_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX leader_types_tenant_idx ON public.leader_types (tenant_id, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leader_types TO authenticated;
GRANT ALL ON public.leader_types TO service_role;
ALTER TABLE public.leader_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read leader types" ON public.leader_types
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant admins add leader types" ON public.leader_types
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins edit leader types" ON public.leader_types
  FOR UPDATE TO authenticated USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins remove leader types" ON public.leader_types
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));

-- ============================================================
-- 4. Leader profiles
-- ============================================================
CREATE TABLE public.leader_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email citext,
  phone text,
  photo_path text,
  date_of_birth date,
  location text,
  leader_type_id uuid REFERENCES public.leader_types(id) ON DELETE SET NULL,
  status public.account_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX leader_profiles_tenant_idx ON public.leader_profiles (tenant_id, status);
CREATE INDEX leader_profiles_user_idx ON public.leader_profiles (user_id);
GRANT SELECT, UPDATE, DELETE ON public.leader_profiles TO authenticated;
GRANT ALL ON public.leader_profiles TO service_role;
ALTER TABLE public.leader_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaders read own profile" ON public.leader_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "tenant admins read leaders" ON public.leader_profiles
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins edit leaders" ON public.leader_profiles
  FOR UPDATE TO authenticated USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins remove leaders" ON public.leader_profiles
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));

ALTER TABLE public.members
  ADD CONSTRAINT members_invited_by_leader_fkey
  FOREIGN KEY (invited_by_leader_id) REFERENCES public.leader_profiles(id) ON DELETE SET NULL;
CREATE INDEX members_invited_by_leader_idx ON public.members (invited_by_leader_id);

CREATE POLICY "leaders read members they invited" ON public.members
  FOR SELECT TO authenticated USING (
    invited_by_leader_id IN (SELECT id FROM public.leader_profiles WHERE user_id = auth.uid())
  );

-- ============================================================
-- 5. Leader access code (anti-spam, admin controlled)
-- ============================================================
CREATE TABLE public.tenant_leader_access (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.tenant_leader_access TO authenticated;
GRANT ALL ON public.tenant_leader_access TO service_role;
ALTER TABLE public.tenant_leader_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read leader code" ON public.tenant_leader_access
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE OR REPLACE FUNCTION public.set_leader_access_code(p_tenant uuid, p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.tenant_has_feature(p_tenant, 'leaders') THEN
    RAISE EXCEPTION 'Leader accounts are not part of this package';
  END IF;
  v_code := nullif(btrim(coalesce(p_code, '')), '');
  IF v_code IS NULL THEN v_code := upper(encode(gen_random_bytes(4), 'hex')); END IF;
  IF length(v_code) < 6 OR length(v_code) > 24 THEN
    RAISE EXCEPTION 'The access code must be between 6 and 24 characters';
  END IF;
  INSERT INTO public.tenant_leader_access (tenant_id, code, updated_by)
  VALUES (p_tenant, v_code, auth.uid())
  ON CONFLICT (tenant_id) DO UPDATE
    SET code = excluded.code, updated_at = now(), updated_by = excluded.updated_by;
  PERFORM public.log_audit(p_tenant, 'leaders.access_code_set', null, '{}'::jsonb, null, auth.uid());
  RETURN v_code;
END; $$;
REVOKE ALL ON FUNCTION public.set_leader_access_code(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_leader_access_code(uuid, text) TO authenticated;

-- ============================================================
-- 6. Public (server-side only) leader lookups for the check-in page
-- ============================================================
CREATE OR REPLACE FUNCTION public.public_leader_options(p_subdomain text)
RETURNS TABLE(id uuid, full_name text, leader_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lp.id, lp.full_name, lt.name
  FROM public.leader_profiles lp
  JOIN public.tenants t ON t.id = lp.tenant_id
  LEFT JOIN public.leader_types lt ON lt.id = lp.leader_type_id
  WHERE t.subdomain = lower(btrim(coalesce(p_subdomain, '')))
    AND lp.status = 'active'
    AND public.tenant_has_feature(t.id, 'leaders')
  ORDER BY lp.full_name
  LIMIT 500
$$;
REVOKE ALL ON FUNCTION public.public_leader_options(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_leader_options(text) TO service_role;

CREATE OR REPLACE FUNCTION public.public_leader_types(p_subdomain text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lt.id, lt.name
  FROM public.leader_types lt
  JOIN public.tenants t ON t.id = lt.tenant_id
  WHERE t.subdomain = lower(btrim(coalesce(p_subdomain, '')))
    AND public.tenant_has_feature(t.id, 'leaders')
  ORDER BY lt.name
  LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.public_leader_types(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_leader_types(text) TO service_role;

-- ============================================================
-- 7. Leader registration (verified server-side, access code required)
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_leader(
  p_subdomain text, p_user uuid, p_code text, p_full_name text, p_email text,
  p_phone text, p_dob date, p_location text, p_leader_type uuid, p_photo_path text, p_ip text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant record; v_code text; v_leader uuid; v_phone text;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants
   WHERE subdomain = lower(btrim(coalesce(p_subdomain, '')));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  IF v_tenant.status NOT IN ('active','grace') THEN RAISE EXCEPTION 'This church is not accepting leader sign-ups right now'; END IF;
  IF NOT public.tenant_has_feature(v_tenant.id, 'leaders') THEN
    RAISE EXCEPTION 'Leader accounts are not part of this package';
  END IF;
  IF NOT public.check_rate_limit('leader_register_ip', coalesce(p_ip, 'unknown'), 5, 3600) THEN
    RAISE EXCEPTION 'Too many attempts from this device. Please try again later.';
  END IF;
  SELECT code INTO v_code FROM public.tenant_leader_access WHERE tenant_id = v_tenant.id;
  IF v_code IS NULL THEN RAISE EXCEPTION 'Ask your church administrator for the leader access code'; END IF;
  IF upper(btrim(coalesce(p_code, ''))) <> upper(v_code) THEN
    RAISE EXCEPTION 'That leader access code is not correct';
  END IF;
  IF length(btrim(coalesce(p_full_name, ''))) < 2 OR length(p_full_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your full name';
  END IF;
  IF p_leader_type IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leader_types WHERE id = p_leader_type AND tenant_id = v_tenant.id
  ) THEN RAISE EXCEPTION 'Please choose a valid type of leader'; END IF;
  v_phone := public.normalize_phone_gh(p_phone);

  INSERT INTO public.leader_profiles (
    tenant_id, user_id, full_name, email, phone, photo_path, date_of_birth, location, leader_type_id
  ) VALUES (
    v_tenant.id, p_user, btrim(p_full_name), nullif(btrim(coalesce(p_email,'')),''), v_phone,
    nullif(btrim(coalesce(p_photo_path,'')),''), p_dob, nullif(btrim(coalesce(p_location,'')),''), p_leader_type
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET full_name = excluded.full_name
  RETURNING id INTO v_leader;

  INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
  VALUES (v_tenant.id, p_user, 'leader', 'active')
  ON CONFLICT DO NOTHING;

  PERFORM public.log_audit(v_tenant.id, 'leader.registered', v_leader::text, '{}'::jsonb, p_ip, p_user);
  RETURN jsonb_build_object('ok', true, 'leader_id', v_leader, 'church', v_tenant.name);
END; $$;
REVOKE ALL ON FUNCTION public.register_leader(text,uuid,text,text,text,text,date,text,uuid,text,text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_leader(text,uuid,text,text,text,text,date,text,uuid,text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.leader_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_leader record; v_result jsonb;
BEGIN
  SELECT lp.*, t.name AS church_name INTO v_leader
  FROM public.leader_profiles lp JOIN public.tenants t ON t.id = lp.tenant_id
  WHERE lp.user_id = auth.uid() LIMIT 1;
  IF v_leader IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT jsonb_build_object(
    'ok', true,
    'church', v_leader.church_name,
    'full_name', v_leader.full_name,
    'member_count', (SELECT count(*) FROM public.members m WHERE m.invited_by_leader_id = v_leader.id),
    'first_timers', (SELECT count(*) FROM public.members m WHERE m.invited_by_leader_id = v_leader.id AND m.status = 'first_timer'),
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'joined_on', m.joined_on, 'status', m.status)
             ORDER BY m.joined_on DESC)
      FROM (SELECT * FROM public.members m2 WHERE m2.invited_by_leader_id = v_leader.id
            ORDER BY joined_on DESC LIMIT 200) m
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.leader_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leader_overview() TO authenticated;

-- ============================================================
-- 8. Church reviews (one per administrator, operator approved)
-- ============================================================
CREATE TABLE public.church_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  quote text NOT NULL,
  author_name text NOT NULL,
  author_role text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX church_reviews_status_idx ON public.church_reviews (status, created_at DESC);
GRANT SELECT ON public.church_reviews TO authenticated;
GRANT ALL ON public.church_reviews TO service_role;
ALTER TABLE public.church_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authors read own review" ON public.church_reviews
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "platform admins read reviews" ON public.church_reviews
  FOR SELECT TO authenticated USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.submit_church_review(
  p_tenant uuid, p_rating smallint, p_quote text, p_author_name text, p_author_role text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Please choose a rating from 1 to 5'; END IF;
  IF length(btrim(coalesce(p_quote,''))) < 20 OR length(p_quote) > 600 THEN
    RAISE EXCEPTION 'Please write between 20 and 600 characters';
  END IF;
  IF EXISTS (SELECT 1 FROM public.church_reviews WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'You have already shared a review';
  END IF;
  INSERT INTO public.church_reviews (tenant_id, user_id, rating, quote, author_name, author_role)
  VALUES (p_tenant, auth.uid(), p_rating, btrim(p_quote),
          coalesce(nullif(btrim(coalesce(p_author_name,'')),''), 'Church leader'),
          nullif(btrim(coalesce(p_author_role,'')),''))
  RETURNING id INTO v_id;
  PERFORM public.log_audit(p_tenant, 'review.submitted', v_id::text, '{}'::jsonb, null, auth.uid());
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
REVOKE ALL ON FUNCTION public.submit_church_review(uuid, smallint, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_church_review(uuid, smallint, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_review_state()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('submitted', true, 'status', status, 'created_at', created_at)
     FROM public.church_reviews WHERE user_id = auth.uid()),
    jsonb_build_object('submitted', false))
$$;
REVOKE ALL ON FUNCTION public.my_review_state() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_review_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.public_reviews()
RETURNS TABLE(id uuid, rating smallint, quote text, author_name text, author_role text, church_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rating, r.quote, r.author_name, r.author_role, t.name
  FROM public.church_reviews r JOIN public.tenants t ON t.id = r.tenant_id
  WHERE r.status = 'approved'
  ORDER BY r.reviewed_at DESC NULLS LAST, r.created_at DESC
  LIMIT 30
$$;
REVOKE ALL ON FUNCTION public.public_reviews() FROM public;
GRANT EXECUTE ON FUNCTION public.public_reviews() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_set_review_status(p_review uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_status NOT IN ('pending','approved','rejected') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.church_reviews SET status = p_status, reviewed_at = now() WHERE id = p_review;
  INSERT INTO public.platform_audit_events (actor_user_id, action, detail)
  VALUES (auth.uid(), 'review.' || p_status, jsonb_build_object('review_id', p_review));
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_review_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_review_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_reviews()
RETURNS TABLE(id uuid, rating smallint, quote text, author_name text, author_role text,
              status text, created_at timestamptz, church_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rating, r.quote, r.author_name, r.author_role, r.status, r.created_at, t.name
  FROM public.church_reviews r JOIN public.tenants t ON t.id = r.tenant_id
  WHERE public.is_platform_admin()
  ORDER BY r.created_at DESC
  LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.platform_reviews() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_reviews() TO authenticated;

-- ============================================================
-- 9. Extra member space (paid add-on)
-- ============================================================
CREATE TABLE public.space_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  extra_slots integer NOT NULL CHECK (extra_slots > 0),
  amount_cents bigint NOT NULL DEFAULT 0,
  reference text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);
CREATE INDEX space_requests_tenant_idx ON public.space_requests (tenant_id, created_at DESC);
GRANT SELECT ON public.space_requests TO authenticated;
GRANT ALL ON public.space_requests TO service_role;
ALTER TABLE public.space_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read space requests" ON public.space_requests
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE OR REPLACE FUNCTION public.request_extra_space(p_tenant uuid, p_slots integer, p_reference text, p_amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.tenant_has_feature(p_tenant, 'space_addon') THEN
    RAISE EXCEPTION 'Extra member space is available on the Standard and Premium packages';
  END IF;
  IF p_slots IS NULL OR p_slots < 100 OR p_slots > 100000 THEN
    RAISE EXCEPTION 'Choose between 100 and 100,000 extra member slots';
  END IF;
  INSERT INTO public.space_requests (tenant_id, requested_by, extra_slots, amount_cents, reference)
  VALUES (p_tenant, auth.uid(), p_slots, coalesce(p_amount, 0), nullif(btrim(coalesce(p_reference,'')),''))
  RETURNING id INTO v_id;
  PERFORM public.log_audit(p_tenant, 'space.requested', v_id::text,
    jsonb_build_object('slots', p_slots), null, auth.uid());
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
REVOKE ALL ON FUNCTION public.request_extra_space(uuid, integer, text, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_extra_space(uuid, integer, text, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_space_purchase(p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.space_requests
   WHERE reference = p_reference AND status = 'pending' FOR UPDATE;
  IF v_row IS NULL THEN RETURN; END IF;
  UPDATE public.space_requests SET status = 'paid', applied_at = now() WHERE id = v_row.id;
  UPDATE public.tenants SET extra_member_slots = coalesce(extra_member_slots, 0) + v_row.extra_slots
   WHERE id = v_row.tenant_id;
  PERFORM public.log_audit(v_row.tenant_id, 'space.granted', v_row.id::text,
    jsonb_build_object('slots', v_row.extra_slots), null, null);
END; $$;
REVOKE ALL ON FUNCTION public.apply_space_purchase(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_space_purchase(text) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_grant_space(p_tenant uuid, p_slots integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_slots IS NULL OR p_slots < 0 OR p_slots > 500000 THEN RAISE EXCEPTION 'Invalid slot count'; END IF;
  UPDATE public.tenants SET extra_member_slots = p_slots WHERE id = p_tenant;
  INSERT INTO public.platform_audit_events (actor_user_id, action, tenant_id, detail)
  VALUES (auth.uid(), 'space.granted', p_tenant, jsonb_build_object('slots', p_slots));
END; $$;
REVOKE ALL ON FUNCTION public.platform_grant_space(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_grant_space(uuid, integer) TO authenticated;

-- ============================================================
-- 10. Service delete (all packages, administrators only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_service(p_service uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_count integer;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.services WHERE id = p_service;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.is_tenant_admin(v_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT count(*) INTO v_count FROM public.attendance WHERE service_id = p_service;
  DELETE FROM public.attendance WHERE service_id = p_service;
  DELETE FROM public.services WHERE id = p_service;
  PERFORM public.log_audit(v_tenant, 'service.deleted', p_service::text,
    jsonb_build_object('attendance_removed', v_count), null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.delete_service(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_service(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rename_service(p_service uuid, p_name text, p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.services WHERE id = p_service;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.is_tenant_admin(v_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF length(btrim(coalesce(p_name,''))) < 2 OR length(p_name) > 80 THEN RAISE EXCEPTION 'Invalid service name'; END IF;
  UPDATE public.services SET name = btrim(p_name), service_date = coalesce(p_date, service_date)
   WHERE id = p_service;
  PERFORM public.log_audit(v_tenant, 'service.updated', p_service::text, '{}'::jsonb, null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.rename_service(uuid, text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rename_service(uuid, text, date) TO authenticated;

-- ============================================================
-- 11. Self check-in v3 (education level + inviting leader)
-- ============================================================
CREATE OR REPLACE FUNCTION public.self_checkin_v3(
  p_subdomain text, p_service uuid, p_full_name text, p_phone text, p_email text,
  p_dob date, p_gender public.gender_type, p_marital_status text,
  p_area text, p_occupation text, p_education text, p_leader uuid, p_ip text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant record; v_branch uuid; v_member uuid; v_service record;
  v_phone text; v_token text; v_existing boolean := false;
  v_channel text; v_dest text; v_email text; v_leader uuid;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants
   WHERE subdomain = lower(btrim(coalesce(p_subdomain,'')));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  IF v_tenant.status NOT IN ('active','grace') THEN
    RAISE EXCEPTION 'This church is not accepting check-ins right now';
  END IF;
  IF NOT public.check_rate_limit('self_checkin_ip', coalesce(p_ip,'unknown'), 10, 600) THEN
    RAISE EXCEPTION 'Too many check-ins from this device. Please wait a few minutes.';
  END IF;
  IF NOT public.check_rate_limit('self_checkin_tenant', v_tenant.id::text, 400, 3600) THEN
    RAISE EXCEPTION 'Check-in is temporarily unavailable. Please ask an usher for help.';
  END IF;
  IF length(btrim(coalesce(p_full_name,''))) < 2 OR length(p_full_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your full name';
  END IF;
  IF p_marital_status IS NOT NULL AND p_marital_status NOT IN
     ('single','married','divorced','widowed','separated','prefer_not_to_say') THEN
    RAISE EXCEPTION 'Please select a valid marital status';
  END IF;
  IF length(coalesce(p_occupation,'')) > 120 OR length(coalesce(p_area,'')) > 120
     OR length(coalesce(p_education,'')) > 60 THEN
    RAISE EXCEPTION 'A member detail is too long';
  END IF;
  v_email := nullif(btrim(coalesce(p_email,'')),'');
  IF v_email IS NOT NULL AND (length(v_email) > 160 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'Please enter a valid email address';
  END IF;
  SELECT s.* INTO v_service FROM public.services s
   WHERE s.id = p_service AND s.tenant_id = v_tenant.id AND s.is_open;
  IF v_service IS NULL THEN RAISE EXCEPTION 'Please select an open service'; END IF;

  v_phone := public.normalize_phone_gh(p_phone);
  IF v_phone IS NULL OR length(v_phone) < 10 THEN RAISE EXCEPTION 'Please enter a valid phone number'; END IF;

  IF p_leader IS NOT NULL THEN
    SELECT id INTO v_leader FROM public.leader_profiles
     WHERE id = p_leader AND tenant_id = v_tenant.id AND status = 'active';
  END IF;

  SELECT id INTO v_branch FROM public.branches
   WHERE tenant_id = v_tenant.id
     AND (v_service.branch_id IS NULL OR id = v_service.branch_id)
   ORDER BY is_default DESC, created_at LIMIT 1;

  SELECT id INTO v_member FROM public.members
   WHERE tenant_id = v_tenant.id AND phone = v_phone LIMIT 1;

  IF v_member IS NULL THEN
    IF (SELECT count(*) FROM public.members WHERE tenant_id = v_tenant.id)
       >= public.tenant_limit(v_tenant.id, 'member_limit') THEN
      RAISE EXCEPTION 'This church has reached its member limit. Please ask an usher for help.';
    END IF;
    INSERT INTO public.members (
      tenant_id, branch_id, full_name, phone, email, date_of_birth, gender,
      marital_status, residential_area, occupation, education_level, invited_by_leader_id, status
    ) VALUES (
      v_tenant.id, v_branch, btrim(p_full_name), v_phone, v_email,
      p_dob, p_gender, p_marital_status, nullif(btrim(coalesce(p_area,'')),''),
      nullif(btrim(coalesce(p_occupation,'')),''), nullif(btrim(coalesce(p_education,'')),''),
      v_leader, 'first_timer'
    ) RETURNING id INTO v_member;
  ELSE
    v_existing := true;
    UPDATE public.members SET
      full_name = btrim(p_full_name),
      email = coalesce(v_email, email),
      date_of_birth = coalesce(p_dob, date_of_birth),
      gender = coalesce(p_gender, gender),
      marital_status = coalesce(p_marital_status, marital_status),
      residential_area = coalesce(nullif(btrim(coalesce(p_area,'')),''), residential_area),
      occupation = coalesce(nullif(btrim(coalesce(p_occupation,'')),''), occupation),
      education_level = coalesce(nullif(btrim(coalesce(p_education,'')),''), education_level),
      invited_by_leader_id = coalesce(v_leader, invited_by_leader_id)
    WHERE id = v_member;
  END IF;

  UPDATE public.qr_tokens SET revoked_at = now() WHERE member_id = v_member AND revoked_at IS NULL;
  v_token := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.qr_tokens (token_hash, tenant_id, member_id)
  VALUES (digest(v_token, 'sha256'), v_tenant.id, v_member);

  INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, method)
  VALUES (v_tenant.id, v_service.id, v_member, coalesce(v_branch, v_service.branch_id), 'self_checkin')
  ON CONFLICT (service_id, member_id) DO NOTHING;

  IF NOT v_existing THEN
    v_channel := CASE
      WHEN v_email IS NOT NULL AND public.tenant_has_feature(v_tenant.id,'email') THEN 'email'
      WHEN public.tenant_has_feature(v_tenant.id,'sms') THEN 'sms' ELSE NULL END;
    IF v_channel IS NOT NULL THEN
      v_dest := CASE WHEN v_channel = 'email' THEN v_email ELSE v_phone END;
      PERFORM public.enqueue_message(v_tenant.id, v_channel, v_member, v_dest,
        'Welcome to ' || v_tenant.name,
        'Welcome to ' || v_tenant.name || ', ' || split_part(btrim(p_full_name),' ',1) ||
        '! Your member code is ' || v_token ||
        '. Keep your QR code safe and show it when you arrive next time.',
        'welcome', 'welcome:' || v_member::text);
    END IF;
  END IF;

  PERFORM public.log_audit(v_tenant.id, 'member.self_checkin', v_member::text,
    jsonb_build_object('returning', v_existing, 'service_id', v_service.id), p_ip, null);
  RETURN jsonb_build_object('ok', true, 'member_id', v_member, 'token', v_token,
    'returning', v_existing, 'checked_in', true, 'church', v_tenant.name,
    'service', v_service.name);
END; $$;
REVOKE ALL ON FUNCTION public.self_checkin_v3(text,uuid,text,text,text,date,public.gender_type,text,text,text,text,uuid,text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_checkin_v3(text,uuid,text,text,text,date,public.gender_type,text,text,text,text,uuid,text)
  TO service_role;

-- ============================================================
-- 12. Scale: indexes on the paths that grow fastest
-- ============================================================
CREATE INDEX IF NOT EXISTS attendance_tenant_recorded_idx ON public.attendance (tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS attendance_service_idx ON public.attendance (service_id);
CREATE INDEX IF NOT EXISTS members_tenant_status_idx ON public.members (tenant_id, status);
CREATE INDEX IF NOT EXISTS members_tenant_created_idx ON public.members (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS services_tenant_date_idx ON public.services (tenant_id, service_date DESC);
CREATE INDEX IF NOT EXISTS messages_tenant_status_idx ON public.messages (tenant_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS audit_events_tenant_idx ON public.audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_idx ON public.rate_limit_hits (bucket, identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_users_user_idx ON public.tenant_users (user_id, status);

COMMENT ON FUNCTION public.self_checkin_v2(text,uuid,text,text,text,date,public.gender_type,text,text,text,text)
  IS 'DEPRECATED: replaced by public.self_checkin_v3 (adds education level and inviting leader).';


-- ============ 0011_secure_trials_onboarding_operator_payments.sql ============
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_notes text;

CREATE INDEX IF NOT EXISTS tenants_approval_status_idx ON public.tenants (approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS tenants_trial_ends_at_idx ON public.tenants (trial_ends_at) WHERE trial_ends_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS space_requests_reference_unique_idx ON public.space_requests (reference) WHERE reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.subdomain_available(p_subdomain text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(trim(coalesce(p_subdomain,''))) ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'
     AND lower(trim(p_subdomain)) NOT IN ('www','admin','api','app','mail','status','support','billing','static','assets','super-admin','platform')
     AND NOT EXISTS (SELECT 1 FROM public.tenants WHERE subdomain = lower(trim(p_subdomain)));
$$;
REVOKE ALL ON FUNCTION public.subdomain_available(text) FROM public;
GRANT EXECUTE ON FUNCTION public.subdomain_available(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_name text, p_subdomain text, p_tier public.tenant_tier,
  p_contact_email text DEFAULT NULL, p_contact_phone text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_branch uuid; v_sub text; v_start date := current_date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.check_rate_limit('provision_tenant', auth.uid()::text, 5, 3600) THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'This account already belongs to a church';
  END IF;
  v_sub := lower(trim(p_subdomain));
  IF NOT public.subdomain_available(v_sub) THEN RAISE EXCEPTION 'That check-in address is not available'; END IF;
  IF length(trim(coalesce(p_name,''))) < 2 OR length(trim(p_name)) > 120 THEN RAISE EXCEPTION 'Church name must be 2 to 120 characters'; END IF;
  BEGIN
    INSERT INTO public.tenants (name, subdomain, tier, contact_email, contact_phone, approval_status, status, trial_ends_at)
    VALUES (trim(p_name), v_sub, p_tier, nullif(trim(p_contact_email),''), public.normalize_phone_gh(p_contact_phone), 'pending', 'active', now() + interval '14 days')
    RETURNING id INTO v_tenant;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That check-in address is already taken';
  END;
  INSERT INTO public.branches (tenant_id, name, is_default) VALUES (v_tenant, 'Main', true) RETURNING id INTO v_branch;
  INSERT INTO public.tenant_users (tenant_id, user_id, role, branch_id) VALUES (v_tenant, auth.uid(), 'owner', v_branch);
  INSERT INTO public.subscriptions (tenant_id, tier, period_start, period_end) VALUES (v_tenant, p_tier, v_start, v_start + 14);
  IF p_tier IN ('standard','premium') THEN
    INSERT INTO public.structure_levels (tenant_id, name, rank) VALUES (v_tenant, 'Leader', 1);
  END IF;
  PERFORM public.log_audit(v_tenant, 'tenant.provisioned', v_sub, jsonb_build_object('tier', p_tier, 'trial_days', 14));
  RETURN v_tenant;
END; $$;
REVOKE ALL ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_approve_church(p_tenant uuid, p_notes text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF length(coalesce(p_notes,'')) > 1000 THEN RAISE EXCEPTION 'Notes are too long'; END IF;
  UPDATE public.tenants SET approval_status='approved', status='active', approved_at=now(), admin_notes=nullif(trim(p_notes),'') WHERE id=p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Church not found'; END IF;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail) VALUES(auth.uid(),'church.approved',p_tenant,jsonb_build_object('notes',nullif(trim(p_notes),'')));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.platform_approve_church(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_approve_church(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_reject_church(p_tenant uuid, p_reason text DEFAULT 'Application not approved')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF length(trim(coalesce(p_reason,''))) < 2 OR length(p_reason) > 1000 THEN RAISE EXCEPTION 'A valid reason is required'; END IF;
  UPDATE public.tenants SET approval_status='rejected', status='closed', admin_notes=trim(p_reason) WHERE id=p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Church not found'; END IF;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail) VALUES(auth.uid(),'church.rejected',p_tenant,jsonb_build_object('reason',trim(p_reason)));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.platform_reject_church(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_reject_church(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_successful_payment(p_reference text, p_channel text DEFAULT NULL, p_paid_at timestamptz DEFAULT now(), p_amount bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay public.payments; v_start date;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'not authorised'; END IF;
  SELECT * INTO v_pay FROM public.payments WHERE reference=p_reference FOR UPDATE;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'unknown payment reference'; END IF;
  IF v_pay.status='success' THEN RETURN; END IF;
  IF p_amount IS NULL OR p_amount <> v_pay.amount_kobo THEN RAISE EXCEPTION 'payment amount does not match'; END IF;
  IF v_pay.currency <> 'USD' THEN RAISE EXCEPTION 'payment currency does not match'; END IF;
  UPDATE public.payments SET status='success',channel=coalesce(p_channel,channel),paid_at=coalesce(p_paid_at,now()) WHERE id=v_pay.id;
  SELECT greatest(period_end,current_date) INTO v_start FROM public.subscriptions WHERE tenant_id=v_pay.tenant_id FOR UPDATE;
  UPDATE public.subscriptions SET tier=v_pay.tier,pending_tier=NULL,period_start=coalesce(v_start,current_date),period_end=(coalesce(v_start,current_date)+interval '1 month')::date,payment_method=CASE WHEN p_channel='mobile_money' THEN 'momo'::public.pay_method ELSE 'card'::public.pay_method END WHERE tenant_id=v_pay.tenant_id;
  UPDATE public.tenants SET tier=v_pay.tier,status='active',trial_ends_at=NULL WHERE id=v_pay.tenant_id;
  PERFORM public.log_audit(v_pay.tenant_id,'payment.succeeded',p_reference,jsonb_build_object('tier',v_pay.tier,'amount',p_amount),NULL,NULL);
END; $$;
REVOKE ALL ON FUNCTION public.apply_successful_payment(text,text,timestamptz,bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_successful_payment(text,text,timestamptz,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_space_purchase(p_reference text, p_amount bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.space_requests;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'not authorised'; END IF;
  SELECT * INTO v_row FROM public.space_requests WHERE reference=p_reference FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'unknown space purchase reference'; END IF;
  IF v_row.status='paid' THEN RETURN; END IF;
  IF v_row.status<>'pending' THEN RAISE EXCEPTION 'space purchase is not pending'; END IF;
  IF p_amount IS NULL OR p_amount<>v_row.amount_cents THEN RAISE EXCEPTION 'payment amount does not match'; END IF;
  UPDATE public.space_requests SET status='paid',applied_at=now() WHERE id=v_row.id;
  UPDATE public.tenants SET extra_member_slots=coalesce(extra_member_slots,0)+v_row.extra_slots WHERE id=v_row.tenant_id;
  PERFORM public.log_audit(v_row.tenant_id,'space.granted',v_row.id::text,jsonb_build_object('slots',v_row.extra_slots,'amount',p_amount),NULL,NULL);
END; $$;
REVOKE ALL ON FUNCTION public.apply_space_purchase(text,bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_space_purchase(text,bigint) TO service_role;

-- ============ 0012_operator_trial_overview.sql ============
CREATE OR REPLACE FUNCTION public.platform_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  SELECT jsonb_build_object(
    'tenants',(SELECT count(*) FROM public.tenants),
    'active_tenants',(SELECT count(*) FROM public.tenants WHERE status='active'),
    'grace_tenants',(SELECT count(*) FROM public.tenants WHERE status='grace'),
    'suspended_tenants',(SELECT count(*) FROM public.tenants WHERE status='suspended'),
    'members',(SELECT count(*) FROM public.members WHERE status<>'anonymised'),
    'attendance_30d',(SELECT count(*) FROM public.attendance WHERE recorded_at>now()-interval '30 days'),
    'by_tier',(SELECT coalesce(jsonb_object_agg(tier,n),'{}'::jsonb) FROM (SELECT tier,count(*) n FROM public.tenants GROUP BY tier) q),
    'revenue_usd_90d',(SELECT coalesce(sum(amount_kobo),0)/100.0 FROM public.payments WHERE status='success' AND currency='USD' AND paid_at>now()-interval '90 days'),
    'payments_30d',(SELECT count(*) FROM public.payments WHERE created_at>now()-interval '30 days'),
    'failed_payments_30d',(SELECT count(*) FROM public.payments WHERE created_at>now()-interval '30 days' AND status='failed'),
    'churches',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'name',x.name,'subdomain',x.subdomain,'tier',x.tier,'status',x.status,
      'approval_status',x.approval_status,'trial_ends_at',x.trial_ends_at,
      'contact_email',x.contact_email,'contact_phone',x.contact_phone,'created_at',x.created_at,
      'members',x.members,'staff',x.staff,'period_end',x.period_end,'auto_renew',x.auto_renew,
      'last_payment_status',x.last_payment_status,'last_payment_at',x.last_payment_at
    ) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
      SELECT t.id,t.name,t.subdomain,t.tier,t.status,t.approval_status,t.trial_ends_at,t.contact_email,t.contact_phone,t.created_at,
        (SELECT count(*) FROM public.members m WHERE m.tenant_id=t.id AND m.status<>'anonymised') members,
        (SELECT count(*) FROM public.tenant_users tu WHERE tu.tenant_id=t.id AND tu.status='active') staff,
        s.period_end,s.auto_renew,
        (SELECT p.status FROM public.payments p WHERE p.tenant_id=t.id ORDER BY p.created_at DESC LIMIT 1) last_payment_status,
        (SELECT p.created_at FROM public.payments p WHERE p.tenant_id=t.id ORDER BY p.created_at DESC LIMIT 1) last_payment_at
      FROM public.tenants t LEFT JOIN public.subscriptions s ON s.tenant_id=t.id
      ORDER BY t.created_at DESC LIMIT 500
    ) x),
    'recent_payments',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'church',t.name,'tier',p.tier,'amount',p.amount_kobo/100.0,'currency',p.currency,
      'status',p.status,'channel',p.channel,'created_at',p.created_at,'paid_at',p.paid_at
    ) ORDER BY p.created_at DESC),'[]'::jsonb) FROM public.payments p JOIN public.tenants t ON t.id=p.tenant_id WHERE p.created_at>now()-interval '90 days' LIMIT 200),
    'audit',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'action',a.action,'tenant_id',a.tenant_id,'church',t.name,'detail',a.detail,'created_at',a.created_at
    ) ORDER BY a.created_at DESC),'[]'::jsonb) FROM public.platform_audit_events a LEFT JOIN public.tenants t ON t.id=a.tenant_id LIMIT 200)
  ) INTO v;
  RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public.platform_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_overview() TO authenticated, service_role;

-- ============ 0013_public_branding_tier_gate.sql ============
CREATE OR REPLACE FUNCTION public.tenant_branding(p_subdomain text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  SELECT id,name,subdomain,tier,logo_path,background_path,brand_primary,brand_accent,welcome_message,submit_button_text,status,group_vocabulary
  INTO t FROM public.tenants WHERE subdomain=lower(trim(coalesce(p_subdomain,'')));
  IF t IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id',t.id,'name',t.name,'subdomain',t.subdomain,'tier',t.tier,
    'logo_path',t.logo_path,'background_path',t.background_path,
    'brand_primary',t.brand_primary,'brand_accent',t.brand_accent,
    'welcome_message',t.welcome_message,'submit_button_text',t.submit_button_text,
    'active',t.status IN ('active','grace')
  );
END; $$;
REVOKE ALL ON FUNCTION public.tenant_branding(text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_branding(text) TO service_role;

-- ============ 0014_verified_onboarding_public_aggregates.sql ============
CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_name text, p_subdomain text, p_tier public.tenant_tier,
  p_contact_email text DEFAULT NULL, p_contact_phone text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_branch uuid; v_sub text; v_start date := current_date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirm your email before creating your church';
  END IF;
  IF NOT public.check_rate_limit('provision_tenant', auth.uid()::text, 5, 3600) THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'This account already belongs to a church';
  END IF;
  v_sub := lower(trim(p_subdomain));
  IF NOT public.subdomain_available(v_sub) THEN RAISE EXCEPTION 'That check-in address is not available'; END IF;
  IF length(trim(coalesce(p_name,''))) < 2 OR length(trim(p_name)) > 120 THEN RAISE EXCEPTION 'Church name must be 2 to 120 characters'; END IF;
  BEGIN
    INSERT INTO public.tenants (name, subdomain, tier, contact_email, contact_phone, approval_status, status, trial_ends_at)
    VALUES (trim(p_name), v_sub, p_tier, nullif(trim(p_contact_email),''), public.normalize_phone_gh(p_contact_phone), 'pending_approval', 'active', now() + interval '14 days')
    RETURNING id INTO v_tenant;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That check-in address is already taken';
  END;
  INSERT INTO public.branches (tenant_id, name, is_default) VALUES (v_tenant, 'Main', true) RETURNING id INTO v_branch;
  INSERT INTO public.tenant_users (tenant_id, user_id, role, branch_id) VALUES (v_tenant, auth.uid(), 'owner', v_branch);
  INSERT INTO public.subscriptions (tenant_id, tier, period_start, period_end) VALUES (v_tenant, p_tier, v_start, v_start + 14);
  IF p_tier IN ('standard','premium') THEN
    INSERT INTO public.structure_levels (tenant_id, name, rank) VALUES (v_tenant, 'Leader', 1);
  END IF;
  PERFORM public.log_audit(v_tenant, 'tenant.provisioned', v_sub, jsonb_build_object('tier', p_tier, 'trial_days', 14));
  RETURN v_tenant;
END; $$;
REVOKE ALL ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_verified_onboarding()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user auth.users;
  v_meta jsonb;
  v_tier public.tenant_tier;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
  IF v_user.id IS NULL OR v_user.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Confirm your email before continuing'; END IF;
  SELECT tenant_id INTO STRICT v_user.id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1;
  RETURN v_user.id;
EXCEPTION WHEN no_data_found THEN
  SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
  v_meta := coalesce(v_user.raw_user_meta_data, '{}'::jsonb);
  IF coalesce(v_meta->>'onboarding_version','') <> '1' THEN RAISE EXCEPTION 'Onboarding details are missing. Please restart registration.'; END IF;
  IF coalesce(v_meta->>'tier','') NOT IN ('basic','standard','premium') THEN RAISE EXCEPTION 'Invalid package selection'; END IF;
  v_tier := (v_meta->>'tier')::public.tenant_tier;
  RETURN public.provision_tenant(
    v_meta->>'church_name',
    v_meta->>'subdomain',
    v_tier,
    coalesce(nullif(v_meta->>'church_email',''), v_user.email),
    coalesce(nullif(v_meta->>'church_phone',''), nullif(v_meta->>'phone',''))
  );
END; $$;
REVOKE ALL ON FUNCTION public.complete_verified_onboarding() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_verified_onboarding() TO authenticated;

CREATE OR REPLACE FUNCTION public.public_platform_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sunday_totals AS (
    SELECT recorded_at::date AS sunday, count(*)::bigint AS total
    FROM public.attendance
    WHERE extract(isodow from recorded_at) = 7
      AND recorded_at >= now() - interval '12 weeks'
    GROUP BY recorded_at::date
  )
  SELECT jsonb_build_object(
    'churches', (SELECT count(*)::bigint FROM public.tenants WHERE approval_status = 'approved' AND status IN ('active','grace')),
    'members', (SELECT count(*)::bigint FROM public.members WHERE status IN ('active','first_timer')),
    'checkins', (SELECT count(*)::bigint FROM public.attendance),
    'average_sunday_attendance', coalesce((SELECT round(avg(total))::bigint FROM sunday_totals), 0),
    'updated_at', now()
  );
$$;
REVOKE ALL ON FUNCTION public.public_platform_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.public_platform_stats() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_help_allow_request(p_identifier text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(coalesce(p_identifier,'')) < 16 OR length(p_identifier) > 128 THEN RETURN false; END IF;
  IF NOT public.check_rate_limit('public_help_client', p_identifier, 10, 3600) THEN RETURN false; END IF;
  IF NOT public.check_rate_limit('public_help_global', 'all', 1000, 3600) THEN RETURN false; END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.public_help_allow_request(text) FROM public;
GRANT EXECUTE ON FUNCTION public.public_help_allow_request(text) TO anon, service_role;

-- ============ 0015_remove_backdoor_and_tighten_anon_access.sql ============
DROP FUNCTION IF EXISTS public.verify_super_admin_credentials(text, text);
DROP FUNCTION IF EXISTS public.set_super_admin_password(text, text);
REVOKE ALL ON public.super_admin_credentials FROM anon, authenticated;
COMMENT ON TABLE public.super_admin_credentials IS 'DEPRECATED: legacy master-password login removed; operator access uses platform_admins only.';
REVOKE EXECUTE ON FUNCTION public.apply_space_purchase(text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.apply_space_purchase(text) IS 'DEPRECATED: use apply_space_purchase(text, bigint).';
REVOKE EXECUTE ON FUNCTION public.log_audit(uuid,text,text,jsonb,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,text,integer,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============ 0016_followups_register_absence_mfa.sql ============
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS require_mfa boolean NOT NULL DEFAULT false;

CREATE TABLE public.member_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','visited','joined','not_interested')),
  assigned_leader_id uuid REFERENCES public.leader_profiles(id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  next_contact_on date,
  source text NOT NULL DEFAULT 'first_timer' CHECK (source IN ('first_timer','absence','manual')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id)
);
CREATE INDEX member_followups_tenant_status_idx ON public.member_followups (tenant_id, status, next_contact_on);
CREATE INDEX member_followups_leader_idx ON public.member_followups (assigned_leader_id);
GRANT SELECT ON public.member_followups TO authenticated;
GRANT ALL ON public.member_followups TO service_role;
ALTER TABLE public.member_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "church admins read followups" ON public.member_followups FOR SELECT TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','church_admin','branch_admin']::public.app_role[]));
CREATE POLICY "assigned leader reads followups" ON public.member_followups FOR SELECT TO authenticated
  USING (assigned_leader_id IN (SELECT lp.id FROM public.leader_profiles lp WHERE lp.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier tenant_tier)
 RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE p_tier
    WHEN 'basic' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false, 'ask_mene', true,
      'structure', false, 'groups', false, 'branches', false,
      'leaders', false, 'space_addon', false, 'followups', false,
      'email', true, 'sms', false, 'broadcasts', false, 'automations', false,
      'audit', true, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200)
    WHEN 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', false,
      'leaders', true, 'space_addon', true, 'followups', true,
      'email', true, 'sms', false, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000)
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', true,
      'leaders', true, 'space_addon', true, 'followups', true,
      'email', true, 'sms', true, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000)
  END
$function$;

-- Attendance register ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_register(p_service uuid, p_search text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_svc public.services; v_q text;
BEGIN
  SELECT * INTO v_svc FROM public.services WHERE id = p_service;
  IF v_svc.id IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.has_tenant_role(v_svc.tenant_id, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not permitted'; END IF;
  v_q := nullif(trim(left(coalesce(p_search,''), 80)), '');
  RETURN jsonb_build_object(
    'service', jsonb_build_object('id', v_svc.id, 'name', v_svc.name, 'date', v_svc.service_date, 'is_open', v_svc.is_open),
    'writable', v_svc.is_open AND public.tenant_can_write(v_svc.tenant_id),
    'present_count', (SELECT count(*) FROM public.attendance a WHERE a.service_id = p_service AND a.member_id IS NOT NULL),
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'status', m.status, 'present', a.id IS NOT NULL, 'method', a.method) ORDER BY m.full_name)
      FROM (SELECT * FROM public.members m0
            WHERE m0.tenant_id = v_svc.tenant_id AND m0.status IN ('active','first_timer')
              AND (v_q IS NULL OR m0.full_name ILIKE '%' || v_q || '%')
            ORDER BY m0.full_name LIMIT 500) m
      LEFT JOIN public.attendance a ON a.service_id = p_service AND a.member_id = m.id), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.set_manual_attendance(p_service uuid, p_members uuid[], p_present boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_svc public.services; v_n integer := 0;
BEGIN
  IF p_members IS NULL OR array_length(p_members, 1) IS NULL THEN RETURN jsonb_build_object('changed', 0); END IF;
  IF array_length(p_members, 1) > 500 THEN RAISE EXCEPTION 'Too many members at once'; END IF;
  SELECT * INTO v_svc FROM public.services WHERE id = p_service;
  IF v_svc.id IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.has_tenant_role(v_svc.tenant_id, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT v_svc.is_open THEN RAISE EXCEPTION 'This service is closed'; END IF;
  IF NOT public.tenant_can_write(v_svc.tenant_id) THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
  IF NOT public.check_rate_limit('manual_attendance', auth.uid()::text, 600, 60) THEN RAISE EXCEPTION 'Too many changes, slow down'; END IF;
  IF p_present THEN
    INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, position_id, scanned_by_user_id, method)
    SELECT m.tenant_id, p_service, m.id, coalesce(m.branch_id, v_svc.branch_id), m.position_id, auth.uid(), 'manual'
    FROM public.members m WHERE m.id = ANY(p_members) AND m.tenant_id = v_svc.tenant_id AND m.status IN ('active','first_timer')
    ON CONFLICT (service_id, member_id) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    DELETE FROM public.attendance a WHERE a.service_id = p_service AND a.tenant_id = v_svc.tenant_id AND a.member_id = ANY(p_members);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  PERFORM public.log_audit(v_svc.tenant_id, CASE WHEN p_present THEN 'attendance.manual_mark' ELSE 'attendance.manual_unmark' END,
    p_service::text, jsonb_build_object('count', v_n), NULL, auth.uid());
  RETURN jsonb_build_object('changed', v_n);
END $$;

-- Absence alerts ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.absent_members(p_tenant uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_n integer; v_dates date[];
BEGIN
  IF NOT public.has_tenant_role(p_tenant, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT greatest(1, least(coalesce(absence_threshold, 3), 12)) INTO v_n FROM public.tenants WHERE id = p_tenant;
  SELECT array_agg(d ORDER BY d DESC) INTO v_dates FROM (
    SELECT DISTINCT service_date d FROM public.services
    WHERE tenant_id = p_tenant AND extract(dow FROM service_date) = 0 AND service_date <= current_date
    ORDER BY d DESC LIMIT v_n) s;
  IF v_dates IS NULL OR array_length(v_dates, 1) < v_n THEN
    RETURN jsonb_build_object('threshold', v_n, 'ready', false, 'members', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('threshold', v_n, 'ready', true, 'members', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'phone', m.phone, 'last_seen', ls.last_seen, 'in_followups', f.id IS NOT NULL) ORDER BY ls.last_seen NULLS FIRST, m.full_name)
    FROM (SELECT * FROM public.members m0 WHERE m0.tenant_id = p_tenant AND m0.status IN ('active','first_timer')
            AND m0.joined_on <= v_dates[array_length(v_dates,1)]
            AND NOT EXISTS (SELECT 1 FROM public.attendance a JOIN public.services s ON s.id = a.service_id
                            WHERE a.member_id = m0.id AND s.tenant_id = p_tenant AND s.service_date = ANY(v_dates))
          ORDER BY m0.full_name LIMIT 100) m
    LEFT JOIN LATERAL (SELECT max(a.recorded_at) last_seen FROM public.attendance a WHERE a.member_id = m.id) ls ON true
    LEFT JOIN public.member_followups f ON f.member_id = m.id), '[]'::jsonb));
END $$;

-- Follow-ups ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_followup(p_member uuid, p_status text, p_leader uuid, p_note text, p_next date, p_source text DEFAULT 'manual')
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid; v_tier public.tenant_tier; v_id uuid;
BEGIN
  SELECT m.tenant_id, t.tier INTO v_tenant, v_tier FROM public.members m JOIN public.tenants t ON t.id = m.tenant_id WHERE m.id = p_member;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT public.has_tenant_role(v_tenant, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT (public.tier_entitlements(v_tier)->>'followups')::boolean THEN RAISE EXCEPTION 'Follow-ups need the Standard or Premium package'; END IF;
  IF NOT public.tenant_can_write(v_tenant) THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
  IF p_status NOT IN ('new','contacted','visited','joined','not_interested') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF p_source NOT IN ('first_timer','absence','manual') THEN RAISE EXCEPTION 'Invalid source'; END IF;
  IF p_leader IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leader_profiles WHERE id = p_leader AND tenant_id = v_tenant) THEN RAISE EXCEPTION 'Leader not found'; END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN RAISE EXCEPTION 'Note is too long'; END IF;
  INSERT INTO public.member_followups (tenant_id, member_id, status, assigned_leader_id, note, next_contact_on, source, created_by)
  VALUES (v_tenant, p_member, p_status, p_leader, nullif(trim(p_note), ''), p_next, p_source, auth.uid())
  ON CONFLICT (member_id) DO UPDATE SET status = excluded.status, assigned_leader_id = excluded.assigned_leader_id,
    note = excluded.note, next_contact_on = excluded.next_contact_on, updated_at = now()
  RETURNING id INTO v_id;
  IF p_status = 'joined' THEN UPDATE public.members SET status = 'active' WHERE id = p_member AND status = 'first_timer'; END IF;
  PERFORM public.log_audit(v_tenant, 'followup.updated', p_member::text, jsonb_build_object('status', p_status), NULL, auth.uid());
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_followups(p_tenant uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_tenant_role(p_tenant, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('member_id', m.id, 'full_name', m.full_name, 'phone', m.phone, 'joined_on', m.joined_on,
      'followup_id', f.id, 'status', coalesce(f.status, 'new'), 'assigned_leader_id', f.assigned_leader_id,
      'leader_name', lp.full_name, 'note', f.note, 'next_contact_on', f.next_contact_on, 'source', coalesce(f.source, 'first_timer'))
      ORDER BY (f.next_contact_on IS NULL), f.next_contact_on, m.joined_on DESC)
    FROM (SELECT * FROM public.members WHERE tenant_id = p_tenant AND status IN ('first_timer','active')) m
    LEFT JOIN public.member_followups f ON f.member_id = m.id
    LEFT JOIN public.leader_profiles lp ON lp.id = f.assigned_leader_id
    WHERE f.id IS NOT NULL OR m.status = 'first_timer'
    LIMIT 1000), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.my_followups()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('member_id', m.id, 'full_name', m.full_name, 'phone', m.phone,
    'status', f.status, 'note', f.note, 'next_contact_on', f.next_contact_on) ORDER BY f.next_contact_on NULLS LAST), '[]'::jsonb)
  FROM public.member_followups f
  JOIN public.leader_profiles lp ON lp.id = f.assigned_leader_id AND lp.user_id = auth.uid()
  JOIN public.members m ON m.id = f.member_id
  WHERE f.status NOT IN ('joined','not_interested');
$$;

-- Two-step sign-in ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_require_mfa(p_tenant uuid, p_required boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_tenant_role(p_tenant, ARRAY['owner']::public.app_role[]) THEN RAISE EXCEPTION 'Only the owner can change this'; END IF;
  IF p_required AND coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' THEN RAISE EXCEPTION 'Turn on two-step sign-in for your own account first'; END IF;
  UPDATE public.tenants SET require_mfa = p_required WHERE id = p_tenant;
  PERFORM public.log_audit(p_tenant, 'security.require_mfa', NULL, jsonb_build_object('required', p_required), NULL, auth.uid());
END $$;

-- Account-level operator check (no assurance level) used only to decide whether to show 2FA setup.
CREATE OR REPLACE FUNCTION public.is_platform_admin_account()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) $$;

REVOKE EXECUTE ON FUNCTION public.attendance_register(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_manual_attendance(uuid, uuid[], boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.absent_members(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_followup(uuid, text, uuid, text, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_followups(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_followups() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_require_mfa(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attendance_register(uuid, text), public.set_manual_attendance(uuid, uuid[], boolean),
  public.absent_members(uuid), public.upsert_followup(uuid, text, uuid, text, date, text), public.list_followups(uuid),
  public.my_followups(), public.set_require_mfa(uuid, boolean), public.is_platform_admin_account() TO authenticated;

-- ============ 0017_operator_requires_two_step.sql ============
CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
     and exists (select 1 from public.platform_admins where user_id = auth.uid());
$function$;

-- ============ 0018_fix_manual_attendance_conflict.sql ============
CREATE OR REPLACE FUNCTION public.set_manual_attendance(p_service uuid, p_members uuid[], p_present boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_svc public.services; v_n integer := 0;
BEGIN
  IF p_members IS NULL OR array_length(p_members, 1) IS NULL THEN RETURN jsonb_build_object('changed', 0); END IF;
  IF array_length(p_members, 1) > 500 THEN RAISE EXCEPTION 'Too many members at once'; END IF;
  SELECT * INTO v_svc FROM public.services WHERE id = p_service;
  IF v_svc.id IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.has_tenant_role(v_svc.tenant_id, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT v_svc.is_open THEN RAISE EXCEPTION 'This service is closed'; END IF;
  IF NOT public.tenant_can_write(v_svc.tenant_id) THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
  IF NOT public.check_rate_limit('manual_attendance', auth.uid()::text, 600, 60) THEN RAISE EXCEPTION 'Too many changes, slow down'; END IF;
  IF p_present THEN
    INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, position_id, scanned_by_user_id, method)
    SELECT m.tenant_id, p_service, m.id, coalesce(m.branch_id, v_svc.branch_id), m.position_id, auth.uid(), 'manual'
    FROM public.members m WHERE m.id = ANY(p_members) AND m.tenant_id = v_svc.tenant_id AND m.status IN ('active','first_timer')
    ON CONFLICT (service_id, member_id) WHERE member_id IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    DELETE FROM public.attendance a WHERE a.service_id = p_service AND a.tenant_id = v_svc.tenant_id AND a.member_id = ANY(p_members);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  PERFORM public.log_audit(v_svc.tenant_id, CASE WHEN p_present THEN 'attendance.manual_mark' ELSE 'attendance.manual_unmark' END,
    p_service::text, jsonb_build_object('count', v_n), NULL, auth.uid());
  RETURN jsonb_build_object('changed', v_n);
END $function$;

-- ============ 0019_standard_leader_qr_dashboard.sql ============

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.qr_key (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), k text NOT NULL);
INSERT INTO private.qr_key (k) VALUES (encode(gen_random_bytes(32), 'hex')) ON CONFLICT DO NOTHING;
REVOKE ALL ON private.qr_key FROM PUBLIC, anon, authenticated;

ALTER TABLE public.qr_tokens ADD COLUMN IF NOT EXISTS token_enc bytea;
ALTER TABLE public.qr_tokens ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'member';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS designation text NOT NULL DEFAULT 'member';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS is_leader boolean NOT NULL DEFAULT false;
ALTER TABLE public.leader_profiles ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS qr_tokens_member_active_idx ON public.qr_tokens(member_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS members_invited_leader_idx ON public.members(invited_by_leader_id);

CREATE TABLE public.leader_contact_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  leader_id uuid NOT NULL REFERENCES public.leader_profiles(id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('called','visited','messaged','unreachable','other')),
  note text CHECK (length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.leader_contact_logs TO authenticated;
GRANT ALL ON public.leader_contact_logs TO service_role;
ALTER TABLE public.leader_contact_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read contact logs" ON public.leader_contact_logs FOR SELECT TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','church_admin','branch_admin']::public.app_role[]));
CREATE POLICY "leader reads own logs" ON public.leader_contact_logs FOR SELECT TO authenticated
  USING (leader_id IN (SELECT id FROM public.leader_profiles WHERE user_id = auth.uid()));
CREATE INDEX leader_contact_logs_member_idx ON public.leader_contact_logs(member_id, created_at DESC);

-- Issue a fresh QR token for a member, stored hashed (lookup) and encrypted (re-display).
CREATE OR REPLACE FUNCTION private.new_qr(p_tenant uuid, p_member uuid, p_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_token text; v_key text;
BEGIN
  SELECT k INTO v_key FROM private.qr_key WHERE id = 1;
  UPDATE public.qr_tokens SET revoked_at = now() WHERE member_id = p_member AND revoked_at IS NULL;
  v_token := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.qr_tokens (token_hash, tenant_id, member_id, token_enc, kind)
  VALUES (digest(v_token, 'sha256'), p_tenant, p_member, pgp_sym_encrypt(v_token, v_key), p_kind);
  RETURN v_token;
END $$;
REVOKE ALL ON FUNCTION private.new_qr(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.current_qr(p_tenant uuid, p_member uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_enc bytea; v_key text; v_kind text;
BEGIN
  SELECT token_enc INTO v_enc FROM public.qr_tokens
   WHERE member_id = p_member AND revoked_at IS NULL AND token_enc IS NOT NULL
   ORDER BY issued_at DESC LIMIT 1;
  IF v_enc IS NOT NULL THEN
    SELECT k INTO v_key FROM private.qr_key WHERE id = 1;
    RETURN pgp_sym_decrypt(v_enc, v_key);
  END IF;
  SELECT CASE WHEN is_leader THEN 'leader' ELSE 'member' END INTO v_kind FROM public.members WHERE id = p_member;
  RETURN private.new_qr(p_tenant, p_member, coalesce(v_kind, 'member'));
END $$;
REVOKE ALL ON FUNCTION private.current_qr(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_qr_token(p_member uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
declare v_tenant uuid; v_branch uuid; v_leader boolean;
begin
  select tenant_id, branch_id, is_leader into v_tenant, v_branch, v_leader from public.members where id = p_member;
  if v_tenant is null then raise exception 'Member not found'; end if;
  if not (public.is_tenant_admin(v_tenant)
     or (public.has_tenant_role(v_tenant, array['branch_admin']::public.app_role[])
         and v_branch is not distinct from public.user_branch(v_tenant))) then
    raise exception 'Not permitted';
  end if;
  if not public.check_rate_limit('issue_qr', auth.uid()::text, 300, 3600) then
    raise exception 'Rate limit exceeded';
  end if;
  perform public.log_audit(v_tenant, 'qr.issued', p_member::text);
  return private.new_qr(v_tenant, p_member, case when v_leader then 'leader' else 'member' end);
end $$;

-- View (not rotate) a member's current code.
CREATE OR REPLACE FUNCTION public.get_member_qr(p_member uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
declare v_m record;
begin
  select id, tenant_id, branch_id, full_name, is_leader into v_m from public.members where id = p_member;
  if v_m.id is null then raise exception 'Member not found'; end if;
  if not (public.is_tenant_admin(v_m.tenant_id)
     or (public.has_tenant_role(v_m.tenant_id, array['branch_admin']::public.app_role[])
         and v_m.branch_id is not distinct from public.user_branch(v_m.tenant_id))) then
    raise exception 'Not permitted';
  end if;
  if not public.check_rate_limit('view_qr', auth.uid()::text, 600, 3600) then raise exception 'Rate limit exceeded'; end if;
  perform public.log_audit(v_m.tenant_id, 'qr.viewed', p_member::text);
  return jsonb_build_object('token', private.current_qr(v_m.tenant_id, p_member), 'full_name', v_m.full_name,
    'kind', case when v_m.is_leader then 'leader' else 'member' end);
end $$;

CREATE OR REPLACE FUNCTION public.get_all_member_qrs(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
declare v_out jsonb;
begin
  if not public.is_tenant_admin(p_tenant) then raise exception 'Not permitted'; end if;
  if not public.check_rate_limit('all_qr_zip', auth.uid()::text, 3, 3600) then
    raise exception 'Download limit reached (3 per hour). Please try again later.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name,
      'kind', case when m.is_leader then 'leader' else 'member' end,
      'token', private.current_qr(p_tenant, m.id)) order by m.full_name), '[]'::jsonb)
    into v_out
    from (select id, full_name, is_leader from public.members
           where tenant_id = p_tenant and status in ('active','first_timer') order by full_name limit 5000) m;
  perform public.log_audit(p_tenant, 'qr.bulk_download', 'all', jsonb_build_object('count', jsonb_array_length(v_out)));
  return v_out;
end $$;

-- Scans record the designation carried by the code.
CREATE OR REPLACE FUNCTION public.resolve_scan(p_token text, p_service uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_tenant uuid; v_member uuid; v_name text; v_branch uuid; v_pos uuid; v_svc record; v_new boolean; v_kind text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.check_rate_limit('scan', auth.uid()::text, 600, 3600) then raise exception 'Rate limit exceeded'; end if;
  select * into v_svc from public.services where id = p_service;
  if v_svc is null then raise exception 'Service not found'; end if;
  if not public.is_tenant_member(v_svc.tenant_id) then raise exception 'Not permitted'; end if;
  if not public.tenant_can_write(v_svc.tenant_id) then raise exception 'Subscription inactive'; end if;
  if not v_svc.is_open then raise exception 'Service is closed'; end if;
  select q.tenant_id, q.member_id, q.kind into v_tenant, v_member, v_kind
  from public.qr_tokens q
  where q.token_hash = digest(coalesce(p_token,''), 'sha256') and q.revoked_at is null and q.tenant_id = v_svc.tenant_id;
  if v_member is null then return jsonb_build_object('ok', false, 'reason', 'unknown_code'); end if;
  select full_name, branch_id, position_id into v_name, v_branch, v_pos from public.members where id = v_member;
  if not public.can_read_member(v_tenant, v_branch, v_pos)
     and not public.has_tenant_role(v_tenant, array['usher']::public.app_role[]) then
    return jsonb_build_object('ok', false, 'reason', 'out_of_scope');
  end if;
  insert into public.attendance (tenant_id, service_id, member_id, branch_id, position_id, scanned_by_user_id, method, designation)
  values (v_tenant, p_service, v_member, coalesce(v_branch, v_svc.branch_id), v_pos, auth.uid(), 'scan', coalesce(v_kind,'member'))
  on conflict (service_id, member_id) do nothing;
  v_new := found;
  return jsonb_build_object('ok', true, 'member_name', v_name, 'duplicate', not v_new, 'designation', coalesce(v_kind,'member'));
end; $function$;

-- Self check-in now stores the code encrypted so the church can re-open it.
CREATE OR REPLACE FUNCTION public.self_checkin_v3(p_subdomain text, p_service uuid, p_full_name text, p_phone text, p_email text, p_dob date, p_gender gender_type, p_marital_status text, p_area text, p_occupation text, p_education text, p_leader uuid, p_ip text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $function$
DECLARE
  v_tenant record; v_branch uuid; v_member uuid; v_service record;
  v_phone text; v_token text; v_existing boolean := false;
  v_channel text; v_dest text; v_email text; v_leader uuid; v_is_leader boolean := false;
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
  ON CONFLICT (service_id, member_id) DO NOTHING;
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

-- Members a leader may see: chose them at check-in, or assigned via follow-ups.
CREATE OR REPLACE FUNCTION public.leader_scope_member_ids(p_leader uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id FROM public.members m WHERE m.invited_by_leader_id = p_leader AND m.status <> 'anonymised'
  UNION
  SELECT f.member_id FROM public.member_followups f WHERE f.assigned_leader_id = p_leader
$$;
REVOKE ALL ON FUNCTION public.leader_scope_member_ids(uuid) FROM PUBLIC, anon, authenticated;

-- Leader's own QR code (creates their linked member record the first time).
CREATE OR REPLACE FUNCTION public.leader_my_qr()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_l record; v_member uuid; v_branch uuid;
BEGIN
  SELECT * INTO v_l FROM public.leader_profiles WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
  IF v_l.id IS NULL THEN RAISE EXCEPTION 'Not a leader'; END IF;
  IF NOT public.tenant_has_feature(v_l.tenant_id, 'leaders') THEN RAISE EXCEPTION 'Not part of this package'; END IF;
  v_member := v_l.member_id;
  IF v_member IS NULL AND v_l.phone IS NOT NULL THEN
    SELECT id INTO v_member FROM public.members WHERE tenant_id = v_l.tenant_id AND phone = v_l.phone LIMIT 1;
  END IF;
  IF v_member IS NULL THEN
    SELECT id INTO v_branch FROM public.branches WHERE tenant_id = v_l.tenant_id ORDER BY is_default DESC, created_at LIMIT 1;
    INSERT INTO public.members (tenant_id, branch_id, full_name, phone, email, date_of_birth, residential_area, status, is_leader)
    VALUES (v_l.tenant_id, v_branch, v_l.full_name, v_l.phone, v_l.email, v_l.date_of_birth, v_l.location, 'active', true)
    RETURNING id INTO v_member;
  END IF;
  UPDATE public.members SET is_leader = true, status = CASE WHEN status = 'first_timer' THEN 'active'::member_status ELSE status END WHERE id = v_member;
  IF v_l.member_id IS DISTINCT FROM v_member THEN
    UPDATE public.leader_profiles SET member_id = v_member WHERE id = v_l.id;
    UPDATE public.qr_tokens SET revoked_at = now() WHERE member_id = v_member AND revoked_at IS NULL AND kind <> 'leader';
  END IF;
  RETURN jsonb_build_object('token', private.current_qr(v_l.tenant_id, v_member), 'full_name', v_l.full_name);
END $$;
GRANT EXECUTE ON FUNCTION public.leader_my_qr() TO authenticated;

CREATE OR REPLACE FUNCTION public.leader_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l record; v_n int; v_sundays uuid[]; v_last uuid; v_first date; v_res jsonb;
BEGIN
  SELECT lp.*, t.name AS church_name, t.absence_threshold INTO v_l
    FROM public.leader_profiles lp JOIN public.tenants t ON t.id = lp.tenant_id
   WHERE lp.user_id = auth.uid() AND lp.status = 'active' LIMIT 1;
  IF v_l.id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  IF NOT public.tenant_has_feature(v_l.tenant_id, 'leaders') THEN RETURN jsonb_build_object('ok', false); END IF;
  v_n := greatest(coalesce(v_l.absence_threshold, 3), 1);
  SELECT array_agg(id ORDER BY service_date DESC), min(service_date) INTO v_sundays, v_first FROM (
    SELECT id, service_date FROM public.services WHERE tenant_id = v_l.tenant_id AND extract(dow FROM service_date) = 0 AND service_date <= current_date
    ORDER BY service_date DESC LIMIT v_n) s;
  v_last := v_sundays[1];

  CREATE TEMP TABLE IF NOT EXISTS _scope (id uuid PRIMARY KEY) ON COMMIT DROP;
  DELETE FROM _scope;
  INSERT INTO _scope SELECT DISTINCT x FROM public.leader_scope_member_ids(v_l.id) x;

  WITH m AS (SELECT mm.* FROM public.members mm JOIN _scope s ON s.id = mm.id),
  last_seen AS (SELECT a.member_id, max(a.recorded_at) AS at FROM public.attendance a JOIN _scope s ON s.id = a.member_id GROUP BY a.member_id),
  fu AS (SELECT DISTINCT ON (member_id) member_id, status FROM public.member_followups WHERE tenant_id = v_l.tenant_id ORDER BY member_id, updated_at DESC),
  lastlog AS (SELECT DISTINCT ON (member_id) member_id, outcome, note, created_at FROM public.leader_contact_logs WHERE leader_id = v_l.id ORDER BY member_id, created_at DESC)
  SELECT jsonb_build_object(
    'ok', true, 'church', v_l.church_name, 'full_name', v_l.full_name, 'absence_threshold', v_n,
    'sundays_counted', coalesce(array_length(v_sundays, 1), 0),
    'stats', jsonb_build_object(
      'members', (SELECT count(*) FROM m),
      'first_timers_month', (SELECT count(*) FROM m WHERE status = 'first_timer' AND joined_on >= date_trunc('month', current_date)),
      'present_last_sunday', CASE WHEN v_last IS NULL THEN 0 ELSE (SELECT count(*) FROM public.attendance a JOIN _scope s ON s.id = a.member_id WHERE a.service_id = v_last) END,
      'absent', CASE WHEN coalesce(array_length(v_sundays,1),0) < v_n THEN 0 ELSE (SELECT count(*) FROM m WHERE m.joined_on <= v_first AND NOT EXISTS (SELECT 1 FROM public.attendance a WHERE a.member_id = m.id AND a.service_id = ANY(v_sundays))) END
    ),
    'members', coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'phone', m.phone, 'email', m.email,
        'status', m.status, 'joined_on', m.joined_on, 'last_seen', ls.at, 'residential_area', m.residential_area) ORDER BY m.full_name)
      FROM (SELECT * FROM m ORDER BY full_name LIMIT 1000) m LEFT JOIN last_seen ls ON ls.member_id = m.id), '[]'::jsonb),
    'first_timers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'phone', m.phone, 'joined_on', m.joined_on,
        'followup_status', fu.status) ORDER BY m.joined_on DESC)
      FROM (SELECT * FROM m WHERE status = 'first_timer' ORDER BY joined_on DESC LIMIT 200) m LEFT JOIN fu ON fu.member_id = m.id), '[]'::jsonb),
    'absentees', CASE WHEN coalesce(array_length(v_sundays,1),0) < v_n THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'phone', m.phone,
        'last_seen', ls.at, 'last_outcome', ll.outcome, 'last_note', ll.note, 'last_contact', ll.created_at) ORDER BY ls.at NULLS FIRST)
      FROM m LEFT JOIN last_seen ls ON ls.member_id = m.id LEFT JOIN lastlog ll ON ll.member_id = m.id
      WHERE m.joined_on <= v_first AND NOT EXISTS (SELECT 1 FROM public.attendance a WHERE a.member_id = m.id AND a.service_id = ANY(v_sundays))), '[]'::jsonb) END,
    'demographics', jsonb_build_object(
      'gender', coalesce((SELECT jsonb_object_agg(k, c) FROM (SELECT coalesce(gender::text,'unknown') k, count(*) c FROM m GROUP BY 1) g), '{}'::jsonb),
      'marital', coalesce((SELECT jsonb_object_agg(k, c) FROM (SELECT coalesce(marital_status,'unknown') k, count(*) c FROM m GROUP BY 1) g), '{}'::jsonb),
      'age', coalesce((SELECT jsonb_object_agg(k, c) FROM (SELECT CASE WHEN date_of_birth IS NULL THEN 'unknown'
            WHEN age(date_of_birth) < interval '18 years' THEN 'Under 18' WHEN age(date_of_birth) < interval '26 years' THEN '18–25'
            WHEN age(date_of_birth) < interval '36 years' THEN '26–35' WHEN age(date_of_birth) < interval '51 years' THEN '36–50' ELSE '51+' END k, count(*) c FROM m GROUP BY 1) g), '{}'::jsonb),
      'location', coalesce((SELECT jsonb_object_agg(k, c) FROM (SELECT coalesce(residential_area,'unknown') k, count(*) c FROM m GROUP BY 1 ORDER BY 2 DESC LIMIT 8) g), '{}'::jsonb),
      'occupation', coalesce((SELECT jsonb_object_agg(k, c) FROM (SELECT coalesce(occupation,'unknown') k, count(*) c FROM m GROUP BY 1 ORDER BY 2 DESC LIMIT 8) g), '{}'::jsonb)
    ),
    'birthdays', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'full_name', b.full_name, 'date_of_birth', b.date_of_birth, 'phone', b.phone) ORDER BY b.nd)
      FROM (SELECT id, full_name, date_of_birth, phone,
              ((make_date(extract(year FROM current_date)::int, extract(month FROM date_of_birth)::int, least(extract(day FROM date_of_birth)::int, 28)) - current_date + 365) % 365) nd
            FROM m WHERE date_of_birth IS NOT NULL) b WHERE b.nd <= 30), '[]'::jsonb),
    'my_streak', (SELECT count(*) FROM (SELECT s.id FROM public.services s WHERE s.tenant_id = v_l.tenant_id AND extract(dow FROM s.service_date) = 0 AND s.service_date <= current_date ORDER BY s.service_date DESC LIMIT 12) s
                  WHERE v_l.member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.attendance a WHERE a.service_id = s.id AND a.member_id = v_l.member_id))
  ) INTO v_res;
  RETURN v_res;
END $$;
GRANT EXECUTE ON FUNCTION public.leader_dashboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.leader_log_contact(p_member uuid, p_outcome text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l record;
BEGIN
  SELECT * INTO v_l FROM public.leader_profiles WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
  IF v_l.id IS NULL THEN RAISE EXCEPTION 'Not a leader'; END IF;
  IF p_outcome NOT IN ('called','visited','messaged','unreachable','other') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  IF length(coalesce(p_note,'')) > 500 THEN RAISE EXCEPTION 'Note is too long'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leader_scope_member_ids(v_l.id) x WHERE x = p_member) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.check_rate_limit('leader_contact', auth.uid()::text, 200, 3600) THEN RAISE EXCEPTION 'Rate limit exceeded'; END IF;
  INSERT INTO public.leader_contact_logs (tenant_id, member_id, leader_id, outcome, note)
  VALUES (v_l.tenant_id, p_member, v_l.id, p_outcome, nullif(btrim(coalesce(p_note,'')),''));
  UPDATE public.member_followups SET
    note = left(v_l.full_name || ' (' || p_outcome || ', ' || to_char(now(),'YYYY-MM-DD') || ')' || coalesce(': ' || nullif(btrim(p_note),''), ''), 500),
    status = CASE WHEN status = 'new' AND p_outcome IN ('called','visited','messaged') THEN 'contacted' ELSE status END,
    updated_at = now()
  WHERE member_id = p_member AND tenant_id = v_l.tenant_id;
  PERFORM public.log_audit(v_l.tenant_id, 'leader.contact_logged', p_member::text, jsonb_build_object('outcome', p_outcome), '', auth.uid());
END $$;
GRANT EXECUTE ON FUNCTION public.leader_log_contact(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.leader_dashboard(), public.leader_my_qr(), public.leader_log_contact(uuid,text,text), public.get_all_member_qrs(uuid), public.get_member_qr(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_member_qr(uuid), public.get_all_member_qrs(uuid) TO authenticated;


-- ============ 0020_leader_dashboard_volatile.sql ============
ALTER FUNCTION public.leader_dashboard() VOLATILE;


-- ============ 0021_restrict_plan_config_reads.sql ============
DROP POLICY IF EXISTS "Plan config is public" ON public.plan_config;
DROP POLICY IF EXISTS "Signed-in users read plan config" ON public.plan_config;
DROP POLICY IF EXISTS "plan_config_authenticated_read" ON public.plan_config;

CREATE POLICY "plan config scoped read"
ON public.plan_config
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    JOIN public.tenants t ON t.id = tu.tenant_id
    WHERE tu.user_id = auth.uid()
      AND tu.status = 'active'
      AND t.tier = plan_config.tier
  )
);


-- ============ 0022_platform_risk_approvals_and_tenant_backups.sql ============
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS approval_risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_reason text,
  ADD COLUMN IF NOT EXISTS correction_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS tenants_risk_approval_idx
  ON public.tenants (approval_status, created_at DESC)
  WHERE approval_status = 'pending_approval';

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

CREATE OR REPLACE FUNCTION public.platform_request_correction(p_tenant uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF length(trim(p_reason)) < 5 THEN RAISE EXCEPTION 'A correction reason is required'; END IF;
  UPDATE public.tenants
  SET approval_status = 'correction_requested', approval_reason = trim(p_reason), correction_requested_at = now(), status = 'suspended'
  WHERE id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Church not found'; END IF;
  INSERT INTO public.platform_audit_events(actor_user_id, action, tenant_id, detail)
  VALUES (auth.uid(), 'tenant.correction_requested', p_tenant, jsonb_build_object('reason', trim(p_reason)));
END;
$$;
REVOKE ALL ON FUNCTION public.platform_request_correction(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_correction(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_flag_church(p_tenant uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF length(trim(p_reason)) < 5 THEN RAISE EXCEPTION 'A flag reason is required'; END IF;
  UPDATE public.tenants
  SET approval_status = 'pending_approval', approval_reason = trim(p_reason), approval_risk_flags = approval_risk_flags || jsonb_build_array(trim(p_reason)), status = 'suspended'
  WHERE id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Church not found'; END IF;
  INSERT INTO public.platform_audit_events(actor_user_id, action, tenant_id, detail)
  VALUES (auth.uid(), 'tenant.flagged_for_review', p_tenant, jsonb_build_object('reason', trim(p_reason)));
END;
$$;
REVOKE ALL ON FUNCTION public.platform_flag_church(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_flag_church(uuid,text) TO authenticated, service_role;


-- ============ 0024_fix_attendance_qr_conflict.sql ============
CREATE UNIQUE INDEX IF NOT EXISTS attendance_service_member_idx
  ON public.attendance (service_id, member_id);

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

