const fetch = require('node-fetch');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tgjsyyihabsovironesw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function analyzeAllSubscriptions() {
  console.log('🔍 Analyzing all 86 subscriptions in detail...\n');
  
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found');
    return;
  }
  
  try {
    // Use the subscription-stats Edge Function which has proper access
    const response = await fetch(`${SUPABASE_URL}/functions/v1/subscription-stats`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ detailed: true })
    });
    
    const allSubs = await response.json();
    
    if (!Array.isArray(allSubs)) {
      console.error('❌ Error fetching subscriptions:', allSubs);
      return;
    }
    
    console.log(`📊 Total subscription records: ${allSubs.length}\n`);
    
    const now = new Date();
    
    // Categorize subscriptions
    const categories = {
      activePremium: [],
      cancelledNotExpired: [],
      cancelledAndExpired: [],
      expiredStatus: [],
      paymentFailed: [],
      freeOrOther: []
    };
    
    allSubs.forEach(sub => {
      const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
      const isExpired = expiresAt && expiresAt <= now;
      const isPremiumPlan = sub.plan_name === 'premium';
      
      if (sub.status === 'active' && isPremiumPlan && !isExpired) {
        categories.activePremium.push(sub);
      } else if (sub.status === 'cancelled' && isPremiumPlan && !isExpired) {
        categories.cancelledNotExpired.push(sub);
      } else if (sub.status === 'cancelled' && isExpired) {
        categories.cancelledAndExpired.push(sub);
      } else if (sub.status === 'expired') {
        categories.expiredStatus.push(sub);
      } else if (sub.status === 'payment_failed') {
        categories.paymentFailed.push(sub);
      } else {
        categories.freeOrOther.push(sub);
      }
    });
    
    console.log('=' .repeat(80));
    console.log('📈 SUBSCRIPTION BREAKDOWN');
    console.log('=' .repeat(80));
    
    // Active Premium (should count)
    console.log(`\n✅ ACTIVE PREMIUM (Should count): ${categories.activePremium.length}`);
    console.log('   Status: active, Plan: premium, Not expired');
    if (categories.activePremium.length > 0) {
      categories.activePremium.slice(0, 3).forEach(sub => {
        console.log(`   • User: ${sub.user_id.substring(0, 8)}... | Expires: ${sub.expires_at} | Method: ${sub.payment_method}`);
      });
      if (categories.activePremium.length > 3) {
        console.log(`   ... and ${categories.activePremium.length - 3} more`);
      }
    }
    
    // Cancelled but not expired (SHOULD count)
    console.log(`\n✅ CANCELLED BUT NOT EXPIRED (Should count): ${categories.cancelledNotExpired.length}`);
    console.log('   Status: cancelled, Plan: premium, Still valid until expiry');
    if (categories.cancelledNotExpired.length > 0) {
      categories.cancelledNotExpired.forEach(sub => {
        const daysLeft = Math.ceil((new Date(sub.expires_at) - now) / (1000 * 60 * 60 * 24));
        console.log(`   • User: ${sub.user_id.substring(0, 8)}... | Expires: ${sub.expires_at} (${daysLeft} days left) | Method: ${sub.payment_method}`);
      });
    }
    
    // THE PROBLEM: Cancelled AND expired
    console.log(`\n❌ CANCELLED AND EXPIRED (Should NOT count): ${categories.cancelledAndExpired.length}`);
    console.log('   Status: cancelled, Expiry date PASSED, but plan_name might still be "premium"');
    if (categories.cancelledAndExpired.length > 0) {
      console.log('   ⚠️  THESE ARE THE PROBLEM - Should be status=expired, plan_name=free');
      categories.cancelledAndExpired.forEach(sub => {
        const daysPast = Math.ceil((now - new Date(sub.expires_at)) / (1000 * 60 * 60 * 24));
        console.log(`   • User: ${sub.user_id.substring(0, 8)}... | Expired: ${sub.expires_at} (${daysPast} days ago) | Plan: ${sub.plan_name} | Method: ${sub.payment_method}`);
      });
    }
    
    // Expired status
    console.log(`\n⏱️  EXPIRED STATUS: ${categories.expiredStatus.length}`);
    console.log('   Status: expired (correctly processed)');
    if (categories.expiredStatus.length > 0) {
      categories.expiredStatus.slice(0, 2).forEach(sub => {
        console.log(`   • User: ${sub.user_id.substring(0, 8)}... | Expired: ${sub.expires_at} | Plan: ${sub.plan_name} | Method: ${sub.payment_method}`);
      });
      if (categories.expiredStatus.length > 2) {
        console.log(`   ... and ${categories.expiredStatus.length - 2} more`);
      }
    }
    
    // Payment failed
    console.log(`\n💳 PAYMENT FAILED: ${categories.paymentFailed.length}`);
    if (categories.paymentFailed.length > 0) {
      categories.paymentFailed.forEach(sub => {
        console.log(`   • User: ${sub.user_id.substring(0, 8)}... | Method: ${sub.payment_method} | Attempts: ${sub.payment_attempts}`);
      });
    }
    
    // Free or other
    console.log(`\n📦 FREE OR OTHER: ${categories.freeOrOther.length}`);
    if (categories.freeOrOther.length > 0) {
      console.log(`   Various statuses (inactive, free plan, etc.)`);
    }
    
    // Summary
    console.log('\n' + '=' .repeat(80));
    console.log('🎯 SUMMARY');
    console.log('=' .repeat(80));
    
    const shouldBePremium = categories.activePremium.length + categories.cancelledNotExpired.length;
    const shouldNotBePremium = categories.cancelledAndExpired.length + categories.expiredStatus.length + categories.paymentFailed.length + categories.freeOrOther.length;
    
    console.log(`\n✅ Users who SHOULD have premium: ${shouldBePremium}`);
    console.log(`   - Active: ${categories.activePremium.length}`);
    console.log(`   - Cancelled but not expired: ${categories.cancelledNotExpired.length}`);
    
    console.log(`\n❌ Users who SHOULD NOT have premium: ${shouldNotBePremium}`);
    console.log(`   - Cancelled AND expired: ${categories.cancelledAndExpired.length} ⚠️ NEEDS FIXING`);
    console.log(`   - Status=expired: ${categories.expiredStatus.length}`);
    console.log(`   - Payment failed: ${categories.paymentFailed.length}`);
    console.log(`   - Free or other: ${categories.freeOrOther.length}`);
    
    console.log(`\n📊 Total: ${allSubs.length} subscription records`);
    
    if (categories.cancelledAndExpired.length > 0) {
      console.log('\n' + '=' .repeat(80));
      console.log('🔧 ISSUE IDENTIFIED');
      console.log('=' .repeat(80));
      console.log(`\n⚠️  ${categories.cancelledAndExpired.length} users have:`);
      console.log('   - status = "cancelled"');
      console.log('   - expires_at = PAST DATE');
      console.log('   - BUT they might still have plan_name = "premium"');
      console.log('\n💡 Fix needed:');
      console.log('   1. Update handle_subscription_expiry to process cancelled subscriptions');
      console.log('   2. Update subscription-checker to catch cancelled+expired subscriptions');
      console.log('   3. Set them to status="expired", plan_name="free"');
    } else {
      console.log('\n✅ No cancelled+expired subscriptions found. System is clean!');
    }
    
    // Platform breakdown
    console.log('\n' + '=' .repeat(80));
    console.log('📱 BREAKDOWN BY PLATFORM');
    console.log('=' .repeat(80));
    
    const platforms = { google: 0, apple: 0, paystack: 0, other: 0 };
    const activePlatforms = { google: 0, apple: 0, paystack: 0, other: 0 };
    
    allSubs.forEach(sub => {
      const method = sub.payment_method || 'other';
      platforms[method] = (platforms[method] || 0) + 1;
      
      if (sub.status === 'active' && sub.plan_name === 'premium') {
        activePlatforms[method] = (activePlatforms[method] || 0) + 1;
      }
    });
    
    console.log(`\nGoogle Play: ${platforms.google || 0} total, ${activePlatforms.google || 0} active`);
    console.log(`Apple: ${platforms.apple || 0} total, ${activePlatforms.apple || 0} active`);
    console.log(`Paystack: ${platforms.paystack || 0} total, ${activePlatforms.paystack || 0} active`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

analyzeAllSubscriptions();
