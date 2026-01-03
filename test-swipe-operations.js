#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tgjsyyihabsovironesw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTQxMzYsImV4cCI6MjA2NTY5MDEzNn0.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_EMAIL = 'ss@gmail.com';
const TEST_PASSWORD = 'Ss@12345';

async function runTests() {
  console.log('🧪 Testing Swipe Operations (Likes & Passes)\n');

  try {
    // 1. Login
    console.log('📝 Step 1: Logging in as test user...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (authError) {
      console.error('❌ Login failed:', authError.message);
      return;
    }

    const userId = authData.session.user.id;
    console.log('✅ Logged in! User ID:', userId);

    // 2. Get initial counts
    console.log('\n📊 Step 2: Getting initial counts...');
    const { count: initialLikes } = await supabase
      .from('likes')
      .select('id', { count: 'exact' })
      .eq('liker_id', userId);

    const { count: initialPasses } = await supabase
      .from('passes')
      .select('id', { count: 'exact' })
      .eq('passer_id', userId);

    console.log('   Likes given:', initialLikes);
    console.log('   Passes given:', initialPasses);

    // 3. Find a target user to test with (someone not yet liked or passed)
    console.log('\n🔍 Step 3: Finding a target user to test with...');

    // Fetch a small batch of candidate profile ids
    const { data: candidates, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name')
      .neq('id', userId)
      .limit(25);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
    }

    if (!candidates || candidates.length === 0) {
      console.error('❌ No candidate profiles found');
      return;
    }

    // Fetch existing likes/passes by this user against those candidates
    const candidateIds = candidates.map(p => p.id);
    const [{ data: liked }, { data: passed }] = await Promise.all([
      supabase
        .from('likes')
        .select('liked_id')
        .eq('liker_id', userId)
        .in('liked_id', candidateIds),
      supabase
        .from('passes')
        .select('passed_id')
        .eq('passer_id', userId)
        .in('passed_id', candidateIds),
    ]);

    const likedSet = new Set((liked || []).map(r => r.liked_id));
    const passedSet = new Set((passed || []).map(r => r.passed_id));

    const target = candidates.find(p => !likedSet.has(p.id) && !passedSet.has(p.id));
    if (!target) {
      console.error('❌ Could not find an un-interacted target in the sample batch. Re-run to try again.');
      return;
    }

    const targetUserId = target.id;
    const targetName = target.first_name;
    console.log(`✅ Found target user: ${targetName} (${targetUserId})`);

    // 4. Confirm target is clean (sanity)
    console.log('\n🔎 Step 4: Confirming no existing like/pass...');
    const alreadyLiked = likedSet.has(targetUserId);
    const alreadyPassed = passedSet.has(targetUserId);
    console.log('   Already liked:', alreadyLiked);
    console.log('   Already passed:', alreadyPassed);

    let testLikeId = null;
    let testPassId = null;

    // 5. TEST BOTH LIKE AND PASS OPERATIONS
    if (!alreadyLiked && !alreadyPassed) {
      // Find TWO different users - one for like, one for pass
      const target2 = candidates.find(p => 
        p.id !== targetUserId && 
        !likedSet.has(p.id) && 
        !passedSet.has(p.id)
      );

      if (target2) {
        // Test LIKE on first user
        console.log('\n❤️  Step 5a: Testing LIKE operation...');
        const { data: insertedLike, error: likeError } = await supabase
          .from('likes')
          .insert({
            liker_id: userId,
            liked_id: targetUserId,
          })
          .select()
          .single();

        if (likeError) {
          console.error('❌ Like insertion failed:', likeError);
        } else {
          testLikeId = insertedLike.id;
          console.log('✅ Like inserted successfully!');
          console.log('   Like ID:', insertedLike.id);
        }

        // Test PASS on second user
        console.log('\n👋 Step 5b: Testing PASS operation...');
        const { data: insertedPass, error: passError } = await supabase
          .from('passes')
          .insert({
            passer_id: userId,
            passed_id: target2.id,
          })
          .select()
          .single();

        if (passError) {
          console.error('❌ Pass insertion failed:', passError);
        } else {
          testPassId = insertedPass.id;
          console.log('✅ Pass inserted successfully!');
          console.log('   Pass ID:', insertedPass.id);
        }
      } else {
        console.log('\n⚠️  Could not find 2 different users for comprehensive test');
        console.log('   Will test LIKE only...');
        
        console.log('\n❤️  Step 5a: Testing LIKE operation...');
        const { data: insertedLike, error: likeError } = await supabase
          .from('likes')
          .insert({
            liker_id: userId,
            liked_id: targetUserId,
          })
          .select()
          .single();

        if (likeError) {
          console.error('❌ Like insertion failed:', likeError);
        } else {
          testLikeId = insertedLike.id;
          console.log('✅ Like inserted successfully!');
        }
      }
    } else {
      console.log('\n⏭️  Skipping operations (target already interacted)');
    }

    // 7. Verify counts increased
    console.log('\n📈 Step 6: Verifying counts increased...');
    const { count: newLikes } = await supabase
      .from('likes')
      .select('id', { count: 'exact' })
      .eq('liker_id', userId);

    const { count: newPasses } = await supabase
      .from('passes')
      .select('id', { count: 'exact' })
      .eq('passer_id', userId);

    console.log('   Likes before:', initialLikes);
    console.log('   Likes now:', newLikes);
    console.log('   Change:', newLikes - initialLikes);

    console.log('   Passes before:', initialPasses);
    console.log('   Passes now:', newPasses);
    console.log('   Change:', newPasses - initialPasses);

    // 8. Summary
    console.log('\n✅ TEST SUMMARY');
    console.log('================');
    if (testLikeId && testPassId) {
      console.log('✓ Like inserted: YES');
      console.log('  Database reflects change: ' + ((newLikes - initialLikes) > 0 ? 'YES' : 'NO'));
      console.log('✓ Pass inserted: YES');
      console.log('  Database reflects change: ' + ((newPasses - initialPasses) > 0 ? 'YES' : 'NO'));
      console.log('\n🎉 BOTH operations successful!');
    } else if (testLikeId) {
      console.log('✓ Like inserted: YES');
      console.log('  Database reflects change: ' + ((newLikes - initialLikes) > 0 ? 'YES' : 'NO'));
      console.log('⚠️  Pass not tested (only one suitable user found)');
    } else if (testPassId) {
      console.log('✓ Pass inserted: YES');
      console.log('  Database reflects change: ' + ((newPasses - initialPasses) > 0 ? 'YES' : 'NO'));
    } else {
      console.log('⚠️  No operations performed (all targets already interacted)');
      console.log('   Try running again - test will pick different users');
    }

    console.log('\n💡 NEXT STEPS:');
    console.log('1. Open app in browser');
    console.log('2. Log in with ss@gmail.com / Ss@12345');
    console.log('3. Open DevTools Console (F12)');
    console.log('4. Swipe right on 3-5 profiles');
    console.log('5. Run this test again to verify counts increased');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

runTests();
