// Fix DEAN1 promo code status
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
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.VITE_SUPABASE_ANON_KEY;

console.log('Using service role key:', !!envVars.SUPABASE_SERVICE_ROLE_KEY);

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixPromoCodeStatus() {
  console.log('\n=== Updating DEAN1 status to active ===\n');
  
  const { data, error } = await supabase
    .from('promo_codes')
    .update({ status: 'active' })
    .eq('code', 'DEAN1')
    .select();
  
  if (error) {
    console.error('Error updating status:', error);
  } else {
    console.log('✓ Successfully updated DEAN1 status to active');
    console.log('Updated record:', data[0]);
  }

  // Verify the change
  console.log('\n=== Verifying update ===\n');
  const { data: verified, error: verifyError } = await supabase
    .rpc('validate_promo_code', { code_input: 'DEAN1' });
  
  if (verifyError) {
    console.error('Verification error:', verifyError);
  } else {
    console.log('Validation result:', verified);
  }

  console.log('\n=== Complete ===\n');
}

fixPromoCodeStatus().catch(console.error);
