#!/bin/bash

# Setup Brevo (FREE - 300 emails/day) for DripLove email broadcasting

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Brevo FREE Email Setup (300/day)            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✓ Supabase CLI found${NC}"
echo ""

# Instructions
echo -e "${YELLOW}📋 Before continuing:${NC}"
echo "1. Sign up at: https://www.brevo.com"
echo "2. Go to Settings → API Keys"
echo "3. Create a new API key"
echo "4. Copy the key (starts with 'xkeysib-')"
echo ""
read -p "Press Enter when you have your API key ready..."

# Get API key
echo ""
read -p "Paste your Brevo API key: " BREVO_KEY

if [[ ! $BREVO_KEY == xkeysib-* ]]; then
    echo -e "${RED}❌ Invalid API key format. It should start with 'xkeysib-'${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Valid API key format${NC}"
echo ""

# Get Gmail address
echo "What Gmail address should emails be sent FROM?"
read -p "Your Gmail address: " GMAIL_USER

if [[ ! $GMAIL_USER == *@*.* ]]; then
    echo -e "${RED}❌ Invalid email format${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Using: ${GMAIL_USER}${NC}"
echo ""

# Configure Supabase
echo -e "${BLUE}Configuring Supabase Secrets...${NC}"
echo "--------------------------------------"

echo "Setting BREVO_API_KEY..."
supabase secrets set BREVO_API_KEY="$BREVO_KEY"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ BREVO_API_KEY configured${NC}"
else
    echo -e "${RED}❌ Failed to set BREVO_API_KEY${NC}"
    exit 1
fi

echo "Setting GMAIL_USER..."
supabase secrets set GMAIL_USER="$GMAIL_USER"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ GMAIL_USER configured${NC}"
else
    echo -e "${RED}❌ Failed to set GMAIL_USER${NC}"
    exit 1
fi

echo ""

# Deploy function
echo -e "${BLUE}Deploying Edge Function...${NC}"
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
echo -e "${GREEN}║     Setup Complete! 🎉                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📊 Your FREE Email Limits:${NC}"
echo "  • 300 emails per day"
echo "  • 9,000 emails per month"
echo "  • Completely FREE forever!"
echo ""
echo -e "${YELLOW}🧪 Test It Now:${NC}"
echo "  1. Open your app's Admin Panel"
echo "  2. Go to: Broadcast Notifications → Emailing"
echo "  3. Select a test user"
echo "  4. Write and send a test email"
echo "  5. Check the recipient's inbox! 📧"
echo ""
echo -e "${YELLOW}📈 Need More Than 300/day?${NC}"
echo "  Create multiple Brevo accounts for more free emails"
echo "  See: FREE_EMAIL_SETUP.md for details"
echo ""
echo -e "${YELLOW}📝 View Logs:${NC}"
echo "  supabase functions logs send-broadcast-email --follow"
echo ""
