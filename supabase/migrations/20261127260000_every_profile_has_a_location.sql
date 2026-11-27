-- Every profile must be reachable by location.
-- 117 profiles had no latitude/longitude (free-text cities that were never geocoded, countries the app's 16-country
-- capital fallback does not cover, and ~105 older sign-ups with no country at all). The search box in
-- get_random_discover_profiles drops rows without coordinates, so those people were invisible to every member using a
-- distance limit. This migration (1) adds a country centroid table, (2) backfills the existing rows (city-level where the
-- city is recognisable, otherwise the capital) with an audit log, (3) adds a trigger so a profile can never again be
-- saved with a known country but no coordinates.

-- 1) country reference (capital / main city) -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.country_centroids (
  code text PRIMARY KEY,
  name text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL
);
ALTER TABLE public.country_centroids ENABLE ROW LEVEL SECURITY;  -- read only through SECURITY DEFINER functions

INSERT INTO public.country_centroids (code, name, lat, lon) VALUES
('AF','Afghanistan',34.5553,69.2075),('AL','Albania',41.3275,19.8187),('DZ','Algeria',36.7538,3.0588),('AO','Angola',-8.8390,13.2894),
('AR','Argentina',-34.6037,-58.3816),('AM','Armenia',40.1792,44.4991),('AU','Australia',-35.2809,149.1300),('AT','Austria',48.2082,16.3738),
('AZ','Azerbaijan',40.4093,49.8671),('BH','Bahrain',26.2285,50.5860),('BD','Bangladesh',23.8103,90.4125),('BE','Belgium',50.8503,4.3517),
('BJ','Benin',6.4969,2.6289),('BW','Botswana',-24.6282,25.9231),('BR','Brazil',-15.7939,-47.8828),('BF','Burkina Faso',12.3714,-1.5197),
('BI','Burundi',-3.3614,29.3599),('KH','Cambodia',11.5564,104.9282),('CM','Cameroon',3.8480,11.5021),('CA','Canada',45.4215,-75.6972),
('CV','Cape Verde',14.9331,-23.5133),('TD','Chad',12.1348,15.0557),('CL','Chile',-33.4489,-70.6693),('CN','China',39.9042,116.4074),
('CO','Colombia',4.7110,-74.0721),('CG','Congo',-4.2634,15.2429),('CD','DR Congo',-4.4419,15.2663),('CI','Ivory Coast',5.3600,-4.0083),
('CY','Cyprus',35.1856,33.3823),('CZ','Czechia',50.0755,14.4378),('DK','Denmark',55.6761,12.5683),('DJ','Djibouti',11.5721,43.1456),
('EG','Egypt',30.0444,31.2357),('ET','Ethiopia',9.0300,38.7400),('FI','Finland',60.1699,24.9384),('FR','France',48.8566,2.3522),
('GA','Gabon',0.4162,9.4673),('GM','Gambia',13.4549,-16.5790),('DE','Germany',52.5200,13.4050),('GH','Ghana',5.6037,-0.1870),
('GR','Greece',37.9838,23.7275),('GN','Guinea',9.6412,-13.5784),('HK','Hong Kong',22.3193,114.1694),('HU','Hungary',47.4979,19.0402),
('IN','India',28.6139,77.2090),('ID','Indonesia',-6.2088,106.8456),('IE','Ireland',53.3498,-6.2603),('IL','Israel',31.7683,35.2137),
('IT','Italy',41.9028,12.4964),('JM','Jamaica',18.0179,-76.8099),('JP','Japan',35.6762,139.6503),('JO','Jordan',31.9454,35.9284),
('KE','Kenya',-1.2921,36.8219),('KW','Kuwait',29.3759,47.9774),('LB','Lebanon',33.8938,35.5018),('LR','Liberia',6.3004,-10.7969),
('LY','Libya',32.8872,13.1913),('MG','Madagascar',-18.8792,47.5079),('MW','Malawi',-13.9626,33.7741),('MY','Malaysia',3.1390,101.6869),
('ML','Mali',12.6392,-8.0029),('MR','Mauritania',18.0735,-15.9582),('MU','Mauritius',-20.1609,57.5012),('MX','Mexico',19.4326,-99.1332),
('MA','Morocco',34.0209,-6.8416),('MZ','Mozambique',-25.9692,32.5732),('NA','Namibia',-22.5609,17.0658),('NP','Nepal',27.7172,85.3240),
('NL','Netherlands',52.3676,4.9041),('NZ','New Zealand',-41.2866,174.7756),('NE','Niger',13.5116,2.1254),('NG','Nigeria',9.0765,7.3986),
('NO','Norway',59.9139,10.7522),('OM','Oman',23.5880,58.3829),('PK','Pakistan',33.6844,73.0479),('PA','Panama',8.9824,-79.5199),
('PE','Peru',-12.0464,-77.0428),('PH','Philippines',14.5995,120.9842),('PL','Poland',52.2297,21.0122),('PT','Portugal',38.7223,-9.1393),
('QA','Qatar',25.2854,51.5310),('RO','Romania',44.4268,26.1025),('RU','Russia',55.7558,37.6173),('RW','Rwanda',-1.9441,30.0619),
('SA','Saudi Arabia',24.7136,46.6753),('SN','Senegal',14.7167,-17.4677),('RS','Serbia',44.7866,20.4489),('SL','Sierra Leone',8.4657,-13.2317),
('SG','Singapore',1.3521,103.8198),('SO','Somalia',2.0469,45.3182),('ZA','South Africa',-25.7461,28.1881),('KR','South Korea',37.5665,126.9780),
('SS','South Sudan',4.8594,31.5713),('ES','Spain',40.4168,-3.7038),('LK','Sri Lanka',6.9271,79.8612),('SD','Sudan',15.5007,32.5599),
('SE','Sweden',59.3293,18.0686),('CH','Switzerland',46.9480,7.4474),('TZ','Tanzania',-6.1630,35.7516),('TH','Thailand',13.7563,100.5018),
('TG','Togo',6.1725,1.2314),('TT','Trinidad and Tobago',10.6918,-61.2225),('TN','Tunisia',36.8065,10.1815),('TR','Turkey',39.9334,32.8597),
('UG','Uganda',0.3476,32.5825),('UA','Ukraine',50.4501,30.5234),('AE','United Arab Emirates',24.4539,54.3773),('GB','United Kingdom',51.5072,-0.1276),
('US','United States',38.9072,-77.0369),('VE','Venezuela',10.4806,-66.9036),('VN','Vietnam',21.0278,105.8342),('ZM','Zambia',-15.3875,28.3228),
('ZW','Zimbabwe',-17.8252,31.0335)
ON CONFLICT (code) DO NOTHING;

