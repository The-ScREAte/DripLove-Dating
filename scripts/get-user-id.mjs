/**
 * Helper to get a Supabase user ID by email/phone
 *
 * Usage:
 *   node scripts/get-user-id.mjs email@example.com
 *   node scripts/get-user-id.mjs +233XXXXXXXXX
 */

import fs from 'node:fs';
import path from 'node:path';

function readSupabaseConfig() {
  try {
    const repoRoot = process.cwd();
    const clientPath = path.join(repoRoot, 'src', 'integrations', 'supabase', 'client.ts');
    const content = fs.readFileSync(clientPath, 'utf8');

    const urlMatch = content.match(/export\s+const\s+SUPABASE_URL\s*=\s*'([^']+)'/);
    const keyMatch = content.match(/const\s+SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/);

    return {
      url: urlMatch?.[1],
      anonKey: keyMatch?.[1],
    };
  } catch (err) {
    console.error('Could not read Supabase config:', err.message);
    process.exit(1);
  }
}

const emailOrPhone = process.argv[2];
if (!emailOrPhone) {
  console.error('Usage: node scripts/get-user-id.mjs <email_or_phone>');
  console.error('Example: node scripts/get-user-id.mjs dean@example.com');
  process.exit(1);
}

const { url, anonKey } = readSupabaseConfig();

if (!url || !anonKey) {
  console.error('Missing Supabase URL or anon key in client.ts');
  process.exit(1);
}

// Search profiles table by email or phone
const isPhone = emailOrPhone.startsWith('+');
const filter = isPhone ? `phone_number=eq.${encodeURIComponent(emailOrPhone)}` : `email=eq.${encodeURIComponent(emailOrPhone)}`;

const endpoint = `${url}/rest/v1/profiles?${filter}&select=id,email,phone_number,full_name`;

console.log(`Searching for user: ${emailOrPhone}`);

const res = await fetch(endpoint, {
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  },
});

if (!res.ok) {
  console.error('Request failed:', res.status, await res.text());
  process.exit(1);
}

const users = await res.json();

if (!users || users.length === 0) {
  console.log('❌ No user found with that email/phone.');
  process.exit(0);
}

console.log(`✅ Found ${users.length} user(s):\n`);
users.forEach((u) => {
  console.log(`  ID: ${u.id}`);
  console.log(`  Name: ${u.full_name || '(no name)'}`);
  console.log(`  Email: ${u.email || '(none)'}`);
  console.log(`  Phone: ${u.phone_number || '(none)'}`);
  console.log('');
});

console.log(`Copy this USER_ID for testing:\n${users[0].id}`);
