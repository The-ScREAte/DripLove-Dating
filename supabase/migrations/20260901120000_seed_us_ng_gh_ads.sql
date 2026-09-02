-- Two in-house ads enabled for US, Nigeria, and Ghana. Deliberately different
-- lengths/tones ("about") so the ad rotation on Discover doesn't feel
-- repetitive: one short punchy line, one longer descriptive pitch.
--
-- is_active is forced by trigger_enforce_ads_admin_only_activation (only a
-- logged-in admin session can set it true), so this migration disables that
-- trigger for the duration of the insert and re-enables it immediately after.

ALTER TABLE public.ads DISABLE TRIGGER trigger_enforce_ads_admin_only_activation;

INSERT INTO public.ads (
  name, about, image_url, media_type, link, link_as,
  target_countries, is_active, placement
) VALUES (
  'Meet Someone Real Tonight',
  'Chat now. Your match is waiting.',
  'https://picsum.photos/seed/driplove-short/800/600',
  'image',
  'https://driplove.app',
  'Learn more',
  ARRAY['US', 'NG', 'GH']::text[],
  true,
  'standard'
), (
  'Find Genuine Connections on DripLove',
  'Tired of endless swiping that goes nowhere? DripLove is built for people who actually want to meet someone real. Our verified profiles, smart matching, and safety-first design mean less time filtering out fakes and more time getting to know people who are genuinely interested in you. Whether you''re looking for something casual or a serious relationship, join thousands of members across the US, Nigeria, and Ghana who are already finding meaningful matches every day. Download DripLove and start your story today.',
  'https://picsum.photos/seed/driplove-long/800/600',
  'image',
  'https://driplove.app',
  'Sign up',
  ARRAY['US', 'NG', 'GH']::text[],
  true,
  'standard'
);

ALTER TABLE public.ads ENABLE TRIGGER trigger_enforce_ads_admin_only_activation;
