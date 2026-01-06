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
    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, ''); // Remove quotes
    if (key.trim() === 'VITE_SUPABASE_URL') supabaseUrl = value;
    if (key.trim() === 'VITE_SUPABASE_ANON_KEY') supabaseKey = value;
  });
} catch (e) {
  console.error('Error reading .env file:', e.message);
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const userEmail = 'gg@gmail.com';

async function checkMatches() {
  try {
    console.log(`\n🔍 Checking for user ${userEmail}...\n`);

    // First, try to sign in with the user credentials to get proper access
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: 'Gg@12345'
    });

    if (authError) {
      console.error('❌ Authentication failed:', authError.message);
      console.log('\n💡 Make sure the email and password are correct');
      return;
    }

    console.log('✅ Authenticated successfully\n');

    // Now query with authenticated user context
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !user) {
      console.error('❌ Profile not found:', userError?.message);
      return;
    }

    console.log('👤 User Profile:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.first_name} ${user.last_name}`);
    console.log(`   Gender: ${user.gender}`);
    console.log(`   DOB: ${user.date_of_birth || 'N/A'}`);
    console.log(`   Preference field: ${user.preference || 'NULL (will default to "everyone")'}`);
    console.log(`   Looking for: ${user.preference || 'everyone (default)'}`);
    console.log(`   Age range: ${user.min_age || 18}-${user.max_age || 99}`);
    console.log(`   Max distance: ${user.max_distance || user.distance_preference || 50}km`);
    console.log(`   Location: ${user.latitude}, ${user.longitude}`);
    console.log(`   Country: ${user.country}`);

    // 2. Get all likes/passes by this user
    const { data: likes, error: likesError } = await supabase
      .from('likes')
      .select('liked_user_id')
      .eq('liker_id', user.id);

    const { data: passes, error: passesError } = await supabase
      .from('passes')
      .select('passed_user_id')
      .eq('passer_id', user.id);

    const likedIds = likes?.map(l => l.liked_user_id) || [];
    const passedIds = passes?.map(p => p.passed_user_id) || [];
    const excludedIds = [...likedIds, ...passedIds, user.id];

    console.log(`\n📊 Activity:`);
    console.log(`   Liked: ${likedIds.length} profiles`);
    console.log(`   Passed: ${passedIds.length} profiles`);
    console.log(`   Total excluded: ${excludedIds.length} profiles`);

    // Calculate user's age from date_of_birth
    const userAge = user.date_of_birth ? 
      Math.floor((Date.now() - new Date(user.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

    // 3. Build query for potential matches - mimic the app's logic
    const userPreference = user.preference || 'everyone';
    let allowedGenders = ['male', 'female', 'other']; // default to everyone
    
    if (userPreference === 'male') {
      allowedGenders = ['male'];
    } else if (userPreference === 'female') {
      allowedGenders = ['female'];
    }
    
    console.log(`\n🎯 Filtering for genders: ${allowedGenders.join(', ')}\n`);

    let query = supabase
      .from('profiles')
      .select('id, first_name, last_name, gender, date_of_birth, city, country, latitude, longitude, bio')
      .neq('id', user.id)
      .in('gender', allowedGenders);

    // Filter by age range using date_of_birth
    const minAge = user.min_age || 18;
    const maxAge = user.max_age || 99;
    const today = new Date();
    const maxBirthDate = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate()).toISOString().split('T')[0];
    const minBirthDate = new Date(today.getFullYear() - maxAge - 1, today.getMonth(), today.getDate()).toISOString().split('T')[0];
    
    query = query.lte('date_of_birth', maxBirthDate).gte('date_of_birth', minBirthDate);

    // Exclude already interacted profiles
    if (excludedIds.length > 0) {
      query = query.not('id', 'in', `(${excludedIds.map(id => `"${id}"`).join(',')})`);
    }

    const { data: potentialMatches, error: matchesError } = await query;

    if (matchesError) {
      console.error('❌ Error fetching matches:', matchesError.message);
      return;
    }

    console.log(`\n✨ Found ${potentialMatches?.length || 0} potential new matches:`);
    
    if (potentialMatches && potentialMatches.length > 0) {
      // Calculate distance and age for each match
      const matchesWithDistance = potentialMatches.map(match => {
        // Calculate age
        const age = match.date_of_birth ? 
          Math.floor((Date.now() - new Date(match.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
        
        // Calculate distance
        if (user.latitude && user.longitude && match.latitude && match.longitude) {
          const R = 6371; // Earth's radius in km
          const dLat = (match.latitude - user.latitude) * Math.PI / 180;
          const dLon = (match.longitude - user.longitude) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                   Math.cos(user.latitude * Math.PI / 180) * Math.cos(match.latitude * Math.PI / 180) *
                   Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;
          return { ...match, distance: Math.round(distance), age };
        }
        return { ...match, distance: null, age };
      });

      // Filter by distance if applicable
      const maxDistance = user.max_distance || user.distance_preference || 50;
      const withinDistance = matchesWithDistance.filter(m => 
        m.distance === null || m.distance <= maxDistance
      );

      console.log(`\n📍 Within ${maxDistance}km: ${withinDistance.length} profiles\n`);

      withinDistance.slice(0, 10).forEach((match, idx) => {
        console.log(`${idx + 1}. ${match.first_name} ${match.last_name}`);
        console.log(`   Gender: ${match.gender}, Age: ${match.age || 'N/A'}`);
        console.log(`   Location: ${match.city}, ${match.country}`);
        console.log(`   Distance: ${match.distance !== null ? match.distance + 'km' : 'Unknown'}`);
        console.log(`   Bio: ${match.bio ? match.bio.substring(0, 50) + '...' : 'None'}`);
        console.log('');
      });

      if (withinDistance.length > 10) {
        console.log(`   ... and ${withinDistance.length - 10} more profiles`);
      }

      if (withinDistance.length === 0) {
        console.log('⚠️  All potential matches are outside the distance preference');
        console.log(`   Try increasing max_distance from ${maxDistance}km`);
      }
    } else {
      console.log('\n⚠️  No new profiles found that match the criteria');
      console.log('\nPossible reasons:');
      console.log('1. User has already liked/passed all available profiles');
      console.log('2. No profiles match the gender preference');
      console.log('3. No profiles in the age range');
      console.log('4. All matching profiles are too far away');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkMatches();
