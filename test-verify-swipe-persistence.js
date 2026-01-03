#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tgjsyyihabsovironesw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb2l2aXJvbmVzd3ciLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc1MDExNDEzNiwiZXhwIjoyMDY1NjkwMTM2fQ.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_EMAIL = 'ss@gmail.com';
const TEST_PASSWORD = 'Ss@12345';

async function verifySwipeCountIncreases() {
  console.log('📊 Verifying Swipe Count Increases Test\n');

  try {
    // 1. Login
    console.log('1️⃣  Logging in...');
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

    // 2. Get INITIAL counts
    console.log('\n2️⃣  Getting BASELINE counts...');
    const { count: initialLikes } = await supabase
      .from('likes')
      .select('id', { count: 'exact' })
      .eq('liker_id', userId);

    const { count: initialPasses } = await supabase
      .from('passes')
      .select('id', { count: 'exact' })
      .eq('passer_id', userId);

    console.log(`   📈 Likes: ${initialLikes}`);
    console.log(`   📉 Passes: ${initialPasses}`);

    console.log('\n⏸️  PAUSE: Now go swipe in the app!');
    console.log('   1. Open browser app (npm run dev)');
    console.log('   2. Swipe RIGHT on 5 profiles');
    console.log('   3. Swipe LEFT on 2 profiles');
    console.log('   4. Press ENTER here when done...\n');

    // Wait for user input
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve(undefined));
    });

    // 3. Get AFTER counts
    console.log('\n3️⃣  Getting AFTER-SWIPE counts...');
    const { count: afterLikes } = await supabase
      .from('likes')
      .select('id', { count: 'exact' })
      .eq('liker_id', userId);

    const { count: afterPasses } = await supabase
      .from('passes')
      .select('id', { count: 'exact' })
      .eq('passer_id', userId);

    console.log(`   📈 Likes: ${afterLikes}`);
    console.log(`   📉 Passes: ${afterPasses}`);

    // 4. Calculate changes
    const likesChange = (afterLikes || 0) - (initialLikes || 0);
    const passesChange = (afterPasses || 0) - (initialPasses || 0);

    console.log('\n✅ RESULTS');
    console.log('==========');
    console.log(`Likes increased by: ${likesChange} (expected ~5)`);
    console.log(`Passes increased by: ${passesChange} (expected ~2)`);

    if (likesChange >= 1 && passesChange >= 1) {
      console.log('\n🎉 SUCCESS! Swipes are persisting correctly!');
    } else if (likesChange === 0 && passesChange === 0) {
      console.log('\n❌ FAIL: No swipes persisted. The issue is still present.');
      console.log('   Check browser console for errors during swipe.');
    } else {
      console.log('\n⚠️  PARTIAL: Some swipes saved, but not all.');
      console.log('   This could mean:');
      console.log('   - You swiped on already-liked/passed profiles (now fixed with UUID quoting)');
      console.log('   - Some background tasks failed (check browser console)');
      console.log('   - Network issues during persistence');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  } finally {
    process.exit(0);
  }
}

verifySwipeCountIncreases();
