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