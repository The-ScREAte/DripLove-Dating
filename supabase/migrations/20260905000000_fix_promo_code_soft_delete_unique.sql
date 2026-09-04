-- Deleting an influencer (InfluencerManagement.tsx handleDelete) only soft-deletes
-- their promo_codes row (sets deleted_at), but `code` carried a plain UNIQUE
-- constraint - so recreating an influencer with the same code afterwards failed
-- with a uniqueness violation even though the old row is no longer active.
-- Replace the table-level UNIQUE with a partial unique index that only applies
-- to non-deleted rows, so a deleted code becomes reusable again.

ALTER TABLE public.promo_codes DROP CONSTRAINT IF EXISTS promo_codes_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_active_unique
  ON public.promo_codes (UPPER(code))
  WHERE deleted_at IS NULL;
