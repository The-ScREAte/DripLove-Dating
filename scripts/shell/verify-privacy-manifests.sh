#!/bin/bash

# Privacy Manifest Verification Script
# Run this before archiving to ensure all privacy manifests are in place

echo "🔍 Verifying Privacy Manifests for App Store Submission"
echo "=================================================="
echo ""

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT/ios/App"

MISSING=0

# Check GoogleSignIn
echo "Checking GoogleSignIn..."
if [ -f "Pods/GoogleSignIn/GoogleSignIn/Sources/Resources/PrivacyInfo.xcprivacy" ]; then
    echo "✅ GoogleSignIn privacy manifest found"
    VERSION=$(grep -A 1 "GoogleSignIn (" Podfile.lock | head -1 | sed 's/.*(\(.*\)).*/\1/')
    echo "   Version: $VERSION"
else
    echo "❌ GoogleSignIn privacy manifest NOT FOUND"
    MISSING=1
fi
echo ""

# Check GTMAppAuth
echo "Checking GTMAppAuth..."
if [ -f "Pods/GTMAppAuth/GTMAppAuth/Sources/Resources/PrivacyInfo.xcprivacy" ]; then
    echo "✅ GTMAppAuth privacy manifest found"
    VERSION=$(grep -A 1 "GTMAppAuth (" Podfile.lock | head -1 | sed 's/.*(\(.*\)).*/\1/')
    echo "   Version: $VERSION"
else
    echo "❌ GTMAppAuth privacy manifest NOT FOUND"
    MISSING=1
fi
echo ""

# Check GTMSessionFetcher
echo "Checking GTMSessionFetcher..."
CORE_EXISTS=0
FULL_EXISTS=0

if [ -f "Pods/GTMSessionFetcher/Sources/Core/Resources/PrivacyInfo.xcprivacy" ]; then
    echo "✅ GTMSessionFetcher/Core privacy manifest found"
    CORE_EXISTS=1
fi

if [ -f "Pods/GTMSessionFetcher/Sources/Full/Resources/PrivacyInfo.xcprivacy" ]; then
    echo "✅ GTMSessionFetcher/Full privacy manifest found"
    FULL_EXISTS=1
fi

if [ $CORE_EXISTS -eq 1 ] && [ $FULL_EXISTS -eq 1 ]; then
    VERSION=$(grep -A 1 "GTMSessionFetcher (" Podfile.lock | head -1 | sed 's/.*(\(.*\)).*/\1/')
    echo "   Version: $VERSION"
else
    echo "❌ GTMSessionFetcher privacy manifests NOT FOUND"
    MISSING=1
fi
echo ""

# Check Xcode version
echo "Checking Xcode version..."
XCODE_VERSION=$(xcodebuild -version | head -1)
echo "   $XCODE_VERSION"
echo ""

# Summary
echo "=================================================="
if [ $MISSING -eq 0 ]; then
    echo "✅ All privacy manifests are in place!"
    echo ""
    echo "Next steps:"
    echo "1. Open Xcode: open ios/App/App.xcworkspace"
    echo "2. Clean Build Folder (⇧⌘K)"
    echo "3. Archive (Product → Archive)"
    echo "4. Validate Archive"
    echo "5. Upload to App Store Connect"
    echo ""
    echo "For detailed instructions, see: APPLE_PRIVACY_MANIFEST_FIX.md"
else
    echo "❌ Some privacy manifests are missing!"
    echo ""
    echo "Run the following to fix:"
    echo "  cd ios/App"
    echo "  pod install"
    echo "  cd ../.."
    echo "  npx cap sync ios"
    echo ""
    echo "Then run this script again to verify."
fi
echo "=================================================="

exit $MISSING
