-- Clean up incomplete auth users and related data
-- This will remove users who signed up but didn't complete registration

-- First, get users who don't have complete profiles
-- Delete all auth users who don't have corresponding profiles
DO $$
DECLARE
    user_record RECORD;
BEGIN
    -- Loop through all auth users who don't have profiles
    FOR user_record IN 
        SELECT u.id 
        FROM auth.users u 
        LEFT JOIN public.profiles p ON u.id = p.id 
        WHERE p.id IS NULL
    LOOP
        -- Delete from auth.users (this will cascade)
        DELETE FROM auth.users WHERE id = user_record.id;
        RAISE NOTICE 'Deleted incomplete user: %', user_record.id;
    END LOOP;
END $$;