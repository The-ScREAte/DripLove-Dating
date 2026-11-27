# Migrations waiting for review

These SQL files are **NOT applied** to the live database and are deliberately kept out of
`supabase/migrations/` so a Supabase GitHub integration / `supabase db push` cannot apply them by accident.

- `20261126130000_payment_hardening_for_review.sql` - payment hardening (unique payment reference index, revoke
  `handle_payment_failure` from logged-in users, cron recipe). Deploy the payment edge functions together with it.
- `20261127000000_icebreakers_for_review.sql` - "Break the ice" (table, RPCs, RLS, push trigger, and a replacement of
  `notify_like_received` with the same body plus a guard). Until it is applied the feature hides itself, or run the app
  with `?icebreakerPreview=1` to preview the popup with mocked data.

To apply one after review: move it into `supabase/migrations/` (keep the timestamp order) and run it, then check the
verification SQL in the comments at the bottom of the file.

## Undo + server-side swipe limit (added 2026-11-26)
- `20261128000000_free_undo_limit_2_for_review.sql` - free undo limit 1 -> 2 per day in `update_user_usage`. The app already shows 2; until this is applied the server refuses the 2nd undo.
- `20261128010000_server_side_swipe_limits_for_review.sql` - `discover_swipe` (limit + like/pass + usage in one transaction) and `undo_pass` (2/day free, gives the swipe back). The app calls them when they exist and falls back to the old calls when they don't. Apply the undo-limit file first.
