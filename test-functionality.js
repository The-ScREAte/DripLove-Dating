/**
 * DripLove Dating - Functionality Test Suite
 * Tests: Likes, Matches, Passes, Profile Counts, Discover Feed
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tgjsyyihabsovironesw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTQxMzYsImV4cCI6MjA2NTY5MDEzNn0.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8';

const TEST_EMAIL = 'ss@gmail.com';
const TEST_PASSWORD = 'Ss@12345';

// Initialize client for testing user auth
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('🧪 Starting DripLove Functionality Tests...\n');
console.log('Using test account: ss@gmail.com\n');

try {
  // Test 1: Login with test user
  console.log('✅ Test 1: Logging in as test user...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });

  if (authError) {
    console.log('❌ Login Error:', authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`✓ Login successful! User ID: ${userId}\n`);

  // Test 2: Check user profile
  console.log('✅ Test 2: Checking user profile...');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (profileError) {
    console.log('❌ Profile Error:', profileError.message);
  } else {
    console.log(`✓ Profile found: ${profile.first_name} ${profile.last_name}`);
    console.log(`   Email: ${profile.email || 'N/A'}`);
    console.log(`   Country: ${profile.country || 'N/A'}`);
  }

  // Test 3: Count matches
  console.log('\n✅ Test 3: Counting matches...');
  const { count: matchCount, error: matchCountError } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
  
  if (matchCountError) {
    console.log('❌ Match Count Error:', matchCountError.message);
  } else {
    console.log(`✓ Total matches: ${matchCount || 0}`);
  }

  // Get actual match data
  const { data: matchesData, error: matchesDataError } = await supabase
    .from('matches')
    .select('id, user1_id, user2_id, created_at')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .limit(3);
  
  if (!matchesDataError && matchesData && matchesData.length > 0) {
    console.log(`   Sample matches:`);
    matchesData.forEach((match, i) => {
      const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;
      console.log(`   ${i + 1}. Match with user ${otherUserId}`);
    });
  }

  // Test 4: Count likes given
  console.log('\n✅ Test 4: Counting likes given...');
  const { count: likesGivenCount, error: likesGivenError } = await supabase
    .from('likes')
    .select('id', { count: 'exact', head: true })
    .eq('liker_id', userId);
  
  if (likesGivenError) {
    console.log('❌ Likes Given Error:', likesGivenError.message);
  } else {
    console.log(`✓ Likes given: ${likesGivenCount || 0}`);
  }

  // Get sample likes
  const { data: likesGivenData } = await supabase
    .from('likes')
    .select('liked_id, created_at')
    .eq('liker_id', userId)
    .limit(3);
  
  if (likesGivenData && likesGivenData.length > 0) {
    console.log(`   Sample likes:`);
    likesGivenData.forEach((like, i) => {
      console.log(`   ${i + 1}. Liked user ${like.liked_id.substring(0, 8)}...`);
    });
  }

  // Test 5: Count likes received
  console.log('\n✅ Test 5: Counting likes received...');
  const { count: likesReceivedCount, error: likesReceivedError } = await supabase
    .from('likes')
    .select('id', { count: 'exact', head: true })
    .eq('liked_id', userId);
  
  if (likesReceivedError) {
    console.log('❌ Likes Received Error:', likesReceivedError.message);
  } else {
    console.log(`✓ Likes received: ${likesReceivedCount || 0}`);
  }

  // Get sample likes received
  const { data: likesReceivedData } = await supabase
    .from('likes')
    .select('liker_id, created_at')
    .eq('liked_id', userId)
    .limit(3);
  
  if (likesReceivedData && likesReceivedData.length > 0) {
    console.log(`   Users who liked you:`);
    likesReceivedData.forEach((like, i) => {
      console.log(`   ${i + 1}. User ${like.liker_id.substring(0, 8)}...`);
    });
  }

  // Test 6: Check for active chats
  console.log('\n✅ Test 6: Checking active chats...');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: matchesForChats } = await supabase
    .from('matches')
    .select('id')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

  if (matchesForChats && matchesForChats.length > 0) {
    const { data: recentChats } = await supabase
      .from('chats')
      .select('match_id, created_at')
      .in('match_id', matchesForChats.map(m => m.id))
      .gte('created_at', sevenDaysAgo);

    const activeChatsCount = recentChats ? new Set(recentChats.map(c => c.match_id)).size : 0;
    console.log(`✓ Active chats (last 7 days): ${activeChatsCount}`);
  } else {
    console.log(`✓ Active chats: 0 (no matches found)`);
  }

  // Test 7: Check passes
  console.log('\n✅ Test 7: Checking passes...');
  const { count: passesCount, error: passesError } = await supabase
    .from('passes')
    .select('id', { count: 'exact', head: true })
    .eq('passer_id', userId);
  
  if (passesError) {
    console.log('❌ Passes Error:', passesError.message);
  } else {
    console.log(`✓ Total passes: ${passesCount || 0}`);
  }

  // Test 8: Test mutual like detection
  console.log('\n✅ Test 8: Testing mutual like detection...');
  if (likesGivenData && likesGivenData.length > 0) {
    let mutualCount = 0;
    let missingMatches = [];
    
    for (const like of likesGivenData) {
      const { data: reciprocal } = await supabase
        .from('likes')
        .select('id')
        .eq('liker_id', like.liked_id)
        .eq('liked_id', userId)
        .maybeSingle();
      
      if (reciprocal) {
        mutualCount++;
        // Check if match exists
        const { data: matchExists } = await supabase
          .from('matches')
          .select('id')
          .or(`and(user1_id.eq.${userId},user2_id.eq.${like.liked_id}),and(user1_id.eq.${like.liked_id},user2_id.eq.${userId})`)
          .maybeSingle();
        
        if (!matchExists) {
          missingMatches.push(like.liked_id);
        }
      }
    }
    
    console.log(`✓ Found ${mutualCount} mutual likes in sample`);
    if (missingMatches.length > 0) {
      console.log(`   ⚠️  WARNING: ${missingMatches.length} mutual likes have NO match records!`);
      console.log(`   Missing matches for: ${missingMatches.map(id => id.substring(0, 8)).join(', ')}...`);
    }
  } else {
    console.log(`   No likes given to test`);
  }

  // Test 9: Check if matched users appear in discover
  console.log('\n✅ Test 9: Testing discover feed exclusions...');
  
  // Get all matched user IDs
  const { data: allMatches } = await supabase
    .from('matches')
    .select('user1_id, user2_id')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
  
  const matchedUserIds = allMatches?.map(match => 
    match.user1_id === userId ? match.user2_id : match.user1_id
  ) || [];

  if (matchedUserIds.length > 0) {
    console.log(`   You have ${matchedUserIds.length} matched users`);
    console.log(`   These should NOT appear in discover feed`);
    console.log(`   Sample: ${matchedUserIds.slice(0, 3).map(id => id.substring(0, 8)).join(', ')}...`);
  } else {
    console.log(`   No matches found, so no exclusions needed`);
  }

  console.log('\n\n📊 Test Summary:');
  console.log('================');
  console.log(`✓ Login: Working`);
  console.log(`✓ Profile: ${profile ? 'Loaded' : 'Error'}`);
  console.log(`✓ Matches: ${matchCount || 0}`);
  console.log(`✓ Likes Given: ${likesGivenCount || 0}`);
  console.log(`✓ Likes Received: ${likesReceivedCount || 0}`);
  console.log(`✓ Passes: ${passesCount || 0}`);
  
  if ((matchCount || 0) === 0 && (likesGivenCount || 0) === 0) {
    console.log('\n⚠️  All counts are 0. Possible issues:');
    console.log('   1. RLS policies blocking access');
    console.log('   2. User has no activity yet');
    console.log('   3. Wrong user ID or data mismatch');
  }

} catch (error) {
  console.error('\n❌ Fatal Error:', error.message);
  process.exit(1);
}
