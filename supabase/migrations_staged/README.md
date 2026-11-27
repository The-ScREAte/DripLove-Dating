# Staged migrations (NOT auto-applied)

Files here are intentionally outside `supabase/migrations/`, so `supabase db push` / branch deploys ignore them.
Apply one only when its runbook below says so, then move it into `supabase/migrations/`
(keep the timestamp, or bump it above the newest migration).

## 20261201000000_profiles_column_privacy.sql

Problem: any signed-in user can `select *` other users' rows in `public.profiles`, including
`email`, `zip_code`, `face_descriptor`, and internal/cron columns.
Fix: table-wide SELECT is revoked from `authenticated` / `anon`; only an explicit column list is granted
(identical to `PUBLIC_PROFILE_COLUMN_LIST` in `src/utils/profileColumns.ts`; a vitest test compares the two).

What the migration adds / changes

| Object | Purpose |
|---|---|
| `get_my_profile()` | caller's own full row (client: `fetchMyProfile()` in `src/utils/myProfile.ts`) |
| `admin_get_profiles(p_ids, p_limit, p_offset, p_filters, p_newest_first)` | admin-only full rows (client: `adminGetProfiles()` in `src/utils/adminProfiles.ts`) |
| `_mask_profile`, `_profiles_caller_is_admin` | internal helpers (no EXECUTE for clients) |
| `get_random_discover_profiles`, `get_circle_category_profiles` (16-arg and 12-arg overloads) | same signature/return type; old bodies kept as `_raw_*` (filters unchanged); wrappers NULL the 27 non-public columns (email, zip_code, face_descriptor, ...) unless row is the caller's own, caller is admin, or there is no JWT user (service role) |
| column grants | `REVOKE SELECT ... FROM public, anon, authenticated; GRANT SELECT (<57 public columns>) TO authenticated` |

Not touched: INSERT/UPDATE/DELETE grants, RLS policies, service_role / postgres. Policies on ~50 other tables
that run `EXISTS (select 1 from profiles where id = auth.uid() and is_admin)` keep working because `id` and
`is_admin` stay in the public list.

### Old-app compatibility: why this cannot be applied now

