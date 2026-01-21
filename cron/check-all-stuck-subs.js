const fetch = require('node-fetch');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tgjsyyihabsovironesw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkAllStuckSubscriptions() {
  console.log('🔍 Checking ALL subscription platforms for stuck subscriptions...\n');
  
  try {
    // Run the subscription checker which now includes all platforms
    const response = await fetch(`${SUPABASE_URL}/functions/v1/subscription-checker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    
    const data = await response.json();
    
    console.log('✅ Subscription checker completed:\n');
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 PLATFORM-BY-PLATFORM RESULTS');
    console.log('='.repeat(70));
    
    // Google Play
    if (data.google_sync) {
      console.log('\n🤖 GOOGLE PLAY:');
      console.log(`   Checked: ${data.google_sync.checked} subscriptions`);
      console.log(`   Activated: ${data.google_sync.activated} users`);
      console.log(`   Updated: ${data.google_sync.updated} subscriptions`);
      console.log(`   Errors: ${data.google_sync.errors}`);
      
      if (data.google_sync.activated > 0) {
        console.log(`   🎉 ${data.google_sync.activated} stuck subscription(s) FIXED!`);
      } else if (data.google_sync.checked > 0) {
        console.log('   ✅ All Google subscriptions are properly activated');
      }
    }
    
    // Apple App Store
    if (data.apple_sync) {
      console.log('\n🍎 APPLE APP STORE:');
      console.log(`   Checked: ${data.apple_sync.checked} subscriptions`);
      console.log(`   Activated: ${data.apple_sync.activated} users`);
      console.log(`   Updated: ${data.apple_sync.updated} subscriptions`);
      console.log(`   Errors: ${data.apple_sync.errors}`);
      
      if (data.apple_sync.activated > 0) {
        console.log(`   🎉 ${data.apple_sync.activated} stuck subscription(s) FIXED!`);
      } else if (data.apple_sync.checked > 0) {
        console.log('   ✅ All Apple subscriptions are properly activated');
      }
    }
    
    // Paystack
    if (data.paystack_sync) {
      console.log('\n💳 PAYSTACK:');
      console.log(`   Checked: ${data.paystack_sync.checked} subscriptions`);
      console.log(`   Activated: ${data.paystack_sync.activated} users`);
      console.log(`   Updated: ${data.paystack_sync.updated} subscriptions`);
      console.log(`   Errors: ${data.paystack_sync.errors}`);
      
      if (data.paystack_sync.activated > 0) {
        console.log(`   🎉 ${data.paystack_sync.activated} stuck subscription(s) FIXED!`);
      } else if (data.paystack_sync.checked > 0) {
        console.log('   ✅ All Paystack subscriptions are properly activated');
      }
    } else {
      console.log('\n💳 PAYSTACK: Not yet integrated');
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('📈 OVERALL SUMMARY');
    console.log('='.repeat(70));
    console.log(`Expired found: ${data.found_expired}`);
    console.log(`Processed: ${data.processed}`);
    console.log(`Expiring soon: ${data.expiring_soon}`);
    console.log(`Stuck fixed: ${data.stuck_fixed}`);
    
    const totalChecked = (data.google_sync?.checked || 0) + 
                        (data.apple_sync?.checked || 0) + 
                        (data.paystack_sync?.checked || 0);
    const totalActivated = (data.google_sync?.activated || 0) + 
                          (data.apple_sync?.activated || 0) + 
                          (data.paystack_sync?.activated || 0);
    const totalErrors = (data.google_sync?.errors || 0) + 
                       (data.apple_sync?.errors || 0) + 
                       (data.paystack_sync?.errors || 0);
    
    console.log(`\nTotal subscriptions checked: ${totalChecked}`);
    console.log(`Total activated: ${totalActivated}`);
    console.log(`Total errors: ${totalErrors}`);
    
    if (totalActivated > 0) {
      console.log(`\n🎉 SUCCESS! ${totalActivated} user(s) have been activated!`);
    } else if (totalChecked > 0) {
      console.log('\n✅ All subscriptions are properly activated across all platforms!');
    }
    
    if (totalErrors > 0) {
      console.log(`\n⚠️  Warning: ${totalErrors} error(s) occurred during sync`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAllStuckSubscriptions();
