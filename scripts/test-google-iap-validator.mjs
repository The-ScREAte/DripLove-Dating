/**
 * Smoke test for Supabase Edge Function: google-iap-validator
 *
 * What this tests:
 * - Your client -> Supabase Edge Function connectivity
 * - Your Edge Function -> Google Android Publisher API connectivity
 *
 * Usage:
 *   SUPABASE_URL="https://xxxx.supabase.co" \
 *   SUPABASE_ANON_KEY="eyJ..." \
 *   USER_ID="<a real profiles.id>" \
 *   PRODUCT_ID="premium_monthly" \
 *   PURCHASE_TOKEN="<real purchase token OR fake token>" \
 *   node scripts/test-google-iap-validator.mjs
 *
 * Notes:
 * - If you use a FAKE PURCHASE_TOKEN, you should still see a JSON response.
 *   Typically it will be: { valid:false, active:false, error:'Google verification failed', ... }
 *   That still proves the function is deployed and can reach Google.
 * - For a REAL purchase token, you expect: { valid:true, active:true, ... }
 */

import fs from 'node:fs';
import path from 'node:path';

function readDefaultsFromRepo() {
  try {
    const repoRoot = process.cwd();
    const clientPath = path.join(repoRoot, 'src', 'integrations', 'supabase', 'client.ts');
    const content = fs.readFileSync(clientPath, 'utf8');

    const urlMatch = content.match(/export\s+const\s+SUPABASE_URL\s*=\s*'([^']+)'/);
    const keyMatch = content.match(/const\s+SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/);

    return {
      supabaseUrl: urlMatch?.[1],
      supabaseAnonKey: keyMatch?.[1],
    };
  } catch {
    return { supabaseUrl: undefined, supabaseAnonKey: undefined };
  }
}

const repoDefaults = readDefaultsFromRepo();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || repoDefaults.supabaseUrl;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  repoDefaults.supabaseAnonKey;

const USER_ID = process.env.USER_ID;
const PRODUCT_ID = process.env.PRODUCT_ID || 'premium_monthly';
const PURCHASE_TOKEN = process.env.PURCHASE_TOKEN;

function requireEnv(name, value) {
  if (!value || String(value).trim().length === 0) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
}

requireEnv('SUPABASE_URL (or VITE_SUPABASE_URL)', SUPABASE_URL);
requireEnv('SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)', SUPABASE_ANON_KEY);
requireEnv('USER_ID', USER_ID);
requireEnv('PURCHASE_TOKEN', PURCHASE_TOKEN);

const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/google-iap-validator`;

const body = {
  // Keep the body close to what the app sends
  user_id: USER_ID,
  productId: PRODUCT_ID,
  purchaseToken: PURCHASE_TOKEN,
  transactionId: `local_test_${Date.now()}`,
  receiptData: {
    // optional; can help debugging server-side logs
    source: 'local-node-smoke-test',
  },
};

console.log('Calling:', endpoint);
console.log('Body:', {
  user_id: USER_ID,
  productId: PRODUCT_ID,
  purchaseToken: PURCHASE_TOKEN ? `${PURCHASE_TOKEN.slice(0, 6)}…(${PURCHASE_TOKEN.length})` : null,
});

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    // Supabase Edge Functions accept either/both of these
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = null;
}

console.log('HTTP:', res.status);
if (json) {
  console.log('Response JSON:', JSON.stringify(json, null, 2));
} else {
  console.log('Response Text:', text);
}

// Exit codes for CI-style use
if (!res.ok) process.exit(2);
if (json && json.valid === true && json.active === true) {
  console.log('✅ PASS: valid=true active=true');
  process.exit(0);
}

console.log('ℹ️ Completed. If you used a fake token, expect valid=false.');
process.exit(0);
