#!/bin/bash

# IAP Testing Checklist
# Run this before resubmitting to Apple App Store

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        DripLove IAP Testing Checklist - App Store Review      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
WARN="${YELLOW}⚠${NC}"

# Test function deployment
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. EDGE FUNCTION DEPLOYMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

read -p "Have you deployed the updated receipt validator? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "$PASS Edge function deployed"
    echo "   Command used: ./deploy-iap-validator.sh"
else
    echo -e "$FAIL Deploy with: ./deploy-iap-validator.sh"
    exit 1
fi

echo ""

# Test secrets configuration
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. ENVIRONMENT CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

read -p "Is APPLE_SHARED_SECRET configured in Supabase? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "$PASS Apple shared secret configured"
else
    echo -e "$FAIL Set with: supabase secrets set APPLE_SHARED_SECRET=..."
    exit 1
fi

echo ""

# Test product configuration
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. APP STORE CONNECT CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Product ID: com.driplove.dating.premium.monthlysub2"
read -p "Is this product approved in App Store Connect? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "$PASS Product approved in App Store Connect"
else
    echo -e "$FAIL Submit product for review in App Store Connect"
    exit 1
fi

echo ""

# Test sandbox account
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. SANDBOX TESTING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Testing steps:"
echo "  1. Archive production build in Xcode (Product → Archive)"
echo "  2. Export for Ad Hoc distribution"
echo "  3. Install on physical device"
echo "  4. Sign in with Sandbox Test User in Settings → App Store"
echo "  5. Launch app and attempt subscription purchase"
echo "  6. Monitor Supabase logs for validation flow"
echo ""

read -p "Have you tested purchase with sandbox account on production build? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "$PASS Sandbox purchase tested"
    
    read -p "Did the purchase complete without errors? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "$PASS Purchase completed successfully"
    else
        echo -e "$FAIL Purchase failed - check logs with: supabase functions logs iap-receipt-validator"
        exit 1
    fi
    
    read -p "Did you see the production→sandbox retry in logs? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "$PASS Logs show correct validation flow"
    else
        echo -e "$WARN Verify logs show: 'Sandbox receipt detected (21007), retrying with sandbox endpoint'"
    fi
else
    echo -e "$FAIL Must test with sandbox account before resubmission"
    echo "   See IAP_FIX_SUMMARY.md for testing instructions"
    exit 1
fi

echo ""

# Test database update
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. DATABASE VERIFICATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

read -p "Did the subscription activate in the database? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "$PASS Subscription activated in user_subscriptions table"
else
    echo -e "$FAIL Check database for subscription record"
    exit 1
fi

read -p "Did the app UI show Premium status? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "$PASS UI updated to Premium status"
else
    echo -e "$FAIL Check IAP initialization and subscription check"
    exit 1
fi

echo ""

# Build verification
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. APP STORE BUILD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

read -p "Have you archived and uploaded the build to App Store Connect? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "$PASS Build uploaded to App Store Connect"
else
    echo -e "$FAIL Archive in Xcode: Product → Archive → Distribute"
    exit 1
fi

echo ""

# Final checklist
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7. RESUBMISSION CHECKLIST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Before submitting to App Review:"
echo ""
echo -e "$PASS Edge function deployed with sandbox/production retry logic"
echo -e "$PASS Product ID: com.driplove.dating.premium.monthlysub2"
echo -e "$PASS Tested purchase with sandbox account on production build"
echo -e "$PASS Verified logs show correct validation flow (21007 → sandbox retry)"
echo -e "$PASS Database updated with subscription"
echo -e "$PASS UI shows Premium status"
echo -e "$PASS Build uploaded to App Store Connect"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}✓ All checks passed! Ready for App Store resubmission${NC}"
echo ""
echo "Include these notes for Apple Review:"
echo ""
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ IAP Receipt Validation Fix - Resolved Guideline 2.1        │"
echo "│                                                             │"
echo "│ We have fixed the in-app purchase validation issue.        │"
echo "│ Our server now properly handles sandbox test receipts      │"
echo "│ in production-signed apps as per Apple's guidance.         │"
echo "│                                                             │"
echo "│ Changes made:                                               │"
echo "│ 1. Receipt validation always tries production first        │"
echo "│ 2. On status 21007, automatically retries with sandbox     │"
echo "│ 3. Increased timeout for better reliability                │"
echo "│ 4. Enhanced error logging for debugging                    │"
echo "│                                                             │"
echo "│ Testing: Use sandbox account on production build.          │"
echo "│ Purchase monthly subscription - should activate             │"
echo "│ successfully with no error messages.                       │"
echo "└─────────────────────────────────────────────────────────────┘"
echo ""
echo "Good luck! 🚀"
