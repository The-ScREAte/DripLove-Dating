const fetch = require('node-fetch');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tgjsyyihabsovironesw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getDiagnostics() {
  console.log('🔍 SUBSCRIPTION DIAGNOSTIC REPORT\n');
  console.log('=' .repeat(80));
  
  try {
    // Run subscription checker to get current counts
    const response = await fetch(`${SUPABASE_URL}/functions/v1/subscription-checker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    
    const data = await response.json();
    
    console.log('\n📊 CURRENT SYSTEM STATUS');
    console.log('=' .repeat(80));
    
    const googleChecked = data.google_sync?.checked || 0;
    const appleChecked = data.apple_sync?.checked || 0;
    const paystackChecked = data.paystack_sync?.checked || 0;
    const total = googleChecked + appleChecked + paystackChecked;
    
    console.log(`\nTotal subscription records: ${total}`);
    console.log(`  - Google Play: ${googleChecked}`);
    console.log(`  - Apple: ${appleChecked}`);
    console.log(`  - Paystack: ${paystackChecked}`);
    
    console.log(`\nExpiring soon (within 24h): ${data.expiring_soon}`);
    console.log(`Stuck subscriptions found: ${data.stuck_fixed}`);
    
    console.log('\n' + '=' .repeat(80));
    console.log('🔍 THE MYSTERY: 86 vs 79');
    console.log('=' .repeat(80));
    
    console.log(`\nSubscription-checker reports: ${total} subscriptions`);
    console.log(`Your UI shows: 79 premium users`);
    console.log(`Difference: ${total - 79} users`);
    
    console.log('\n💡 POSSIBLE EXPLANATIONS:');
    console.log('\n1. ✅ CANCELLED BUT NOT EXPIRED (This is correct!)');
    console.log('   - These users unsubscribed but their expiry date hasn\'t passed yet');
    console.log('   - They SHOULD still have premium access until expiry');
    console.log('   - Status: "cancelled", Plan: "premium", Expires: future date');
    console.log('   - If UI logic includes cancelled users, they count. If not, they don\'t.');
    
    console.log('\n2. ❌ CANCELLED AND EXPIRED (This needs fixing!)');
    console.log('   - These users unsubscribed AND their expiry date has passed');
    console.log('   - They should be: Status: "expired", Plan: "free"');
    console.log('   - But they might still have: Status: "cancelled", Plan: "premium"');
    console.log('   - The hourly expiry function doesn\'t process status="cancelled"');
    
    console.log('\n3. 📊 PAYMENT_FAILED');
    console.log('   - Users whose renewal failed after 3 attempts');
    console.log('   - Should not count as premium');
    
    console.log('\n' + '=' .repeat(80));
    console.log('🛠️  THE FIX NEEDED');
    console.log('=' .repeat(80));
    
    console.log('\nThe issue is in handle_subscription_expiry SQL function:');
    console.log('\n❌ CURRENT CODE (incomplete):');
    console.log('   UPDATE user_subscriptions');
    console.log('   SET status=\'expired\', plan_name=\'free\'');
    console.log('   WHERE status=\'active\' AND expires_at <= NOW() AND auto_renew=false');
    console.log('   → Only processes status=\'active\', ignores status=\'cancelled\'!');
    
    console.log('\n✅ SHOULD BE:');
    console.log('   UPDATE user_subscriptions');
    console.log('   SET status=\'expired\', plan_name=\'free\'');
    console.log('   WHERE status IN (\'active\', \'cancelled\') -- Added cancelled!');
    console.log('         AND expires_at <= NOW()');
    console.log('         AND auto_renew=false');
    
    console.log('\n' + '=' .repeat(80));
    console.log('📋 NEXT STEPS');
    console.log('=' .repeat(80));
    
    console.log('\n1. Check where you\'re seeing "79" - does it include cancelled users?');
    console.log('2. Fix handle_subscription_expiry to process cancelled subscriptions');
    console.log('3. Update subscription-checker to catch cancelled+expired');
    console.log('4. Run the checker to clean up existing cancelled+expired records');
    
    console.log('\n✨ This will ensure:');
    console.log('   - Cancelled users keep premium until expiry ✅');
    console.log('   - Once expiry passes, they lose premium automatically ✅');
    console.log('   - No manual intervention needed ✅\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

getDiagnostics();
