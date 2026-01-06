import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
const envPath = join(__dirname, '../.env');
let supabaseUrl, supabaseKey;
try {
  const envContent = readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  lines.forEach(line => {
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    if (key.trim() === 'VITE_SUPABASE_URL') supabaseUrl = value;
    if (key.trim() === 'VITE_SUPABASE_ANON_KEY') supabaseKey = value;
  });
} catch (e) {
  console.error('Error reading .env:', e.message);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFallback() {
  try {
    const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'gg@gmail.com',
      password: 'Gg@12345'
    });

    const userId = authData.user.id;
    console.log('Testing fallback location matching...\n');

    // Get user
    const { data: currentUser } = await supabase
      .from('profiles')
      .select('country, country_code, city, latitude, longitude, max_distance, preference')
      .eq('id', userId)
      .single();

    console.log('User:', currentUser);

    const searchDistance = currentUser.max_distance || 50;
    
    // Get gender filter
    let allowedGenders = ['male', 'female', 'other'];
    if (currentUser.preference === 'male') allowedGenders = ['male'];
    else if (currentUser.preference === 'female') allowedGenders = ['female'];

    // Mimic the fallback query
    let query = supabase
      .from('profiles')
      .select('id, first_name, date_of_birth, country, country_code, city, latitude, longitude, gender')
      .neq('id', userId)
      .eq('account_status', 'active')
      .eq('is_admin', false)
      .eq('is_archived', false)
      .in('gender', allowedGenders);

    // If user has coordinates
    if (currentUser.latitude && currentUser.longitude) {
      query = query
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
    } else if (currentUser.country_code) {
      query = query.eq('country_code', currentUser.country_code);
    }

    query = query.limit(300);

    const { data: profiles, error } = await query;

    if (error) {
      console.error('Error:', error);
      return;
    }

    console.log(`\n✅ Found ${profiles?.length || 0} profiles from fallback query\n`);

    // Filter by distance
    const matches = [];
    for (const profile of profiles || []) {
      if (!profile.country_code || !profile.city) continue;

      let distance = 999;
      let includeProfile = false;

      if (currentUser.latitude && currentUser.longitude && profile.latitude && profile.longitude) {
        // Calculate distance
        const R = 6371; // Earth radius in km
        const lat1 = currentUser.latitude * Math.PI / 180;
        const lat2 = profile.latitude * Math.PI / 180;
        const dLat = (profile.latitude - currentUser.latitude) * Math.PI / 180;
        const dLon = (profile.longitude - currentUser.longitude) * Math.PI / 180;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                 Math.cos(lat1) * Math.cos(lat2) *
                 Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distance = R * c;

        includeProfile = distance <= searchDistance;
      } else {
        // Country/city matching
        if (profile.country_code === currentUser.country_code) {
          if (profile.city?.toLowerCase() === currentUser.city?.toLowerCase()) {
            distance = 0;
            includeProfile = true;
          } else {
            distance = 25;
            includeProfile = searchDistance >= 25;
          }
        }
      }

      if (includeProfile) {
        matches.push({
          id: profile.id,
          name: profile.first_name,
          distance: Math.round(distance * 10) / 10,
          city: profile.city,
          country: profile.country_code
        });
      }
    }

    matches.sort((a, b) => a.distance - b.distance);
    
    console.log(`📍 Profiles within ${searchDistance}km: ${matches.length}\n`);
    matches.slice(0, 10).forEach((m, i) => {
      console.log(`${i + 1}. ${m.name} - ${m.distance}km (${m.city}, ${m.country})`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

testFallback();
