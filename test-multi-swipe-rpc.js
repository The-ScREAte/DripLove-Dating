#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tgjsyyihabsovironesw.supabase.co';
// Use the same anon key as the app (.env)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnanN5eWloYWJzb3Zpcm9uZXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxMTQxMzYsImV4cCI6MjA2NTY5MDEzNn0.UFy_dLD3etnw34UdqMyn97soapS1ZaAP54rZAG1laR8';

const TEST_EMAIL = 'ss@gmail.com';
const TEST_PASSWORD = 'Ss@12345';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const N = Number(process.env.N || 5);

  console.log(`🧪 Multi-swipe RPC test (N=${N})`);

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (authError) throw authError;

  const userId = authData.session.user.id;
  console.log('✅ Logged in:', userId);

  const { count: beforeLikes } = await supabase
    .from('likes')
    .select('id', { count: 'exact' })
    .eq('liker_id', userId);

  // Candidate pool
  const { data: candidates, error: candidatesErr } = await supabase
    .from('profiles')
    .select('id')
    .neq('id', userId)
    .limit(200);
  if (candidatesErr) throw candidatesErr;

  const candidateIds = (candidates || []).map(c => c.id);

  const [{ data: liked }, { data: passed }] = await Promise.all([
    supabase.from('likes').select('liked_id').eq('liker_id', userId).in('liked_id', candidateIds),
    supabase.from('passes').select('passed_id').eq('passer_id', userId).in('passed_id', candidateIds),
  ]);

  const likedSet = new Set((liked || []).map(r => r.liked_id));
  const passedSet = new Set((passed || []).map(r => r.passed_id));

  const targets = candidateIds.filter(id => !likedSet.has(id) && !passedSet.has(id)).slice(0, N);
  if (targets.length < N) {
    console.log(`⚠️ Only found ${targets.length} clean targets in pool.`);
  }

  let ok = 0;
  for (const targetId of targets) {
    const { error } = await supabase.rpc('like_and_usage_batched', {
      liker_id_param: userId,
      liked_id_param: targetId,
      premium_param: false,
    });

    if (error) {
      console.error('RPC error on target', targetId, error);
      break;
    }
    ok += 1;
  }

  const { count: afterLikes } = await supabase
    .from('likes')
    .select('id', { count: 'exact' })
    .eq('liker_id', userId);

  console.log('Likes before:', beforeLikes);
  console.log('Likes after:', afterLikes);
  console.log('Expected increase:', ok);
  console.log('Actual increase:', (afterLikes ?? 0) - (beforeLikes ?? 0));

  console.log('✅ Done');
}

main().catch((e) => {
  console.error('❌ Failed:', e);
  process.exit(1);
});
