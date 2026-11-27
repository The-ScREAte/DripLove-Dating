-- 20261127210000 clamped acos() with least/greatest, but those functions ignore NULLs, so a missing coordinate turned into
-- acos(-1) = 20015 km instead of "unknown" (NULL). Restore NULL-in -> NULL-out.
CREATE OR REPLACE FUNCTION public.calculate_distance(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
BEGIN
    IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN (
        6371 * acos(
            least(1::numeric, greatest(-1::numeric,
                cos(radians(lat1)) *
                cos(radians(lat2)) *
                cos(radians(lon2) - radians(lon1)) +
                sin(radians(lat1)) *
                sin(radians(lat2))
            ))::double precision
        )
    );
END;
$function$;
