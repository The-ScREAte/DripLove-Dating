#!/bin/bash

# IAP Testing Script
# Use this to verify your IAP setup before submitting to Apple

echo "🧪 DripLove IAP Testing Checklist"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if Supabase Edge Function is deployed
echo "1️⃣  Checking Supabase Edge Function..."
read -p "Enter your Supabase project URL (e.g., https://xxx.supabase.co): " SUPABASE_URL
read -p "Enter your anon key: " ANON_KEY

FUNCTION_URL="$SUPABASE_URL/functions/v1/iap-receipt-validator"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}')

if [ "$RESPONSE" == "401" ] || [ "$RESPONSE" == "400" ]; then
  echo -e "${GREEN}✅ Edge Function is deployed and responding${NC}"
else
  echo -e "${RED}❌ Edge Function not responding (HTTP $RESPONSE)${NC}"
  echo "   Deploy with: supabase functions deploy iap-receipt-validator"
fi
echo ""

# Test 2: Check App Store Connect setup
echo "2️⃣  App Store Connect Manual Checks"
echo "   Please verify these manually:"
echo ""
echo "   📋 Agreements, Tax, and Banking:"
echo "      □ Paid Apps Agreement accepted?"
echo "      □ Tax information completed?"
echo "      □ Banking information added?"
echo ""
echo "   📋 In-App Purchases:"
echo "      □ Product ID: com.driplove.dating.premium.monthlysub2"
echo "      □ Status: Ready to Submit or Approved?"
echo "      □ All localizations filled?"
echo "      □ Prices set for all territories?"
echo ""
read -p "Have you verified all of the above? (y/n): " APP_STORE_VERIFIED

if [ "$APP_STORE_VERIFIED" == "y" ] || [ "$APP_STORE_VERIFIED" == "Y" ]; then
  echo -e "${GREEN}✅ App Store Connect verified${NC}"
else
  echo -e "${YELLOW}⚠️  Please complete App Store Connect setup${NC}"
fi
echo ""

# Test 3: Check for Apple Shared Secret
echo "3️⃣  Apple Shared Secret"
read -p "Have you added APPLE_SHARED_SECRET to Supabase secrets? (y/n): " SECRET_ADDED

if [ "$SECRET_ADDED" == "y" ] || [ "$SECRET_ADDED" == "Y" ]; then
  echo -e "${GREEN}✅ Shared secret configured${NC}"
else
  echo -e "${YELLOW}⚠️  Add with: supabase secrets set APPLE_SHARED_SECRET=your_secret${NC}"
fi
echo ""

# Test 4: Check Sandbox Test Account
echo "4️⃣  Sandbox Testing"
read -p "Have you created a sandbox test account? (y/n): " SANDBOX_ACCOUNT

if [ "$SANDBOX_ACCOUNT" == "y" ] || [ "$SANDBOX_ACCOUNT" == "Y" ]; then
  echo -e "${GREEN}✅ Sandbox account created${NC}"
  echo "   Remember to sign in at: Settings → App Store → Sandbox Account"
else
  echo -e "${YELLOW}⚠️  Create at: App Store Connect → Users and Access → Sandbox Testers${NC}"
fi
echo ""

# Test 5: Code changes
echo "5️⃣  Code Changes Applied"
echo "   Checking modified files..."

FILES=(
  "src/iap.ts"
  "src/components/PremiumUpgrade.tsx"
  "supabase/functions/iap-receipt-validator/index.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}   ✅ $file exists${NC}"
  else
    echo -e "${RED}   ❌ $file not found${NC}"
  fi
done
echo ""

# Test 6: Build check
echo "6️⃣  Build Status"
read -p "Have you built and tested on a device/simulator? (y/n): " BUILD_TESTED

if [ "$BUILD_TESTED" == "y" ] || [ "$BUILD_TESTED" == "Y" ]; then
  echo -e "${GREEN}✅ Build tested${NC}"
else
  echo -e "${YELLOW}⚠️  Build with: npm run build && npx cap sync${NC}"
fi
echo ""

# Summary
echo "=================================="
echo "📊 Testing Summary"
echo "=================================="
echo ""
echo "Next Steps:"
echo "1. Test purchase flow with sandbox account on iPad"
echo "2. Verify purchase completes within 30 seconds"
echo "3. Check console logs for errors"
echo "4. Deploy to TestFlight"
echo "5. Final test on iPad Air (iPadOS 26.0.1)"
echo "6. Resubmit to Apple with notes from IAP_LOADING_FIX_GUIDE.md"
echo ""
echo "For detailed instructions, see: IAP_LOADING_FIX_GUIDE.md"
echo ""
