#!/bin/bash

# Android Build Script for DripLove Dating App
# This script handles both debug and release builds

echo "🚀 DripLove Android Build Script"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Build type selection
echo "Select build type:"
echo "1. Debug APK"
echo "2. Release APK (signed)"
echo "3. Release AAB (Google Play)"
echo "4. Clean build"
echo ""
read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo -e "${BLUE}Building Debug APK...${NC}"
        cd android
        ./gradlew assembleDebug
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Debug APK built successfully!${NC}"
            echo "Location: android/app/build/outputs/apk/debug/app-debug.apk"
        else
            echo -e "${RED}❌ Debug build failed${NC}"
        fi
        ;;
    2)
        echo -e "${BLUE}Building Release APK...${NC}"
        if [ ! -f "android/app/release-key.keystore" ]; then
            echo -e "${RED}❌ Keystore not found! Run ./scripts/shell/setup-android-release.sh first${NC}"
            exit 1
        fi
        cd android
        ./gradlew assembleRelease
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Release APK built successfully!${NC}"
            echo "Location: android/app/build/outputs/apk/release/app-release.apk"
        else
            echo -e "${RED}❌ Release build failed${NC}"
        fi
        ;;
    3)
        echo -e "${BLUE}Building Release AAB for Google Play...${NC}"
        if [ ! -f "android/app/release-key.keystore" ]; then
            echo -e "${RED}❌ Keystore not found! Run ./scripts/shell/setup-android-release.sh first${NC}"
            exit 1
        fi
        cd android
        ./gradlew bundleRelease
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Release AAB built successfully!${NC}"
            echo "Location: android/app/build/outputs/bundle/release/app-release.aab"
            echo ""
            echo -e "${YELLOW}📦 Upload this AAB file to Google Play Console${NC}"
        else
            echo -e "${RED}❌ Release build failed${NC}"
        fi
        ;;
    4)
        echo -e "${BLUE}Cleaning build...${NC}"
        cd android
        ./gradlew clean
        echo -e "${GREEN}✅ Build cleaned${NC}"
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}Build process completed!${NC}"

# Check file sizes
if [ "$choice" -eq 2 ] || [ "$choice" -eq 3 ]; then
    echo ""
    echo -e "${BLUE}File Information:${NC}"
    if [ "$choice" -eq 2 ] && [ -f "android/app/build/outputs/apk/release/app-release.apk" ]; then
        ls -lh android/app/build/outputs/apk/release/app-release.apk
    fi
    if [ "$choice" -eq 3 ] && [ -f "android/app/build/outputs/bundle/release/app-release.aab" ]; then
        ls -lh android/app/build/outputs/bundle/release/app-release.aab
    fi
fi
