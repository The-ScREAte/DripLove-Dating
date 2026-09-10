-- Backfill missing latitude/longitude on profiles with their country's
-- capital city coordinates, so distance-based discover matching can place
-- them instead of relying on the app-side "no coordinates -> always keep"
-- fallback used today.
--
-- Only touches rows that currently have latitude IS NULL OR longitude IS
-- NULL, and only where a country can be determined (from country_code, or
-- from the free-text country column when country_code is missing) - see
-- investigation notes below for the exact counts this was written against.
--
-- As of the investigation (2026-09-10), of 4,820 total profiles, 781 were
-- missing coordinates:
--   GH Ghana          307   NG Nigeria      180   (no country at all) 105
--   US United States   82   CA Canada        28   GB United Kingdom    27
--   ZA South Africa     9   UG Uganda         5   KE Kenya              3
--   FR France           3   DE Germany        3   TZ Tanzania           2
--   AU Australia        2   SN Senegal        2   BJ Benin              1
--   NL Netherlands      1   EG Egypt          1
-- (a further ~20 rows had country_code NULL but a recognizable country
-- name instead, e.g. "(none)/Ghana": 11, "(none)/Nigeria": 6, etc.)
--
-- The ~105 rows with no country_code AND no country text are left
-- untouched - there's nothing to derive a capital from.
--
-- Safe to run more than once: it only ever updates rows still missing
-- coordinates, so a second run is a no-op.

with capitals(country_code, country_name, cap_lat, cap_lon) as (
  values
    ('GH', 'Ghana',          5.6037,   -0.1870),
    ('NG', 'Nigeria',        9.0765,    7.3986),
    ('US', 'United States', 38.9072,  -77.0369),
    ('CA', 'Canada',        45.4215,  -75.6972),
    ('GB', 'United Kingdom',51.5072,   -0.1276),
    ('ZA', 'South Africa', -25.7461,   28.1881),
    ('UG', 'Uganda',         0.3476,   32.5825),
    ('KE', 'Kenya',         -1.2921,   36.8219),
    ('FR', 'France',        48.8566,    2.3522),
    ('DE', 'Germany',       52.5200,   13.4050),
    ('TZ', 'Tanzania',      -6.1630,   35.7516),
    ('AU', 'Australia',    -35.2809,  149.1300),
    ('SN', 'Senegal',       14.7167,  -17.4677),
    ('BJ', 'Benin',          6.4969,    2.6289),
    ('NL', 'Netherlands',   52.3676,    4.9041),
    ('EG', 'Egypt',         30.0444,   31.2357)
)
update profiles p
set
  latitude = c.cap_lat,
  longitude = c.cap_lon,
  updated_at = now()
from capitals c
where (p.latitude is null or p.longitude is null)
  and (
    upper(trim(p.country_code)) = c.country_code
    or (p.country_code is null and p.country = c.country_name)
  );
