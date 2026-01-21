const fetch = require('node-fetch');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tgjsyyihabsovironesw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkStuckAppleSubscriptions() {
  console.log('🍎 Checking for stuck Apple subscriptions...\n');
  
  try {
    // Use the subscription-checker Edge Function which has proper access
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
    
    console.log('\n📊 Platform sync results:');
    
    if (data.google_sync) {
      console.log('\n  🤖 Google Play:');
      console.log(`    - Checked: ${data.google_sync.checked} subscriptions`);
      console.log(`    - Activated: ${data.google_sync.activated} users`);
      console.log(`    - Updated: ${data.google_sync.updated} subscriptions`);
      console.log(`    - Errors: ${data.google_sync.errors}`);
    }
    
    if (data.apple_sync) {
      console.log('\n  🍎 Apple App Store:');
      console.log(`    - Checked: ${data.apple_sync.checked} subscriptions`);
      console.log(`    - Activated: ${data.apple_sync.activated} users`);
      console.log(`    - Updated: ${data.apple_sync.updated} subscriptions`);
      console.log(`    - Errors: ${data.apple_sync.errors}`);
      
      if (data.apple_sync.checked === 0) {
        console.log('\n💡 No Apple subscriptions found in database yet.');
        console.log('   This is normal if no iOS users have subscribed yet.');
        console.log('   The system is ready and will automatically handle iOS subscriptions when they occur.');
      } else if (data.apple_sync.activated > 0) {
        console.log(`\n✨ Successfully activated ${data.apple_sync.activated} stuck Apple subscription(s)!`);
      } else if (data.apple_sync.updated > 0) {
        console.log(`\n✨ Successfully updated ${data.apple_sync.updated} Apple subscription(s)!`);
      } else {
        console.log('\n✅ All Apple subscriptions are properly activated!');
      }
    } else {
      console.log('\n  🍎 Apple App Store: Sync not yet enabled');
      console.log('     (Run: npx supabase functions deploy subscription-checker)');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log('='.repeat(60));
    console.log(`Found expired: ${data.found_expired}`);
    console.log(`Processed: ${data.processed}`);
    console.log(`Expiring soon: ${data.expiring_soon}`);
    console.log(`Stuck fixed: ${data.stuck_fixed}`);
    
    if (data.apple_sync && data.apple_sync.activated > 0) {
      console.log(`\n🎉 ${data.apple_sync.activated} Apple user(s) have been successfully activated!`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkStuckAppleSubscriptions();
