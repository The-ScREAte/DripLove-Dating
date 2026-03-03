-- Enable realtime for likes table (needed for instant like-back injection)
ALTER TABLE public.likes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.likes;;
