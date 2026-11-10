# Supernova 3.0 Admin Setup & Provisioning Guide

## How to Create the First Super Admin

Because client-side bootstrapping is disabled for security (preventing arbitrary users from claiming administrative privileges), the initial Super Admin role must be granted directly through the Supabase Dashboard.

### Step 1: Create an Account
1. Open the Supernova 3.0 Portal.
2. Navigate to `/admin/login`.
3. Sign in or register with your email address (e.g. `your_email@domain.com`).

### Step 2: Grant Super Admin Privileges
1. Open your project on the [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to the **SQL Editor** in the left sidebar.
3. Run the following query, replacing `'YOUR_EMAIL'` with your exact registered email:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'
FROM auth.users
WHERE email = 'YOUR_EMAIL';
```

4. Verify that 1 row was inserted.
5. Return to the portal and refresh `/admin`. You will now have full administrative access to all event management, content editing, and registration control features.

---

## Administrative Roles Reference

The system enforces four distinct operational roles:

| Role | Permissions & Scope |
| :--- | :--- |
| `super_admin` | Unrestricted full access to all settings, content, media, registration controls, audit logs, and game configuration. |
| `event_admin` | Can manage registrations, announcements, schedule, gallery, institutions, sponsors, FAQs, and content. Cannot alter sensitive system settings. |
| `checkin_staff` | Operational festival staff. Has access only to the check-in screens for Esports squads and Visitor passes on event days. |
| `score_operator` | Tournament staff. Has access to match scoring, games, and tournament brackets. |

To assign another role to a team member:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'event_admin' -- or 'checkin_staff', 'score_operator'
FROM auth.users
WHERE email = 'STAFF_EMAIL';
```
