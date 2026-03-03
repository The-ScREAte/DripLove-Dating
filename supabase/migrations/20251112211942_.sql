-- Drop existing foreign key constraints if they exist
ALTER TABLE public.blocks 
DROP CONSTRAINT IF EXISTS blocks_blocker_id_fkey;

ALTER TABLE public.blocks 
DROP CONSTRAINT IF EXISTS blocks_blocked_id_fkey;

-- Delete any blocks where blocker or blocked user doesn't exist in profiles
DELETE FROM public.blocks
WHERE blocker_id NOT IN (SELECT id FROM public.profiles)
   OR blocked_id NOT IN (SELECT id FROM public.profiles);

-- Add correct foreign key constraints to profiles table
ALTER TABLE public.blocks
ADD CONSTRAINT blocks_blocker_id_fkey 
FOREIGN KEY (blocker_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

ALTER TABLE public.blocks
ADD CONSTRAINT blocks_blocked_id_fkey 
FOREIGN KEY (blocked_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;;
