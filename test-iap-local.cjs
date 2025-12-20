#!/usr/bin/env node

/**
 * Test IAP Local Setup
 * This script helps verify your Apple IAP development environment
 */

console.log('='.repeat(60));
console.log('Apple IAP Development Environment Check');
console.log('='.repeat(60));
console.log('');

const fs = require('fs');
const path = require('path');

// Check files
const checks = {
  storeKitFile: './ios/App/App/DripLove.storekit',
  schemeFile: './ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme',
  iapCode: './src/iap.ts'
};

console.log('✓ Checking required files...\n');

for (const [name, filePath] of Object.entries(checks)) {
  const exists = fs.existsSync(filePath);
  console.log(`  ${exists ? '✓' : '✗'} ${name}: ${exists ? 'Found' : 'MISSING'}`);
  
  if (exists && name === 'storeKitFile') {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    console.log(`    - Subscription Groups: ${data.subscriptionGroups?.length || 0}`);
    if (data.subscriptionGroups?.[0]) {
      const subs = data.subscriptionGroups[0].subscriptions || [];
      console.log(`    - Products: ${subs.length}`);
      subs.forEach(sub => {
        console.log(`      • ${sub.productID} (${sub.displayPrice})`);
      });
    }
  }
  
  if (exists && name === 'schemeFile') {
    const content = fs.readFileSync(filePath, 'utf8');
    const hasStoreKit = content.includes('StoreKitConfigurationFileReference');
    console.log(`    - StoreKit Config Referenced: ${hasStoreKit ? 'YES ✓' : 'NO ✗'}`);
    if (hasStoreKit) {
      const match = content.match(/identifier\s*=\s*"([^"]+)"/);
      if (match) {
        console.log(`    - Path: ${match[1]}`);
      }
    }
  }
}

console.log('');
console.log('='.repeat(60));
console.log('Setup Instructions for Local IAP Testing:');
console.log('='.repeat(60));
console.log('');
console.log('1. IN XCODE:');
console.log('   • Open: npx cap open ios');
console.log('   • Select "App" scheme in top bar');
console.log('   • Edit Scheme (Product > Scheme > Edit Scheme...)');
console.log('   • Go to "Run" > "Options" tab');
console.log('   • Verify StoreKit Configuration is set to "DripLove.storekit"');
console.log('');
console.log('2. ON YOUR iPhone:');
console.log('   • Settings > App Store');
console.log('   • Tap on your Apple ID at the top');
console.log('   • Sign out of your production Apple ID');
console.log('   • DO NOT sign back in with sandbox account here!');
console.log('');
console.log('3. BUILD AND RUN FROM XCODE:');
console.log('   • Build and run from Xcode (Cmd+R)');
console.log('   • When you try to make a purchase, iOS will prompt for');
console.log('     sandbox credentials');
console.log('   • Enter your sandbox account email/password');
console.log('');
console.log('4. VERIFY IN XCODE:');
console.log('   • In Xcode menu: Debug > StoreKit > Manage Transactions');
console.log('   • You should see test transactions here');
console.log('');
console.log('='.repeat(60));
console.log('Product IDs in your app:');
console.log('='.repeat(60));
console.log('');
console.log('  • com.driplove.dating.premium.monthlysub3 (newest)');
console.log('  • com.driplove.dating.premium.monthlysub2 (fallback)');
console.log('');
console.log('Make sure these match exactly in:');
console.log('  1. DripLove.storekit file ✓');
console.log('  2. App Store Connect (for production)');
console.log('  3. src/iap.ts code ✓');
console.log('');
console.log('='.repeat(60));
console.log('Common Issues & Solutions:');
console.log('='.repeat(60));
console.log('');
console.log('❌ "Cannot connect to iTunes Store"');
console.log('   → You\'re signed into production Apple ID');
console.log('   → Solution: Sign out in Settings > App Store');
console.log('');
console.log('❌ "This Apple ID has not been set up for App Store"');
console.log('   → You\'re trying to use a non-sandbox account');
console.log('   → Solution: Use your sandbox tester account');
console.log('');
console.log('❌ Products not loading');
console.log('   → StoreKit config may not be enabled in scheme');
console.log('   → Solution: Check scheme settings (step 1 above)');
console.log('');
console.log('❌ Works in production but not development');
console.log('   → App is connecting to real App Store instead of StoreKit');
console.log('   → Solution: Make sure you\'re running from Xcode, not standalone');
console.log('');
console.log('='.repeat(60));
console.log('Next Steps:');
console.log('='.repeat(60));
console.log('');
console.log('1. Run: npx cap open ios');
console.log('2. In Xcode, click on "DripLove.storekit" in left sidebar');
console.log('3. Verify your products are shown');
console.log('4. Build & Run (Cmd+R) to your iPhone');
console.log('5. Try purchasing - sandbox prompt should appear');
console.log('');
