-- Lock down plan_config: only signed-in users can read plan feature switches.
-- Server features (check-in page, Watch Live, Ask Mene) read it with admin access and are unaffected.
drop policy if exists "Plan config is public" on public.plan_config;
drop policy if exists "Signed-in users read plan config" on public.plan_config;
create policy "Signed-in users read plan config"
  on public.plan_config for select to authenticated using (true);
revoke all on public.plan_config from anon;
grant select on public.plan_config to authenticated;
grant all on public.plan_config to service_role;
