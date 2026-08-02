-- Account deletion (delete_user_and_data) was failing with a foreign-key
-- violation for any admin user who had ever moderated a photo, sent a
-- broadcast, created a promo code, created a redirect, processed a payout,
-- or reported an image - because these FKs used the default NO ACTION
-- instead of the SET NULL / CASCADE pattern already used for every other
-- profile/user reference in this schema (e.g. broadcast_campaigns.admin_id,
-- reported_chats.admin_id, likes/matches/blocks all CASCADE).
ALTER TABLE public.user_images
  DROP CONSTRAINT fk_moderated_by,
  ADD CONSTRAINT fk_moderated_by FOREIGN KEY (moderated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.email_broadcast_history
  DROP CONSTRAINT email_broadcast_history_admin_id_fkey,
  ADD CONSTRAINT email_broadcast_history_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.promo_codes
  DROP CONSTRAINT promo_codes_created_by_fkey,
  ADD CONSTRAINT promo_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.redirects
  DROP CONSTRAINT redirects_created_by_fkey,
  ADD CONSTRAINT redirects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.payout_requests
  DROP CONSTRAINT payout_requests_processed_by_fkey,
  ADD CONSTRAINT payout_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- reported_images.reporter_id is NOT NULL, so SET NULL isn't valid here -
-- cascade the report row itself instead (same treatment as likes/matches/blocks).
ALTER TABLE public.reported_images
  DROP CONSTRAINT reported_images_reporter_id_fkey,
  ADD CONSTRAINT reported_images_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;
