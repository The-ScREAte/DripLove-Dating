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
