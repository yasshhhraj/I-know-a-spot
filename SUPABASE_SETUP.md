# Pilot authentication — user-run Supabase setup

The sign-in UI and `/me` API are implemented and locally tested. **This guide is
not a receipt of changes to your project.** The assistant has not applied SQL,
created accounts, inspected private env files, or tested live sign-in/RLS.

No PostgreSQL URI or service-role key is required for application `/me` access.
Use the new publishable key (`sb_publishable_...`) in the appropriate local env files.

## 1. Apply the schema migration once

In **your Supabase project → SQL Editor**, inspect and run the full contents of:

`backend/supabase/migrations/202610070001_pilot_members_connections.sql`

Run as the project operator, not a browser/pilot account. The migration creates:
- `public.pilot_members` with enrollment false by default and radius 5 km (1–25).
- `public.connections` with unique, ordered, mutual member pairs.
- RLS and narrow privileges: own-profile reads, own enrolled radius-only updates,
  own enrolled connection reads; no client enrollment or connection creation.

It contains `CREATE TABLE` statements, so do not repeatedly run it or delete an
existing table to resolve a conflict. If those tables already exist, stop and
compare schema/migration history before proceeding. SQL files being present in
the repository does not mean the schema or policies exist remotely.

## 2. Create pilot sign-in accounts

In **Authentication → Users**, use the dashboard's user-creation action to create
the accounts yourself. Choose email/password accounts and ensure their email is
confirmed for the pilot sign-in flow. Use consented test accounts first.

In Auth settings:
- Enable email/password sign-in.
- Disable new public signups for this pre-enrolled pilot. Hiding a signup button
  in our UI is not enough to disable the provider's signup endpoint.
- Configure the local site URL as `http://localhost:5173` where applicable.
  This slice has no OAuth/magic-link/password-reset callback flow.

The app has no signup button or account-creation endpoint. Keep passwords and real
account identifiers out of source, screenshots, chat, and shared documentation.

## 3. Enroll a chosen account explicitly

Copy the account's Auth user UUID from the dashboard. In your project's SQL Editor,
replace the placeholder privately and run:

```sql
insert into public.pilot_members (user_id, display_name, enrolled)
values ('REPLACE_WITH_AUTH_USER_UUID'::uuid, 'Pilot member', true);
```

Do not enroll every Auth user automatically or derive enrollment from user-editable
metadata. An authenticated account without a row (or with enrolled=false) is denied.
For an existing row, the operator may deliberately update its enrollment rather
than duplicate it. Members cannot change enrollment or their fixed display name.

To test denial, create another disposable confirmed Auth account and **do not
enroll it**. It should sign in with Supabase but receive `/me` 403 and the app's
“Not enrolled” state. Correct authentication is not automatic pilot membership.

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

Open **http://localhost:5173**. Sign in with the enrolled account. Expect:
“Welcome, Pilot member,” verified membership, and a read-only saved radius.
The auth-only slice originally stopped here. The sharing workspace now also loads
for enrolled accounts, but its separate spots/Storage migration and backend admin
configuration are required; follow SPOT_SHARING_SETUP.md before testing it.

## 6. Live acceptance checklist

- Enrolled account: sign-in succeeds, `/me` is 200 with only that user's profile.
- Reload: session restores, but UI verifies `/me` before showing profile.
- Unenrolled account: sign-in succeeds at provider, `/me` 403, no profile exposed.
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