-- 2) audit log so the backfill can be reviewed / reverted ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_location_backfill_log (
  id bigserial PRIMARY KEY,
  profile_id uuid NOT NULL,
  old_country text, old_country_code text, old_latitude numeric, old_longitude numeric,
  new_country text, new_country_code text, new_latitude double precision, new_longitude double precision,
  method text NOT NULL,              -- 'city' (recognised city) | 'capital' (country capital fallback)
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_location_backfill_log ENABLE ROW LEVEL SECURITY;

-- 3) backfill: recognised cities first (most specific pattern wins), country only filled when it was empty ---------------
CREATE TEMP TABLE _city_rules (prio serial, pattern text, cc text, lat double precision, lon double precision) ON COMMIT DROP;
INSERT INTO _city_rules (pattern, cc, lat, lon) VALUES
 -- United States / Nigeria / Pakistan rows that already had a country
 ('%new york%','US',40.7128,-74.0060), ('%bronx%','US',40.8448,-73.8648), ('%rexburg%','US',43.8260,-111.7897),
 ('%ohio%','US',39.9612,-82.9988), ('%tennessee%','US',36.1627,-86.7816),
 ('%ughelli%','NG',5.4883,6.0056), ('%imo state%','NG',5.4836,7.0333), ('%plateau%','NG',9.8965,8.8583),
 ('%ibadan%','NG',7.3775,3.9470), ('%lagos%','NG',6.5244,3.3792), ('%rahim yar%','PK',28.4202,70.2952),
 -- Ghana
 ('%kumasi%','GH',6.6885,-1.6244), ('%ejisu%','GH',6.7333,-1.4667), ('%obuasi%','GH',6.2000,-1.6667), ('%bekwai%','GH',6.4667,-1.5833),
 ('%takoradi%','GH',4.8845,-1.7554), ('%tarkwa%','GH',5.3000,-1.9833), ('%kibi%','GH',6.1667,-0.5500), ('%kyebi%','GH',6.1667,-0.5500),
 ('%diaso%','GH',5.9500,-1.8300), ('%shamaa%','GH',5.0000,-1.8500), ('%savannah region%','GH',9.4075,-0.8533),
 ('%tema%','GH',5.6698,-0.0166), ('%kasoa%','GH',5.5342,-0.4169), ('%nsawam%','GH',5.8083,-0.3500), ('%mankessim%','GH',5.2667,-1.0167),
 ('%esuekyir%','GH',5.2500,-1.2100),
 ('%accra%','GH',5.6037,-0.1870), ('%legon%','GH',5.6350,-0.1500), ('%spintex%','GH',5.6333,-0.0833), ('%teshie%','GH',5.5833,-0.1000),
 ('%nungua%','GH',5.6000,-0.0700), ('%dansoman%','GH',5.5333,-0.2833), ('%adenta%','GH',5.7167,-0.1667), ('%amasaman%','GH',5.7000,-0.3000),
 ('%ashaiman%','GH',5.6833,-0.0333),
 -- Netherlands
 ('%alkmaar%','NL',52.6324,4.7534), ('%amsterdam%','NL',52.3676,4.9041), ('%dronten%','NL',52.5258,5.7194), ('%groningen%','NL',53.2194,6.5665),
 ('%lochem%','NL',52.1603,6.4108),
 -- Gulf / Middle East / Turkey / Cyprus
 ('%abu dhabi%','AE',24.4539,54.3773), ('%dubai%','AE',25.2048,55.2708), ('%ajman%','AE',25.4052,55.5136), ('%ajeman%','AE',25.4052,55.5136), ('%bohicon%','BJ',7.1783,2.0667), ('%doha%','QA',25.2854,51.5310),
 ('%istanbul%','TR',41.0082,28.9784), ('%trabzon%','TR',41.0027,39.7168), ('%goynuk%','TR',40.3979,30.7869), ('%famagusta%','CY',35.1149,33.9192),
 -- Central / Southern / Western Africa
 ('%douala%','CM',4.0511,9.7679), ('%mutengene%','CM',4.0933,9.3067), ('%cameroon%','CM',3.8480,11.5021),
 ('%brazzaville%','CG',-4.2634,15.2429), ('%bulawayo%','ZW',-20.1325,28.6265), ('%gaborone%','BW',-24.6282,25.9231), ('%maun%','BW',-19.9833,23.4167),
 ('%kitwe%','ZM',-12.8024,28.2132), ('%lusaka%','ZM',-15.3875,28.3228), ('%lilongwe%','MW',-13.9626,33.7741), ('%kolwezi%','CD',-10.7167,25.4667),
 ('%freetown%','SL',8.4657,-13.2317), ('%maputo%','MZ',-25.9692,32.5732), ('%kakata%','LR',6.5333,-10.3500), ('%pertoria%','ZA',-25.7461,28.1881),
 ('%pretoria%','ZA',-25.7461,28.1881),
 -- elsewhere
 ('%mizoram%','IN',22.4833,92.9667), ('%tramandai%','BR',-30.0100,-50.1333), ('%barcellona pozzo%','IT',38.1473,15.2181), ('%warsaw%','PL',52.2297,21.0122),
 -- lowest priority: a bare country name typed as the city
 ('%ghana%','GH',5.6037,-0.1870);

