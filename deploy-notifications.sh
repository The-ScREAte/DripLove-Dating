#!/bin/bash

# DripLove Notification Setup - Deployment Script
# This script deploys the push notification Edge Function to Supabase

echo "🚀 DripLove Notification Deployment"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Project configuration
PROJECT_REF="tgjsyyihabsovironesw"
FIREBASE_PROJECT_ID="time-tracking-b70af"

echo "📋 Configuration:"
echo "  Supabase Project: $PROJECT_REF"
echo "  Firebase Project: $FIREBASE_PROJECT_ID"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

# Step 1: Link to Supabase project
echo -e "${YELLOW}Step 1: Linking to Supabase project...${NC}"
supabase link --project-ref $PROJECT_REF

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to link to Supabase project${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Linked to Supabase project${NC}"
echo ""

# Step 2: Set FCM Server Key
echo -e "${YELLOW}Step 2: Setting FCM Server Key...${NC}"
echo "⚠️  You need to get your FCM Server Key from Firebase Console"
echo "   1. Go to: https://console.firebase.google.com/project/$FIREBASE_PROJECT_ID/settings/cloudmessaging"
echo "   2. Go to 'Cloud Messaging' tab"
echo "   3. Scroll to 'Cloud Messaging API (Legacy)' section"
echo "   4. Copy the 'Server key'"
echo ""
read -p "Enter your FCM Server Key (or press Enter to skip): " FCM_KEY

if [ ! -z "$FCM_KEY" ]; then
    supabase secrets set FCM_SERVER_KEY="$FCM_KEY"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ FCM Server Key set${NC}"
    else
        echo -e "${RED}❌ Failed to set FCM Server Key${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⏭️  Skipped setting FCM Server Key${NC}"
    echo "   You can set it later with:"
    echo "   supabase secrets set FCM_SERVER_KEY=your_key_here"
fi
echo ""

# Step 3: Deploy Edge Function
echo -e "${YELLOW}Step 3: Deploying Edge Function...${NC}"
supabase functions deploy send-push-notification

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to deploy Edge Function${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Edge Function deployed${NC}"
echo ""

# Step 4: Verify deployment
echo -e "${YELLOW}Step 4: Verifying deployment...${NC}"
supabase functions list

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "📱 Next steps:"
echo "   1. Get your FCM Server Key from Firebase Console (if not done)"
echo "   2. Set it with: supabase secrets set FCM_SERVER_KEY=your_key"
echo "   3. Test notifications from your app"
echo ""
echo "🔍 To check logs:"
echo "   supabase functions logs send-push-notification"
echo ""
