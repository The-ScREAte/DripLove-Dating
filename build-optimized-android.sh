#!/bin/bash

# Quick Build Script for Testing Performance Improvements
# Run this to rebuild and test your Android app

echo "🚀 Building Optimized Android App..."
echo ""

# Step 1: Clean previous builds
echo "📦 Step 1: Cleaning previous builds..."
rm -rf dist
rm -rf android/app/build
echo "✅ Clean complete"
echo ""

# Step 2: Install dependencies (if needed)
echo "📦 Step 2: Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
else
    echo "✅ Dependencies OK"
fi
echo ""

# Step 3: Build optimized production bundle
echo "🔨 Step 3: Building production bundle..."
npm run build
echo "✅ Build complete"
echo ""

# Step 4: Sync with Capacitor
echo "🔄 Step 4: Syncing with Capacitor..."
npx cap sync android
echo "✅ Sync complete"
echo ""

# Step 5: Build Android release APK
echo "📱 Step 5: Building Android release APK..."
cd android
./gradlew clean
./gradlew assembleRelease
cd ..
echo "✅ APK build complete"
echo ""

# Step 6: Locate the APK
APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_PATH" ]; then
    echo "✅ SUCCESS! APK created at:"
    echo "   $APK_PATH"
    echo ""
    echo "📲 To install on device:"
    echo "   adb install $APK_PATH"
    echo ""
    echo "🧪 To test performance:"
    echo "   1. Install the APK on your device"
    echo "   2. Open the app"
    echo "   3. Open Chrome DevTools (chrome://inspect)"
    echo "   4. Paste the performance-monitor.js script"
    echo "   5. Compare results with iOS"
else
    echo "❌ APK not found. Check build errors above."
fi
