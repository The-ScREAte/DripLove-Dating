#!/bin/bash

# Setup script for email broadcasting with Resend
# This will guide you through setting up real email sending

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   DripLove Email Broadcasting Setup           ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✓ Supabase CLI found${NC}"
echo ""

# Step 1: Get Resend API Key
echo -e "${BLUE}Step 1: Get Your Resend API Key${NC}"
echo "--------------------------------------"
echo "1. Go to: https://resend.com/signup"
echo "2. Create a free account (3,000 emails/month)"
echo "3. Get your API key from the dashboard"
echo ""
read -p "Paste your Resend API key (starts with re_): " RESEND_KEY

if [[ ! $RESEND_KEY == re_* ]]; then
    echo -e "${RED}❌ Invalid API key format. It should start with 're_'${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Valid API key format${NC}"
echo ""

# Step 2: Set from email
echo -e "${BLUE}Step 2: Set From Email${NC}"
echo "--------------------------------------"
echo "For testing, use: onboarding@resend.dev (Resend's default)"
echo "For production, use your own domain: noreply@driplove.com"
echo ""
read -p "Enter from email [onboarding@resend.dev]: " FROM_EMAIL
FROM_EMAIL=${FROM_EMAIL:-onboarding@resend.dev}

echo -e "${GREEN}✓ Using: ${FROM_EMAIL}${NC}"
echo ""

# Step 3: Set secrets
echo -e "${BLUE}Step 3: Configuring Supabase Secrets${NC}"
echo "--------------------------------------"

echo "Setting RESEND_API_KEY..."
supabase secrets set RESEND_API_KEY="$RESEND_KEY"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ RESEND_API_KEY configured${NC}"
else
    echo -e "${RED}❌ Failed to set RESEND_API_KEY${NC}"
    exit 1
fi

echo "Setting FROM_EMAIL..."
supabase secrets set FROM_EMAIL="$FROM_EMAIL"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ FROM_EMAIL configured${NC}"
else
    echo -e "${RED}❌ Failed to set FROM_EMAIL${NC}"
    exit 1
fi

echo ""

# Step 4: Deploy function
echo -e "${BLUE}Step 4: Deploying Edge Function${NC}"
echo "--------------------------------------"

supabase functions deploy send-broadcast-email

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Function deployed successfully${NC}"
else
    echo -e "${RED}❌ Function deployment failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Setup Complete! 🎉                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Open your app's Admin Panel"
echo "2. Go to Broadcast Notifications → Emailing tab"
echo "3. Select a test user"
echo "4. Write a test email"
echo "5. Click 'Send Emails'"
echo "6. Check your inbox! 📧"
echo ""
echo -e "${YELLOW}To view logs in real-time:${NC}"
echo "  supabase functions logs send-broadcast-email --follow"
echo ""
echo -e "${YELLOW}For production (custom domain):${NC}"
echo "  See SETUP_EMAIL_SERVICE.md for instructions"
echo ""
