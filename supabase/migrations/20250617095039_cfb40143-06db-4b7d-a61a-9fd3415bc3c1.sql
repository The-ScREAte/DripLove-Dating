
-- Add RLS policies for matches table to allow users to create matches
CREATE POLICY "Users can create matches when they like back" ON public.matches
  FOR INSERT WITH CHECK (
    auth.uid() = user1_id OR auth.uid() = user2_id
  );

-- Add RLS policy to allow users to view their own matches
CREATE POLICY "Users can view their own matches" ON public.matches
  FOR SELECT USING (
    auth.uid() = user1_id OR auth.uid() = user2_id
  );
;
