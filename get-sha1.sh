#!/bin/bash

echo "🔑 Getting SHA-1 Certificate Fingerprints for Android"
echo "=================================================="
echo ""

# Debug keystore (for development)
echo "📱 DEBUG Keystore (for development/testing):"
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android 2>/dev/null | grep SHA1

echo ""
echo "=================================================="
echo ""

# Release keystore (if it exists)
if [ -f "./android/app/my-release-key.keystore" ]; then
    echo "🚀 RELEASE Keystore (for production):"
    echo "Enter your release keystore password when prompted:"
    keytool -list -v -keystore ./android/app/my-release-key.keystore -alias my-key-alias
else
    echo "⚠️  No release keystore found at ./android/app/my-release-key.keystore"
    echo "If you have a release keystore, run:"
    echo "keytool -list -v -keystore /path/to/your/keystore -alias your-alias"
fi

echo ""
echo "=================================================="
echo "📋 Next Steps:"
echo "1. Copy the SHA-1 fingerprint(s) above"
echo "2. Go to: https://console.cloud.google.com/apis/credentials"
echo "3. Find your Android OAuth Client ID"
echo "4. Add the SHA-1 fingerprint(s) there"
echo "5. Make sure package name is: com.driplove.dating"
echo "=================================================="
