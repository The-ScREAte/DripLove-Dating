-- Create the like_and_usage_batched function that creates matches on mutual likes
CREATE OR REPLACE FUNCTION like_and_usage_batched(
  liker_id_param uuid,
  liked_id_param uuid,
  premium_param boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mutual_like_exists boolean;
  v_match_exists boolean;
  v_new_match_id uuid;
BEGIN
  -- Insert the like (ignore if already exists)
  INSERT INTO likes (liker_id, liked_id, created_at)
  VALUES (liker_id_param, liked_id_param, now())
  ON CONFLICT DO NOTHING;

  -- Check if there's a mutual like
  SELECT EXISTS (
    SELECT 1 FROM likes
    WHERE liker_id = liked_id_param 
    AND liked_id = liker_id_param
  ) INTO v_mutual_like_exists;

  -- If mutual like exists, create match if it doesn't exist yet
  IF v_mutual_like_exists THEN
    -- Check if match already exists (in either direction)
    SELECT EXISTS (
      SELECT 1 FROM matches
      WHERE (user1_id = liker_id_param AND user2_id = liked_id_param)
         OR (user1_id = liked_id_param AND user2_id = liker_id_param)
    ) INTO v_match_exists;

    -- Create match if it doesn't exist
    IF NOT v_match_exists THEN
      INSERT INTO matches (user1_id, user2_id, created_at, user1_unread_count, user2_unread_count)
      VALUES (liker_id_param, liked_id_param, now(), 0, 0)
      RETURNING id INTO v_new_match_id;

      RETURN jsonb_build_object(
        'success', true,
        'match', true,
        'match_id', v_new_match_id
      );
    ELSE
      RETURN jsonb_build_object(
        'success', true,
        'match', true,
        'match_exists', true
      );
    END IF;
  END IF;

  -- No mutual like
  RETURN jsonb_build_object(
    'success', true,
    'match', false
  );
END;
$$;