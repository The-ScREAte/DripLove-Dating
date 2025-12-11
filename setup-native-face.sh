#!/bin/bash

# Native Face Recognition Setup Script
# Sets up the native FaceScan plugin for iOS and Android

set -e

echo "🚀 Setting up Native Face Recognition Plugin..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Install plugin dependencies
echo "${BLUE}📦 Installing plugin dependencies...${NC}"
cd plugins/facescan
npm install || echo "${RED}Warning: npm install failed in plugin${NC}"
cd ../..

# Step 2: Sync Capacitor
echo ""
echo "${BLUE}🔄 Syncing Capacitor...${NC}"
npx cap sync

# Step 3: Update iOS Info.plist
echo ""
echo "${BLUE}📱 Updating iOS configuration...${NC}"

PLIST_FILE="ios/App/App/Info.plist"

if [ -f "$PLIST_FILE" ]; then
    # Check if camera permission already exists
    if ! grep -q "NSCameraUsageDescription" "$PLIST_FILE"; then
        echo "Adding camera permission to Info.plist..."
        
        # Backup original file
        cp "$PLIST_FILE" "$PLIST_FILE.backup"
        
        # Add camera permission before </dict>
        sed -i '' '/<\/dict>/i\
	<key>NSCameraUsageDescription</key>\
	<string>We need camera access to verify your identity and keep our community safe and authentic.</string>
' "$PLIST_FILE"
        
        echo "${GREEN}✓ Camera permission added to iOS${NC}"
    else
        echo "${GREEN}✓ Camera permission already exists in iOS${NC}"
    fi
else
    echo "${RED}Warning: iOS Info.plist not found${NC}"
fi

# Step 4: Check Android configuration
echo ""
echo "${BLUE}🤖 Checking Android configuration...${NC}"

ANDROID_MANIFEST="android/app/src/main/AndroidManifest.xml"

if [ -f "$ANDROID_MANIFEST" ]; then
    if grep -q "android.permission.CAMERA" "$ANDROID_MANIFEST"; then
        echo "${GREEN}✓ Camera permission already in Android manifest${NC}"
    else
        echo "${RED}Note: Add camera permission to AndroidManifest.xml manually${NC}"
    fi
else
    echo "${RED}Warning: Android manifest not found${NC}"
fi

# Step 5: Summary
echo ""
echo "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${GREEN}✅ Native Face Recognition Plugin Setup Complete!${NC}"
echo "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. ${BLUE}Build iOS:${NC}"
echo "   npx cap open ios"
echo "   (Build in Xcode)"
echo ""
echo "2. ${BLUE}Build Android:${NC}"
echo "   npx cap open android"
echo "   (Build in Android Studio)"
echo ""
echo "3. ${BLUE}Test on device:${NC}"
echo "   - Grant camera permission when prompted"
echo "   - Verify face capture works"
echo "   - Check console for descriptor output"
echo ""
echo "4. ${BLUE}Update your code:${NC}"
echo "   - Replace FaceScanner with NativeFaceScanner"
echo "   - Use nativeFaceComparison utilities"
echo ""
echo "📖 See NATIVE_FACE_MIGRATION.md for complete guide"
echo ""
