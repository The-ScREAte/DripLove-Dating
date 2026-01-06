import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables manually
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
  console.error('Error reading .env file:', e.message);
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLocationService() {
  try {
    // Sign in
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'gg@gmail.com',
      password: 'Gg@12345'
    });

    if (authError) {
      console.error('❌ Auth failed:', authError.message);
      return;
    }

    console.log('✅ Authenticated\n');

    // Get user data
    const { data: user } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    console.log('👤 User Location:');
    console.log(`   Latitude: ${user.latitude}`);
    console.log(`   Longitude: ${user.longitude}`);
    console.log(`   Country: ${user.country}`);
    console.log(`   Country Code: ${user.country_code}`);
    console.log(`   Max Distance: ${user.max_distance || user.distance_preference || 50}km\n`);

    // Test the location service query
    console.log('🔍 Testing location service query...\n');
    
    const maxDistance = user.max_distance || user.distance_preference || 50;
    
    // This mimics what locationService.getLocationBasedMatches does
    const { data: locationMatches, error: locError } = await supabase
      .rpc('get_profiles_within_distance', {
        user_lat: user.latitude,
        user_lon: user.longitude,
        max_distance_km: maxDistance
      });

    if (locError) {
      console.error('❌ Location service error:', locError.message);
      console.log('\nThis might be why no profiles are showing!');
      console.log('The function get_profiles_within_distance may not exist or is failing.\n');
      
      // Try fallback: manual distance calculation
      console.log('Trying manual fallback query...\n');
      
      const radiusInDegrees = maxDistance / 111.32;
      
      const { data: fallbackProfiles, error: fallbackError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, gender, country_code, latitude, longitude')
        .eq('country_code', user.country_code || 'US')
        .neq('id', user.id)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .eq('is_archived', false)
        .in('gender', ['male'])
        .gte('latitude', user.latitude - radiusInDegrees)
        .lte('latitude', user.latitude + radiusInDegrees)
        .gte('longitude', user.longitude - radiusInDegrees)
        .lte('longitude', user.longitude + radiusInDegrees)
        .limit(20);

      if (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError.message);
      } else {
        console.log(`✅ Fallback found ${fallbackProfiles?.length || 0} profiles\n`);
        fallbackProfiles?.slice(0, 5).forEach((p, i) => {
          console.log(`${i + 1}. ${p.first_name} ${p.last_name}`);
          console.log(`   Gender: ${p.gender}, Country: ${p.country_code}`);
          console.log(`   Location: ${p.latitude}, ${p.longitude}\n`);
        });
      }
      
    } else {
      console.log(`✅ Location service returned ${locationMatches?.length || 0} profiles\n`);
      
      if (locationMatches && locationMatches.length > 0) {
        console.log('Sample profiles:');
        locationMatches.slice(0, 5).forEach((m, i) => {
          console.log(`${i + 1}. Profile ID: ${m.profile_id}`);
          console.log(`   Distance: ${m.distance_km}km`);
          console.log(`   Country: ${m.country_code}\n`);
        });
      } else {
        console.log('⚠️  Location service returned 0 profiles even though it worked.');
        console.log('This might mean:');
        console.log('1. No profiles have valid latitude/longitude');
        console.log('2. All profiles are outside the distance range');
        console.log('3. The function filters too aggressively\n');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testLocationService();
