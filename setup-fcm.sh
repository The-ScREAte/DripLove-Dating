#!/bin/bash

# Setup FCM with Service Account for DripLove Notifications

echo "🔑 Setting up Firebase Cloud Messaging..."
echo ""

# Check if the service account JSON file exists
JSON_FILE="time-tracking-b70af-firebase-adminsdk-fbsvc-41500a075c.json"

if [ ! -f "$JSON_FILE" ]; then
    echo "❌ Error: $JSON_FILE not found in current directory"
    echo "Please make sure the file is in: $(pwd)"
    exit 1
fi

echo "✅ Found service account file: $JSON_FILE"
echo ""

# Extract the private key and prepare it for Supabase
echo "📦 Preparing Firebase credentials..."

# Read the entire JSON file and encode it as base64
SERVICE_ACCOUNT_JSON=$(cat "$JSON_FILE" | base64)

echo "✅ Service account credentials prepared"
echo ""

# Link to Supabase project
echo "🔗 Linking to Supabase project..."
supabase link --project-ref tgjsyyihabsovironesw

if [ $? -ne 0 ]; then
    echo "❌ Failed to link to Supabase project"
    exit 1
fi

echo "✅ Linked to Supabase"
echo ""

# Set the service account JSON as a secret
echo "🔐 Setting Firebase service account secret..."
supabase secrets set FIREBASE_SERVICE_ACCOUNT="$SERVICE_ACCOUNT_JSON"

if [ $? -ne 0 ]; then
    echo "❌ Failed to set Firebase service account"
    exit 1
fi

echo "✅ Firebase service account configured"
echo ""

# Deploy the edge function
echo "🚀 Deploying notification Edge Function..."
supabase functions deploy send-push-notification

if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy Edge Function"
    exit 1
fi

echo "✅ Edge Function deployed"
echo ""

# Verify
echo "🔍 Verifying deployment..."
supabase functions list

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📱 Your notification system is ready:"
echo "   - Custom sound: botificationsound"
echo "   - Channels: messages, matches, likes, general"
echo "   - Firebase Project: time-tracking-b70af"
echo "   - Supabase Project: tgjsyyihabsovironesw"
echo ""
echo "🔍 To check logs:"
echo "   supabase functions logs send-push-notification"
echo ""
