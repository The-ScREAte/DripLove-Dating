-- Add link and link_as columns to ads table
ALTER TABLE public.ads
ADD COLUMN link text,
ADD COLUMN link_as text DEFAULT 'Click here';;
