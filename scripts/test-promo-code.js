// Test script to check promo code in database
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env file manually
const envFile = readFileSync('.env', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    let value = valueParts.join('=').trim();
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    envVars[key.trim()] = value;
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPromoCode() {
  console.log('\n=== Testing Promo Code: DEAN1 ===\n');
  
  // First, let's see all promo codes
  console.log('1. Fetching all promo codes...');
  const { data: allCodes, error: allError } = await supabase
    .from('promo_codes')
    .select('*');
  
  if (allError) {
    console.error('Error fetching all promo codes:', allError);
  } else {
    console.log(`Found ${allCodes.length} promo codes in database:`);
    allCodes.forEach(code => {
      console.log(`  - ${code.code}: is_active=${code.is_active}, status=${code.status}, deleted_at=${code.deleted_at}`);
    });
  }

  // Now test the specific code DEAN1
  console.log('\n2. Testing DEAN1 specifically...');
  const { data: dean1, error: dean1Error } = await supabase
    .from('promo_codes')
    .select('*')
    .ilike('code', 'DEAN1')
    .single();
  
  if (dean1Error) {
    console.error('Error fetching DEAN1:', dean1Error);
  } else {
    console.log('DEAN1 details:', dean1);
  }

  // Test the RPC function
  console.log('\n3. Testing validate_promo_code RPC function...');
  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('validate_promo_code', { code_input: 'DEAN1' });
  
  if (rpcError) {
    console.error('RPC Error:', rpcError);
  } else {
    console.log('RPC Result:', rpcResult);
  }

  console.log('\n=== Test Complete ===\n');
}

testPromoCode().catch(console.error);