Installed app versions (<= Android 1.23.53 / current iOS build) use `select('*')` on `profiles` for the
viewer's own row (MainApp), liker lists (LikedMe), the profile modal, etc. After the lockdown those queries fail
with `permission denied for table profiles` and the app cannot load the profile at all (white/"Failed to load
profile data" screen). The web build deploys instantly, so web is not an issue.

The existing update prompt (`src/components/AppUpdatePopup.tsx`, config row in `app_update_config`) is a
SOFT prompt: "Update Now" / "Maybe Later" (dismissable, once per launch). It does NOT block the app, so it cannot
by itself "force" anything. The only forcing is the breakage itself, i.e. the lockdown. Plan accordingly.

### Rollout runbook

0. Prereqs: the client refactor is in the new app version (`PUBLIC_PROFILE_COLUMNS`, `fetchMyProfile`,
   `adminGetProfiles`, `upsertOwnProfile`). The helpers fall back to the old direct queries while the RPCs do not
   exist, so the new version is safe against the CURRENT database.
1. Ship the new app: Android + iOS store releases, web deploy. Bump versions as usual.
2. Raise the soft update prompt: in `app_update_config` set `is_enabled = true`, `android_version` / `ios_version`
   to the new version, a clear `update_message` ("Update required to keep using DripLove"). Consider pushing a
   broadcast notification pointing to the store.
3. Wait for adoption. There is no per-user app-version column today. Use Play Console / App Store Connect
   version distribution (target: >= 95-98% of active users on the new build). Optional: add an `app_version`
   column to `push_tokens` in the new release to measure it exactly before applying.
4. Tell support/users a date. After the lockdown, people on old builds see a broken app until they update.
5. Pre-flight on a Supabase branch / staging copy (or the rolled-back DO-block test below):
   - `get_my_profile()` returns own row (email present)
   - `select first_name from profiles where id = <other>` works
   - `select email from profiles where id = <other>` -> permission denied
   - `select * from profiles ...` -> permission denied
   - `get_random_discover_profiles(...)` / `get_circle_category_profiles(...)` rows: email/zip/face NULL for others,
     present for own row and for admins
   - `admin_get_profiles(...)` -> `42501 admin only` for non-admin, rows with email for admin
   - service_role `select *` still works; edge functions (service role) unaffected
6. Apply: run the file (SQL editor or `apply_migration`), move it to `supabase/migrations/`. It ends with
   `notify pgrst, 'reload schema'`. The guard block at the top aborts the whole file (nothing applied) if
   `profiles` has a column that is in neither list.
7. Smoke test in the NEW app with a normal and an admin account: login, Discover, Liked Me, Circle, Chat list,
   open a profile from chat, edit profile (save), complete-profile onboarding, Admin dashboard users list,
   email export, image moderation, broadcast recipients.
8. Watch Supabase logs for `permission denied for table profiles` / `column ... permission denied` for 24 h.
   Any hit is either an old app version or a missed client query -> either add the column to the public list
   (`GRANT SELECT (col) ... TO authenticated;` + `profileColumns.ts`) or route it through the RPCs.

### Rollback (instant, safe at any time)

```sql
-- restore table-wide SELECT (old behavior)
grant select on public.profiles to authenticated, anon;

-- optional: put the unmasked RPCs back (only needed if you want to remove the wrappers)
drop function public.get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[]);
alter function public._raw_get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[]) rename to get_random_discover_profiles;
grant execute on function public.get_random_discover_profiles(text[], text[], boolean, uuid[], integer, double precision, double precision, double precision, uuid[]) to authenticated, service_role;

drop function public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean);
alter function public._raw_get_circle_category_profiles_12(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean) rename to get_circle_category_profiles;
grant execute on function public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean) to authenticated, service_role;

drop function public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean, boolean, double precision, double precision, double precision);
alter function public._raw_get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean, boolean, double precision, double precision, double precision) rename to get_circle_category_profiles;
grant execute on function public.get_circle_category_profiles(text[], text[], text, uuid[], integer, text, text[], boolean, text, boolean, boolean, boolean, boolean, double precision, double precision, double precision) to authenticated, service_role;

notify pgrst, 'reload schema';
```

The first statement alone (`grant select on public.profiles to authenticated, anon;`) is the real rollback: it
immediately makes old app versions work again. Wrappers/helpers/RPCs can stay (the new client keeps working
either way). Note a table-level GRANT does not remove the column-level grants; both coexist harmlessly.

### Maintenance notes

- New column on `profiles`: public -> `grant select (col) on public.profiles to authenticated;` + add to
  `PUBLIC_PROFILE_COLUMN_LIST`; internal -> add to `INTERNAL_PROFILE_COLUMN_LIST` and to `_mask_profile`
  (the vitest test asserts the migration list, the mask list and the TS lists agree).
- Never re-create `get_random_discover_profiles` / `get_circle_category_profiles` with `create or replace`
  in a later migration (that would overwrite the masking wrapper). Edit `_raw_*` instead.
- Client rules: no `select('*')` on `profiles` for other users; no `.insert/.update/.upsert(...).select()` that
  returns all columns; no `upsert` of non-public columns (`ON CONFLICT DO UPDATE` reads `EXCLUDED.<col>`, which
  needs SELECT) - use `upsertOwnProfile()`; no PostgREST filters (`eq/or/ilike`) on non-public columns.

### Verification already done (read-only, inside rolled-back DO blocks on project tgjsyyihabsovironesw)

Results are listed in the hand-off report; re-run the same DO-block pattern (execute the file inside
`DO $outer$ ... execute $mig$ <file> $mig$; ... raise exception 'RESULT: ...' $outer$`) after any edit.