WITH m AS (
  SELECT DISTINCT ON (p.id) p.id, r.cc, r.lat, r.lon
  FROM public.profiles p JOIN _city_rules r ON lower(p.city) LIKE r.pattern
  WHERE (p.latitude IS NULL OR p.longitude IS NULL)
    AND (coalesce(p.country_code, '') = '' OR upper(p.country_code) = r.cc)
  ORDER BY p.id, r.prio
), logged AS (
  INSERT INTO public.profile_location_backfill_log
    (profile_id, old_country, old_country_code, old_latitude, old_longitude, new_country, new_country_code, new_latitude, new_longitude, method)
  SELECT p.id, p.country, p.country_code, p.latitude, p.longitude,
         CASE WHEN coalesce(p.country, '') = '' THEN c.name ELSE p.country END,
         CASE WHEN coalesce(p.country_code, '') = '' THEN m.cc ELSE p.country_code END, m.lat, m.lon, 'city'
  FROM m JOIN public.profiles p ON p.id = m.id JOIN public.country_centroids c ON c.code = m.cc
  RETURNING profile_id
)
UPDATE public.profiles p
SET latitude = m.lat, longitude = m.lon,
    country_code = CASE WHEN coalesce(p.country_code, '') = '' THEN m.cc ELSE p.country_code END,
    country = CASE WHEN coalesce(p.country, '') = '' THEN c.name ELSE p.country END
