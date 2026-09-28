-- ==============================================================================
-- Mene:Log Support Ticket System & Support Staff Console
-- Run this in your Supabase SQL Editor
-- ==============================================================================

-- 1. Create Enums if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_status') THEN
    CREATE TYPE public.support_ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_priority') THEN
    CREATE TYPE public.support_ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_reply_author_type') THEN
    CREATE TYPE public.support_reply_author_type AS ENUM ('church', 'support', 'super_admin');
  END IF;
END $$;

-- 2. Create support_staff table for dedicated support operators
CREATE TABLE IF NOT EXISTS public.support_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- 3. Create support_tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  submitted_by_user_id uuid NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  status public.support_ticket_status NOT NULL DEFAULT 'open',
  priority public.support_ticket_priority NOT NULL DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- 4. Create support_ticket_replies table
CREATE TABLE IF NOT EXISTS public.support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_type public.support_reply_author_type NOT NULL,
  author_id uuid NOT NULL,
  message text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Helper function to check if authenticated user is support staff or platform admin
CREATE OR REPLACE FUNCTION public.is_support_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.support_staff WHERE user_id = auth.uid())
     OR EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS support_tickets_tenant_idx ON public.support_tickets(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS support_ticket_replies_ticket_idx ON public.support_ticket_replies(ticket_id, created_at ASC);

-- 7. Row-Level Security
ALTER TABLE public.support_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_staff TO authenticated;
GRANT ALL ON public.support_staff TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT SELECT, INSERT ON public.support_ticket_replies TO authenticated;
GRANT ALL ON public.support_ticket_replies TO service_role;

-- Policies on support_staff
DROP POLICY IF EXISTS "support staff read themselves or platform admin" ON public.support_staff;
CREATE POLICY "support staff read themselves or platform admin" ON public.support_staff
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "platform admin manage support staff" ON public.support_staff;
CREATE POLICY "platform admin manage support staff" ON public.support_staff
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Policies on support_tickets
DROP POLICY IF EXISTS "church admin read own tickets" ON public.support_tickets;
CREATE POLICY "church admin read own tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin(tenant_id) OR public.is_support_staff());

DROP POLICY IF EXISTS "church admin insert own tickets" ON public.support_tickets;
CREATE POLICY "church admin insert own tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_tenant_admin(tenant_id) AND submitted_by_user_id = auth.uid())
    OR public.is_support_staff()
  );

DROP POLICY IF EXISTS "church admin and support update tickets" ON public.support_tickets;
CREATE POLICY "church admin and support update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(tenant_id) OR public.is_support_staff())
  WITH CHECK (public.is_tenant_admin(tenant_id) OR public.is_support_staff());

-- Policies on support_ticket_replies
DROP POLICY IF EXISTS "read ticket replies" ON public.support_ticket_replies;
CREATE POLICY "read ticket replies" ON public.support_ticket_replies
  FOR SELECT TO authenticated
  USING (
    public.is_support_staff()
    OR (
      is_internal = false
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND public.is_tenant_admin(t.tenant_id)
      )
    )
  );

DROP POLICY IF EXISTS "insert ticket replies" ON public.support_ticket_replies;
CREATE POLICY "insert ticket replies" ON public.support_ticket_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_support_staff()
    OR (
      is_internal = false
      AND author_type = 'church'
      AND author_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND public.is_tenant_admin(t.tenant_id)
      )
    )
  );
