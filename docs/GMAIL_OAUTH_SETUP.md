# SUPERNOVA 3.0 — GMAIL API & OAUTH 2.0 SETUP GUIDE

Official College Account: **`animationthenationalcollege@gmail.com`**  
Integration Type: **Supabase Edge Function backend with Server-Side OAuth 2.0 Refresh Token**

---

## Architecture & Security Principles
- **No Passwords**: The college account password is never collected, transmitted, or stored.
- **Server-Side Only**: The Google OAuth `client_secret` and `refresh_token` are stored securely inside Supabase Edge Function Secrets. Frontend code never sees or bundles these credentials.
- **Minimum Scopes**: Uses `https://www.googleapis.com/auth/gmail.send` exclusively.
- **Admin Access Only**: Requests to the Edge Function validate the caller's Supabase JWT and enforce `public.is_admin()` role verification before processing any email.
- **Registration Confirmations**: The existing Resend confirmation workflow (`supabase/functions/send-registration-confirmation`) remains intact and functional. Registration confirmations continue through Resend until the Gmail integration has passed testing and is approved.

---

## Step 1: Enable the Gmail API in Google Cloud Console

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your Google Cloud project (or create a new project named `Supernova-3-CRM`).
3. In the search bar or left navigation menu, go to **APIs & Services** > **Library**.
4. Search for **Gmail API**.
5. Click **Gmail API** and click the **Enable** button.

---

## Step 2: Configure the OAuth Consent Screen

1. In the Google Cloud Console, navigate to **APIs & Services** > **OAuth consent screen**.
2. Select User Type:
   - **Internal** (if using a Google Workspace organization), OR
   - **External** (if using standard `@gmail.com` address).
3. Fill in the App Information:
   - **App Name**: `Supernova 3.0 CRM`
   - **User support email**: `animationthenationalcollege@gmail.com`
   - **Developer contact information**: `animationthenationalcollege@gmail.com`
4. On the **Scopes** page, click **Add or Remove Scopes**:
   - Manually add or search for: `https://www.googleapis.com/auth/gmail.send`
   - Check the box and click **Update**.
5. On the **Test Users** page (if External in "Testing" status):
   - Click **Add Users**.
   - Add `animationthenationalcollege@gmail.com`.
   - Click **Save and Continue**.

---

## Step 3: Create OAuth 2.0 Client Credentials

1. Navigate to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **OAuth client ID**.
3. Select Application type: **Web application** (or **Desktop app**).
4. Name: `Supernova CRM Gmail Backend`.
5. Under **Authorized redirect URIs**, add:
   - If using Google OAuth Playground:
     `https://developers.google.com/oauthplayground`
   - If using your custom redirect or local script:
     `http://localhost:3000/oauth2callback`
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret**.

---

## Step 4: Authorise the College Gmail Account and Obtain a Refresh Token

You can generate the permanent refresh token using Google OAuth 2.0 Playground:

1. Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Click the gear icon (⚙️) in the top right:
   - Check **Use your own OAuth credentials**.
   - Enter your **OAuth Client ID** and **OAuth Client Secret** from Step 3.
3. In Step 1 on the left ("Select & authorize APIs"):
   - Scroll to **Gmail API v1**.
   - Check `https://www.googleapis.com/auth/gmail.send`.
4. Click **Authorize APIs**.
5. Sign in using the official college account:
   `animationthenationalcollege@gmail.com`.
6. Click **Continue** / **Allow** to grant permission.
7. In Step 2 ("Exchange authorization code for tokens"):
   - Click **Exchange authorization code for tokens**.
8. Copy the **Refresh token** value.

---

## Step 5: Configure Supabase Edge Function Secrets

Run the following command using the Supabase CLI, or configure them directly in your [Supabase Project Dashboard](https://supabase.com/dashboard) under **Project Settings** > **Edge Functions** > **Secrets**:

```bash
# Set secrets via Supabase CLI
supabase secrets set \
  GMAIL_CLIENT_ID="<your-google-client-id>.apps.googleusercontent.com" \
  GMAIL_CLIENT_SECRET="<your-google-client-secret>" \
  GMAIL_REFRESH_TOKEN="<your-google-refresh-token>" \
  GMAIL_SENDER_EMAIL="animationthenationalcollege@gmail.com"
```

---

## Step 6: Deploy the Edge Function & Database Migration

1. **Deploy Edge Function**:
   ```bash
   supabase functions deploy send-crm-email
   ```
2. **Apply Database Migration**:
   Run the migration file `supabase/migrations/20261112000000_crm_emails_and_gmail_log.sql` in the Supabase SQL Editor to create the `crm_emails` history and audit log table.

---

## Step 7: Verification in CRM Email Centre

1. Open the Supernova 3.0 Admin Portal at `/admin/crm-emails`.
2. Click **"Test Gmail Connection"** to verify that Google OAuth token exchange and Gmail profile check succeed.
3. Use the Compose tab to dispatch a test email to an approved recipient.
4. Confirm delivery, verified sender (`animationthenationalcollege@gmail.com`), and view the message ID in the Email History table.
