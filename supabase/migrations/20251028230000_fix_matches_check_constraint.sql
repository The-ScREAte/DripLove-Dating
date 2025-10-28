-- Drop the old matches_check constraint if it exists
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_check;

-- Recreate the matches_check constraint to only block self-matches
ALTER TABLE matches ADD CONSTRAINT matches_check CHECK (user1_id <> user2_id);
