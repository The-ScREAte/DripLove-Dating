#!/bin/bash

# IAP Receipt Validator Deployment Script
# This script deploys the updated receipt validation edge function to Supabase

set -e  # Exit on error

echo "🚀 Deploying IAP Receipt Validator to Supabase..."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI not found"
    echo "Install it with: brew install supabase/tap/supabase"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "supabase/functions/iap-receipt-validator/index.ts" ]; then
    echo "❌ Error: Must run this script from the project root directory"
    exit 1
fi

echo "📋 Checking required secrets..."
echo ""

# Check if secrets are configured
SECRETS=$(supabase secrets list 2>&1)

if echo "$SECRETS" | grep -q "APPLE_SHARED_SECRET"; then
    echo "✅ APPLE_SHARED_SECRET is configured"
else
    echo "⚠️  Warning: APPLE_SHARED_SECRET not found"
    echo "   Set it with: supabase secrets set APPLE_SHARED_SECRET=your_secret_here"
    read -p "   Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "📦 Deploying function to Supabase..."
echo ""

# Deploy the function
supabase functions deploy iap-receipt-validator --no-verify-jwt

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "📊 Next steps:"
    echo "1. Test the purchase flow with a sandbox account"
    echo "2. Monitor logs: supabase functions logs iap-receipt-validator"
    echo "3. Verify subscription activates in database"
    echo "4. Build and submit to App Store"
    echo ""
    echo "🔍 To view logs in real-time:"
    echo "   supabase functions logs iap-receipt-validator --follow"
    echo ""
else
    echo ""
    echo "❌ Deployment failed"
    echo "Check the error message above for details"
    exit 1
fi
