-- Fix: conversations require client_id (NOT NULL), blocking messaging for
-- applications created by admins/experts (where company_owner_id is null).
-- Solution: make client_id nullable and add application-centric RLS policies
-- so all parties with access to an application can use the message thread.
-- One conversation per application; access controlled via agency membership
-- and platform staff checks — no client_id lookup required.

-- ── Schema ────────────────────────────────────────────────────────────────

-- a. Make client_id nullable so conversations can exist without a company owner
ALTER TABLE public.conversations ALTER COLUMN client_id DROP NOT NULL;

-- b. Index on application_id — required for efficient RLS policy evaluation
CREATE INDEX IF NOT EXISTS idx_conversations_application_id
  ON public.conversations(application_id);

-- ── Conversations RLS ─────────────────────────────────────────────────────

-- c. Agency members: SELECT conversations for their agency's applications
CREATE POLICY "Agency members can view conversations for their applications"
  ON public.conversations FOR SELECT
  USING (
    application_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = conversations.application_id
        AND a.agency_id IS NOT NULL
        AND public.is_agency_member(a.agency_id)
    )
  );

-- d. Agency members: INSERT (create first message thread on an application)
CREATE POLICY "Agency members can insert conversations for their applications"
  ON public.conversations FOR INSERT
  WITH CHECK (
    application_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = conversations.application_id
        AND a.agency_id IS NOT NULL
        AND public.is_agency_member(a.agency_id)
    )
  );

-- e. Agency members: UPDATE (last_message_at timestamp)
CREATE POLICY "Agency members can update conversations for their applications"
  ON public.conversations FOR UPDATE
  USING (
    application_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = conversations.application_id
        AND a.agency_id IS NOT NULL
        AND public.is_agency_member(a.agency_id)
    )
  );

-- f. Platform staff (admin + expert): full read/write on all conversations
CREATE POLICY "Platform staff can view all conversations"
  ON public.conversations FOR SELECT
  USING (public.is_platform_staff());

CREATE POLICY "Platform staff can insert conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (public.is_platform_staff());

CREATE POLICY "Platform staff can update conversations"
  ON public.conversations FOR UPDATE
  USING (public.is_platform_staff());

-- ── Messages RLS ──────────────────────────────────────────────────────────

-- g. Agency members: SELECT messages in conversations for their applications
CREATE POLICY "Agency members can view messages in their application conversations"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.applications a ON a.id = c.application_id
      WHERE c.id = messages.conversation_id
        AND a.agency_id IS NOT NULL
        AND public.is_agency_member(a.agency_id)
    )
  );

-- h. Agency members: INSERT (send messages)
CREATE POLICY "Agency members can insert messages in their application conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.applications a ON a.id = c.application_id
      WHERE c.id = messages.conversation_id
        AND a.agency_id IS NOT NULL
        AND public.is_agency_member(a.agency_id)
    )
  );

-- i. Platform staff: full read/write on all messages
CREATE POLICY "Platform staff can view all messages"
  ON public.messages FOR SELECT
  USING (public.is_platform_staff());

CREATE POLICY "Platform staff can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (public.is_platform_staff());

CREATE POLICY "Platform staff can update messages"
  ON public.messages FOR UPDATE
  USING (public.is_platform_staff());
