// Service-role key passed directly for full DB access (bypasses RLS)
const url = 'https://tgjsyyihabsovironesw.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDExNDEzNiwiZXhwIjoyMDY1NjkwMTM2fQ.Ikooal_ke3rcoo5q4_iA25UwzclH4GR9WKq0GOesyaI';

const search = (process.argv[2] || 'manualla kay').trim();
const [tokenA = '', tokenB = ''] = search.toLowerCase().split(/\s+/);

async function rest(pathAndQuery, extraHeaders = {}) {
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
      ...extraHeaders,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return res.json();
}

async function fetchAllProfiles(columns) {
  const all = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const rows = await rest(
      `profiles?select=${encodeURIComponent(columns.join(','))}&order=id.asc`,
      { Range: `${from}-${to}` }
    );

    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return NaN;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return NaN;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getAllowedGenders(preference) {
  const p = norm(preference);
  if (p === 'men') return ['male'];
  if (p === 'women') return ['female'];
  return ['male', 'female', 'non-binary'];
}

(async () => {
  try {
    const profileCols = [
      'id','first_name','last_name','email','gender','preference','country','country_code',
      'min_age','max_age','max_distance','distance_preference','latitude','longitude',
      'account_status','is_admin','is_archived','date_of_birth'
    ];

    const candidates = await fetchAllProfiles(profileCols);

    const tokens = search
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const targetCandidates = candidates.filter((p) => {
      const first = norm(p.first_name);
      const last = norm(p.last_name);
      const full = `${first} ${last}`.trim();
      const text = `${first} ${last} ${full}`;
      if (tokens.length > 1) {
        return tokens.every((token) => text.includes(token));
      }
      return text.includes(tokens[0] || 'manualla');
    });

    if (targetCandidates.length === 0) {
      console.log('No profile found matching:', search);
      const near = candidates
        .filter((p) => {
          const text = `${norm(p.first_name)} ${norm(p.last_name)}`;
          return text.includes('man') || text.includes('kay');
        })
        .slice(0, 30)
        .map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, email: p.email }));
      console.log('Near matches (man/kay):', JSON.stringify(near, null, 2));
      return;
    }

    const user = targetCandidates[0];
    const allowedGenders = getAllowedGenders(user.preference);
    const minAge = Number.isFinite(Number(user.min_age)) ? Number(user.min_age) : 18;
    const maxAge = Number.isFinite(Number(user.max_age)) ? Number(user.max_age) : 99;
    const maxDistance = Number.isFinite(Number(user.max_distance ?? user.distance_preference))
      ? Number(user.max_distance ?? user.distance_preference)
      : 50;

    const userCountry = norm(user.country_code || user.country);

    // NOTE: This uses anon key, so likes/matches/passes/blocks may be restricted by RLS.
    // We still report strict profile eligibility based on Discover public filters.
    const eligible = candidates
      .filter((p) => p.id !== user.id)
      .filter((p) => p.account_status === 'active' && p.is_admin === false && p.is_archived === false)
      .filter((p) => allowedGenders.includes(norm(p.gender)))
      .filter((p) => norm(p.country_code || p.country) === userCountry)
      .filter((p) => {
        const age = calculateAge(p.date_of_birth);
        return Number.isFinite(age) && age >= minAge && age <= maxAge;
      })
      .filter((p) => {
        if (!user.latitude || !user.longitude || !p.latitude || !p.longitude) return true;
        const d = calculateDistanceKm(Number(user.latitude), Number(user.longitude), Number(p.latitude), Number(p.longitude));
        return d <= Math.min(maxDistance, 500);
      });

    console.log(JSON.stringify({
      targetUser: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        preference: user.preference,
        min_age: user.min_age,
        max_age: user.max_age,
        max_distance: user.max_distance,
        distance_preference: user.distance_preference,
        country: user.country,
        country_code: user.country_code,
        latitude: user.latitude,
        longitude: user.longitude,
      },
      matchesByName: targetCandidates.map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, email: p.email })),
      eligibleCountByPublicFilters: eligible.length,
      sampleEligible: eligible.slice(0, 20).map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, gender: p.gender, country_code: p.country_code, country: p.country })),
      notes: [
        'This check uses anon key and public profile filters only.',
        'Final Discover eligibility can be lower due to likes/matches/passes/blocks exclusions and local swipe cache.'
      ]
    }, null, 2));
  } catch (error) {
    console.error('Eligibility debug failed:', error.message || error);
    process.exit(1);
  }
})();
