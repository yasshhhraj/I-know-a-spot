# Pilot authentication — user-run Supabase setup

The sign-in UI and `/me` API are implemented and locally tested. **This guide is
not a receipt of changes to your project.** The assistant has not applied SQL,
created accounts, inspected private env files, or tested live sign-in/RLS.

No PostgreSQL URI or service-role key is required for application `/me` access.
Use the new publishable key (`sb_publishable_...`) in the appropriate local env files.

## 1. Apply the schema migrations once

In **your Supabase project → SQL Editor**, inspect and run the full contents of:

`backend/supabase/migrations/202610070001_pilot_members_connections.sql`

Run as the project operator, not a browser/pilot account. The migration creates:
- `public.pilot_members` with enrollment false by default and radius 5 km (1–25).
- `public.connections` with unique, ordered, mutual member pairs.
- RLS and narrow privileges: own-profile reads, own enrolled radius-only updates,
  own enrolled connection reads; no client enrollment or connection creation.

After the first migration exists remotely, run:

`backend/supabase/migrations/202610080006_auth_pilot_member_trigger.sql`

Run this as the project operator. It installs an `auth.users` insert trigger that
creates one enrolled `pilot_members` row for each newly created Auth user. The row
uses the provider name when available and keeps email in Supabase Auth rather than
duplicating it in the application table. Existing Auth users are not backfilled by
this trigger; enroll any existing test users deliberately or create a new test user.

It contains `CREATE TABLE` statements, so do not repeatedly run it or delete an
existing table to resolve a conflict. If those tables already exist, stop and
compare schema/migration history before proceeding. SQL files being present in
the repository does not mean the schema or policies exist remotely.

## 2. Configure Google and keep the existing password login

In **Authentication → Providers → Google**, enable Google and paste the Google
OAuth client ID and client secret from Google Cloud. These credentials belong in
the Supabase dashboard, not in repository files or `VITE_` environment variables.

In Google Cloud, add this authorized redirect URI exactly:

`https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

In **Authentication → URL Configuration**, set the canonical Site URL and add every
development/deployment origin that will be used as an Additional Redirect URL, for
example:

`http://localhost:5173`

`https://YOUR_FRONTEND_NGROK_DOMAIN`

The frontend requests the current browser origin as its OAuth return URL, so the
origin must be allowlisted before using it. It keeps the existing email/password
form as a second path.

In Auth settings:
- Enable email/password sign-in.
- Enable Google sign-in.
- Do not enable providers or password signup flows that are not part of this scope.

Google creates the Supabase Auth user and the trigger creates the corresponding
enrolled application row. Keep passwords, OAuth secrets and real account identifiers
out of source, screenshots, chat and shared documentation.

## 3. Handle existing accounts and verify first login

Existing email/password accounts that already have `pilot_members` rows are unchanged.
If an existing Auth user has no application row, create one deliberately in the
project SQL Editor:

```sql
insert into public.pilot_members (user_id, display_name, enrolled)
values ('REPLACE_WITH_AUTH_USER_UUID'::uuid, 'Pilot member', true);
```

The trigger does not modify existing rows, and it never exposes an insert/update path
to browser clients. An authenticated account without a row (or with enrolled=false)
is still denied. Members cannot change enrollment or their fixed display name.

To test the new path, use a disposable Google account that has not previously been
created in the project. Complete Google sign-in once, then confirm exactly one
`pilot_members` row exists and `/me` returns the user's own profile. Repeating login
must not create a duplicate row.

## 4. Configure consented connections when ready

Connections are not needed just to test sign-in. After enrolling two consenting
participants, the operator can add one mutual relationship:

```sql
insert into public.connections (member_a, member_b)
values (
  least('REPLACE_WITH_FIRST_UUID'::uuid, 'REPLACE_WITH_SECOND_UUID'::uuid),
  greatest('REPLACE_WITH_FIRST_UUID'::uuid, 'REPLACE_WITH_SECOND_UUID'::uuid)
);
```

