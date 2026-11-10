/*
# Add visitor_registrations table

1. New Tables
- `visitor_registrations`
  - `id` (uuid, primary key)
  - `registration_ref` (text, unique, not null) — generated server-side via generate_registration_ref()
  - `full_name` (text, not null) — visitor's full name
  - `email` (text, not null) — visitor's contact email
  - `phone` (text, not null) — visitor's mobile number
  - `institution` (text, nullable) — optional institution/organisation
  - `visitor_category` (text, nullable) — configured by organisers
  - `visitor_count` (integer, default 1) — number of visitors if group registration
  - `status` (text, not null, default 'pending') — always inserted as pending; client cannot set
  - `admin_notes` (text, nullable) — admin-only notes
  - `consent_given` (boolean, not null, default true) — privacy notice consent
  - `submitted_at` (timestamptz, default now())
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `visitor_registrations`.
- Grant INSERT to anon, authenticated so visitors can submit without signing in.
- Grant SELECT, UPDATE, DELETE to authenticated (admin-only via is_admin() policies).
- Public INSERT policy forces status = 'pending' (clients cannot self-approve).
- Admin-only SELECT, UPDATE, DELETE via is_admin() check.
- Reference generated server-side via trigger calling generate_registration_ref().

3. Important notes
- This table is ADDITIVE — no existing tables are modified or dropped.
- The existing `registrations` table continues to serve esports team registrations.
- Visitor and esports registrations are kept completely separate.
- Registration references are generated server-side via the existing generate_registration_ref() function.
*/

CREATE TABLE IF NOT EXISTS visitor_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_ref text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  institution text,
  visitor_category text,
  visitor_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  consent_given boolean NOT NULL DEFAULT true,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE visitor_registrations ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON visitor_registrations TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON visitor_registrations TO authenticated;

DROP POLICY IF EXISTS "public_insert_pending_visitor_registration" ON visitor_registrations;
CREATE POLICY "public_insert_pending_visitor_registration"
ON visitor_registrations FOR INSERT
TO anon, authenticated
WITH CHECK (status = 'pending');

DROP POLICY IF EXISTS "admin_read_visitor_registrations" ON visitor_registrations;
CREATE POLICY "admin_read_visitor_registrations"
ON visitor_registrations FOR SELECT
TO authenticated
USING (is_admin());

DROP POLICY IF EXISTS "admin_update_visitor_registrations" ON visitor_registrations;
CREATE POLICY "admin_update_visitor_registrations"
ON visitor_registrations FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_visitor_registrations" ON visitor_registrations;
CREATE POLICY "admin_delete_visitor_registrations"
ON visitor_registrations FOR DELETE
TO authenticated
USING (is_admin());

-- Trigger: generate registration reference server-side
CREATE OR REPLACE FUNCTION set_visitor_registration_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.registration_ref IS NULL OR NEW.registration_ref = '' THEN
    NEW.registration_ref := generate_registration_ref();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_visitor_registration_ref() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_set_visitor_registration_ref ON visitor_registrations;
CREATE TRIGGER trg_set_visitor_registration_ref
BEFORE INSERT ON visitor_registrations
FOR EACH ROW EXECUTE FUNCTION set_visitor_registration_ref();

-- updated_at trigger
CREATE TRIGGER trg_visitor_registrations_updated_at
BEFORE UPDATE ON visitor_registrations
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
