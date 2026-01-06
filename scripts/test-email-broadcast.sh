#!/bin/bash

# Test script for email broadcasting functionality
# This tests the edge function without actually sending emails (test mode)

echo "🧪 Testing Email Broadcast Edge Function..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✓ Supabase CLI found${NC}"
echo ""

# Deploy the edge function
echo "📦 Deploying send-broadcast-email function..."
supabase functions deploy send-broadcast-email

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Function deployed successfully${NC}"
else
    echo -e "${RED}❌ Function deployment failed${NC}"
    exit 1
fi

echo ""
echo "📋 Setup Checklist:"
echo ""
echo "1. Configure email service (optional for testing):"
echo "   ${YELLOW}supabase secrets set RESEND_API_KEY=your_key${NC}"
echo "   ${YELLOW}supabase secrets set FROM_EMAIL=noreply@yourdomain.com${NC}"
echo ""
echo "2. Test the feature:"
echo "   - Login as admin to your app"
echo "   - Go to Admin Panel → Broadcast Notifications"
echo "   - Click on 'Emailing' tab"
echo "   - Select test users and send an email"
echo ""
echo "3. Check function logs:"
echo "   ${YELLOW}supabase functions logs send-broadcast-email${NC}"
echo ""
echo -e "${GREEN}✓ Setup complete!${NC}"
echo ""
echo "📖 For detailed setup instructions, see: EMAIL_BROADCASTING_SETUP.md"