Each pair exists once; self-pairs/reversed duplicates are rejected. There is no
connection-management UI/API yet and this slice does not expose a connection list.

## 5. Confirm local configuration and run

Frontend `frontend/.env.local`:

```dotenv
VITE_API_BASE_URL=http://localhost:3001
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SB_PUBLISHABLE_KEY
```

Backend `backend/.env`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_SB_PUBLISHABLE_KEY
```

Use actual values privately, not the placeholders above. Both URLs/keys must refer
to the same project. New-format publishable keys are required by this slice;
secret/service-role keys are rejected as the publishable configuration.
The existing `SUPABASE_SERVICE_ROLE_KEY` entry is not read by `/me`. The later
sharing slice does require a backend-only admin credential; see
[SPOT_SHARING_SETUP.md](SPOT_SHARING_SETUP.md). Never copy it to the frontend.
VITE_ values are public bundled values—a
runtime validation guard cannot protect a secret already placed there.

Restart dev servers in separate terminals (from each app directory):

```sh
npm run dev
```

Open **http://localhost:5173**. Choose **Continue with Google** or use an existing
email/password account. Expect “Welcome, <name>,” verified membership, and a
read-only saved radius.
The auth-only slice originally stopped here. The sharing workspace now also loads
for enrolled accounts, but its separate spots/Storage migration and backend admin
configuration are required; follow SPOT_SHARING_SETUP.md before testing it.

## 6. Live acceptance checklist

- New Google account: OAuth returns to the app, the trigger creates one member row,
  sign-in succeeds, and `/me` is 200 with only that user's profile.
- Existing password account: the current email/password login still works.
- Reload: session restores, but UI verifies `/me` before showing profile.
- Existing unenrolled account: sign-in succeeds at the provider, `/me` 403, and no
  profile is exposed.
- Signed-out request: `/me` 401; sign-out immediately hides prior profile.
- Switch accounts: late requests cannot restore the previous account's profile.
- Stop backend: retryable outage shown, not incorrect-password/enrollment denial;
  restart and retry restores access.
- Invalid/expired token: `/me` 401 and reauthentication state.
- No provider keys, passwords, tokens, raw upstream errors, or other users' profiles
  in logs or API responses. Do not share network screenshots containing tokens.

No fabricated account/token is adequate proof of live Supabase integration.

## 7. Database boundary checks

For database operators comfortable with psql, the rollback-only test script is:

`backend/supabase/check_pilot_boundaries.sql`

It needs three distinct **disposable existing Auth accounts without member rows**.
Run from `backend/` through a privately configured operator connection:

```sh
psql -X -v ON_ERROR_STOP=1 \
  -v member_a=REPLACE_WITH_DISPOSABLE_UUID_A \
  -v member_b=REPLACE_WITH_DISPOSABLE_UUID_B \
  -v outsider=REPLACE_WITH_DISPOSABLE_UUID_C \
  -f supabase/check_pilot_boundaries.sql
```

Connection credentials belong in your private psql setup, not this command, repo,
or chat. This script uses psql variable syntax; do not paste it unmodified into
SQL Editor. Its fixtures/mutations are rolled back on success; with ON_ERROR_STOP,
a failing psql session closes and rolls back the open transaction.

This checks grants/constraints and simulated role/claim RLS, not user-token delivery.
Also test actual user-scoped Data API requests: no other profile rows; no enrollment
or name changes; no member inserts/deletes; no connection writes; only own enrolled
radius updates in range. Remote database and real-token tests are still pending.

## If it does not work

| Symptom | Check privately |
| --- | --- |
| Configuration needed | Frontend public env names, supported key format, API URL, dev-server restart |
| Invalid credentials | Account exists in correct project, password, email confirmation, provider enabled |
| Not enrolled | Matching auth UUID has an enrolled pilot_members row |
| Access temporarily unavailable | Backend running, correct project/key, migration applied, grants/RLS, network |

Share only the safe screen/error code if troubleshooting—never passwords, tokens,
private keys, or full connection strings.