FROM m JOIN public.country_centroids c ON c.code = m.cc
WHERE p.id = m.id;

-- anything still without coordinates but with a known country (code or name): the country's capital
WITH m AS (
  SELECT p.id, c.code, c.name, c.lat, c.lon
  FROM public.profiles p
  JOIN public.country_centroids c ON upper(trim(p.country_code)) = c.code OR lower(trim(p.country)) = lower(c.name)
  WHERE p.latitude IS NULL OR p.longitude IS NULL
), logged AS (
  INSERT INTO public.profile_location_backfill_log
    (profile_id, old_country, old_country_code, old_latitude, old_longitude, new_country, new_country_code, new_latitude, new_longitude, method)
  SELECT p.id, p.country, p.country_code, p.latitude, p.longitude,
         CASE WHEN coalesce(p.country, '') = '' THEN m.name ELSE p.country END,
         CASE WHEN coalesce(p.country_code, '') = '' THEN m.code ELSE p.country_code END, m.lat, m.lon, 'capital'
  FROM m JOIN public.profiles p ON p.id = m.id
  RETURNING profile_id
)
UPDATE public.profiles p
SET latitude = m.lat, longitude = m.lon,
    country_code = CASE WHEN coalesce(p.country_code, '') = '' THEN m.code ELSE p.country_code END,
    country = CASE WHEN coalesce(p.country, '') = '' THEN m.name ELSE p.country END
FROM m WHERE p.id = m.id;


-- profiles that have coordinates but no country CODE (the search filters on the code): derive it from the country name,
-- or from the city for the few with no country text at all
WITH m AS (
  SELECT p.id, c.code, c.name
  FROM public.profiles p
  JOIN public.country_centroids c ON lower(trim(p.country)) = lower(c.name)
  WHERE coalesce(p.country_code, '') = ''
  UNION
  SELECT p.id, c.code, c.name
  FROM public.profiles p
  JOIN _city_rules r ON lower(p.city) LIKE r.pattern
  JOIN public.country_centroids c ON c.code = r.cc
  WHERE coalesce(p.country_code, '') = '' AND coalesce(p.country, '') = ''
), logged AS (
  INSERT INTO public.profile_location_backfill_log
    (profile_id, old_country, old_country_code, old_latitude, old_longitude, new_country, new_country_code, new_latitude, new_longitude, method)
  SELECT p.id, p.country, p.country_code, p.latitude, p.longitude, CASE WHEN coalesce(p.country,'')='' THEN m.name ELSE p.country END, m.code, p.latitude, p.longitude, 'country_code'
  FROM m JOIN public.profiles p ON p.id = m.id
  RETURNING profile_id
)
UPDATE public.profiles p
SET country_code = m.code, country = CASE WHEN coalesce(p.country, '') = '' THEN m.name ELSE p.country END
FROM m WHERE p.id = m.id AND coalesce(p.country_code, '') = '';

-- 4) safety net: a profile with a known country can never be saved without coordinates / a country code again ---------------------------
CREATE OR REPLACE FUNCTION public.fill_missing_profile_coordinates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE c record;
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL OR coalesce(NEW.country_code, '') = '' THEN
    SELECT * INTO c FROM public.country_centroids
     WHERE code = upper(trim(coalesce(NEW.country_code, ''))) OR lower(name) = lower(trim(coalesce(NEW.country, '')))
     ORDER BY (code = upper(trim(coalesce(NEW.country_code, '')))) DESC LIMIT 1;
    IF FOUND THEN
      IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
        NEW.latitude := c.lat;
        NEW.longitude := c.lon;
      END IF;
      IF coalesce(NEW.country_code, '') = '' THEN NEW.country_code := c.code; END IF;
      IF coalesce(NEW.country, '') = '' THEN NEW.country := c.name; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fill_missing_profile_coordinates() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ab_fill_missing_profile_coordinates ON public.profiles;
CREATE TRIGGER ab_fill_missing_profile_coordinates
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fill_missing_profile_coordinates();
