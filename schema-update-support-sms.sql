-- ==============================================================================
-- Mene:Log Database Schema Update: Support Ticket SMS Notifications & Branch Customization
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor).
-- This script is safe and idempotent.
-- ==============================================================================

-- 1. Tenant-level SMS notification controls
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS support_sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS support_sms_recipients text;

-- 2. Branch-level custom SMS notification controls
ALTER TABLE public.branches 
  ADD COLUMN IF NOT EXISTS support_sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS support_sms_recipients text;

-- 3. Link support tickets to branches for branch-specific routing
ALTER TABLE public.support_tickets 
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_tickets_branch_idx ON public.support_tickets (branch_id);

-- 4. Enable staff to read and update branch notification configurations
DROP POLICY IF EXISTS "Church staff can manage their branches" ON public.branches;
CREATE POLICY "Church staff can manage their branches" ON public.branches
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));
