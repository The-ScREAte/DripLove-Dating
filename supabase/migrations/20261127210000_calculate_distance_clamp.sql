-- acos() raises "input is out of range" when float rounding pushes the argument just past +/-1
-- (identical or antipodal points). Clamp it.
CREATE OR REPLACE FUNCTION public.calculate_distance(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
BEGIN
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
