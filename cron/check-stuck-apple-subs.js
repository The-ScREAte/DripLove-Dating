const fetch = require('node-fetch');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tgjsyyihabsovironesw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkStuckAppleSubscriptions() {
  console.log('🍎 Checking for stuck Apple subscriptions...\n');
  
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
  }
  
  try {
    // Step 1: Get all Apple payments
    const paymentsResponse = await fetch(`${SUPABASE_URL}/rest/v1/subscription_payments?payment_method=eq.apple&order=created_at.desc&select=*`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
      }
    });
    
    const payments = await paymentsResponse.json();
    
    // Handle error response
    if (!Array.isArray(payments)) {
      console.log('⚠️  Response:', payments);
      console.log('✅ No Apple payments found - nothing to check');
      return;
    }
    
    console.log(`📊 Found ${payments.length} Apple payment(s)\n`);
    
    if (payments.length === 0) {
      console.log('✅ No Apple payments found - nothing to check');
      return;
    }
    
    // Step 2: Check each payment's subscription status
    let stuckCount = 0;
    let activeCount = 0;
    const stuckUsers = [];
    
    for (const payment of payments) {
      console.log(`\n👤 User: ${payment.user_id}`);
      console.log(`   💰 Amount: ${payment.amount} ${payment.currency}`);
      console.log(`   📅 Payment date: ${payment.created_at}`);
      console.log(`   🔑 Transaction: ${payment.transaction_id}`);
      
      // Get user's subscription
      const subResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_subscriptions?user_id=eq.${payment.user_id}&select=*`, {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
          'Accept': 'application/json',
        }
      });
      
      const subs = await subResponse.json();
      const sub = subs[0];
      
      if (!sub) {
        console.log('   ❌ NO SUBSCRIPTION RECORD - STUCK!');
        stuckUsers.push({
          user_id: payment.user_id,
          payment_id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          transaction_id: payment.transaction_id,
          payment_date: payment.created_at,
          reason: 'No subscription record'
        });
        stuckCount++;
      } else if (sub.status !== 'active' || sub.plan_name !== 'premium') {
        console.log(`   ⚠️  Status: ${sub.status}, Plan: ${sub.plan_name} - STUCK!`);
        console.log(`   📅 Expires: ${sub.expires_at}`);
        stuckUsers.push({
          user_id: payment.user_id,
          payment_id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          transaction_id: payment.transaction_id,
          payment_date: payment.created_at,
          current_status: sub.status,
          current_plan: sub.plan_name,
          expires_at: sub.expires_at,
          reason: 'Paid but not active premium'
        });
        stuckCount++;
      } else {
        console.log(`   ✅ Active premium until ${sub.expires_at}`);
        activeCount++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Active subscriptions: ${activeCount}`);
    console.log(`❌ Stuck subscriptions: ${stuckCount}`);
    
    if (stuckUsers.length > 0) {
      console.log('\n🚨 STUCK USERS DETAILS:');
      console.log(JSON.stringify(stuckUsers, null, 2));
      
      console.log('\n🔧 Attempting to fix stuck subscriptions...\n');
      
      // Attempt to activate stuck users
      for (const stuck of stuckUsers) {
        try {
          // Calculate expiry date (30 days from payment)
          const paymentDate = new Date(stuck.payment_date);
          const expiresAt = new Date(paymentDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          
          console.log(`⚙️  Activating user ${stuck.user_id}...`);
          
          // Upsert subscription
          const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_subscriptions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'apikey': SUPABASE_SERVICE_KEY,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
              user_id: stuck.user_id,
              plan_name: 'premium',
              status: 'active',
              starts_at: paymentDate.toISOString(),
              expires_at: expiresAt.toISOString(),
              next_billing_date: expiresAt.toISOString(),
              provider_transaction_id: stuck.transaction_id?.replace('apple_', '').replace('iap_', ''),
              auto_renew: true,
              payment_method: 'apple',
              payment_attempts: 0,
              updated_at: new Date().toISOString()
            })
          });
          
          if (updateResponse.ok) {
            console.log(`   ✅ Successfully activated until ${expiresAt.toISOString()}`);
          } else {
            const error = await updateResponse.text();
            console.log(`   ❌ Failed to activate: ${error}`);
          }
        } catch (err) {
          console.log(`   ❌ Error activating: ${err.message}`);
        }
      }
      
      console.log('\n✨ Fix attempt completed!');
    } else {
      console.log('\n✨ All Apple subscriptions are properly activated!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkStuckAppleSubscriptions();
