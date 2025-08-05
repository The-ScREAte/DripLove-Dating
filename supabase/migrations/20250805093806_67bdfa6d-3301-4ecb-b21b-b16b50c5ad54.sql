-- Create a function to safely delete incomplete users
CREATE OR REPLACE FUNCTION public.cleanup_incomplete_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
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
        -- Clean up all related data first
        DELETE FROM public.reported_images WHERE reporter_id = user_record.id OR reported_user_id = user_record.id;
        DELETE FROM public.user_images WHERE user_id = user_record.id;
        DELETE FROM public.chats WHERE sender_id = user_record.id;
        DELETE FROM public.matches WHERE user1_id = user_record.id OR user2_id = user_record.id;
        DELETE FROM public.likes WHERE liker_id = user_record.id OR liked_id = user_record.id;
        DELETE FROM public.blocks WHERE blocker_id = user_record.id OR blocked_id = user_record.id;
        DELETE FROM public.user_subscriptions WHERE user_id = user_record.id;
        DELETE FROM public.user_usage WHERE user_id = user_record.id;
        DELETE FROM public.push_tokens WHERE user_id = user_record.id;
        DELETE FROM public.notifications WHERE user_id = user_record.id OR related_user_id = user_record.id;
        DELETE FROM public.passes WHERE passer_id = user_record.id OR passed_id = user_record.id;
        
        -- Finally delete the auth user
        DELETE FROM auth.users WHERE id = user_record.id;
        
        RAISE NOTICE 'Cleaned up incomplete user: %', user_record.id;
    END LOOP;
END $$;

-- Execute the cleanup
SELECT public.cleanup_incomplete_users();