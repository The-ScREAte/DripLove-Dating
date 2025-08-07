#!/bin/bash

# Android Release Build Setup Script
# This script helps you prepare your Android app for release

echo "🚀 Android Release Build Setup"
echo "==============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 1: Generate Release Keystore${NC}"
echo "This will create a keystore file for signing your release APK/AAB"
echo ""

# Check if keystore already exists
if [ -f "android/app/release-key.keystore" ]; then
    echo -e "${YELLOW}Warning: release-key.keystore already exists!${NC}"
    read -p "Do you want to create a new one? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping keystore generation..."
        exit 0
    fi
fi

echo "Please provide the following information for your keystore:"
echo ""

# Get keystore information
read -p "Store password (keep this safe!): " -s STORE_PASSWORD
echo ""
read -p "Key alias (e.g., driplove-release): " KEY_ALIAS
read -p "Key password (keep this safe!): " -s KEY_PASSWORD
echo ""
read -p "Your first and last name: " DNAME_CN
read -p "Your organization (e.g., DripLove): " DNAME_O
read -p "Your city: " DNAME_L
read -p "Your state/province: " DNAME_ST
read -p "Your country code (e.g., US): " DNAME_C

echo ""
echo -e "${BLUE}Generating keystore...${NC}"

# Generate keystore
keytool -genkey -v \
    -keystore android/app/release-key.keystore \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$STORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "CN=$DNAME_CN, O=$DNAME_O, L=$DNAME_L, ST=$DNAME_ST, C=$DNAME_C"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Keystore generated successfully!${NC}"
    echo ""
    echo -e "${YELLOW}📝 IMPORTANT: Save these credentials securely!${NC}"
    echo "Store Password: $STORE_PASSWORD"
    echo "Key Alias: $KEY_ALIAS"
    echo "Key Password: $KEY_PASSWORD"
    echo ""
    echo "Keystore location: android/app/release-key.keystore"
    echo ""
    
    # Create gradle.properties file
    echo -e "${BLUE}Creating gradle.properties file...${NC}"
    cat > android/gradle.properties << EOF
# Release signing configuration
RELEASE_STORE_FILE=release-key.keystore
RELEASE_STORE_PASSWORD=$STORE_PASSWORD
RELEASE_KEY_ALIAS=$KEY_ALIAS
RELEASE_KEY_PASSWORD=$KEY_PASSWORD

# Gradle optimizations
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.enableJetifier=true
EOF

    echo -e "${GREEN}✅ gradle.properties created!${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  Add gradle.properties to your .gitignore to keep credentials secure!${NC}"
    
else
    echo -e "${RED}❌ Failed to generate keystore${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Step 2: Update build.gradle${NC}"
echo "The build.gradle file has been updated to use environment variables."
echo "You can now build your release AAB with:"
echo ""
echo -e "${GREEN}cd android && ./gradlew bundleRelease${NC}"
echo ""
echo -e "${BLUE}Step 3: Build Commands${NC}"
echo "To build release AAB: ${GREEN}cd android && ./gradlew bundleRelease${NC}"
echo "To build release APK: ${GREEN}cd android && ./gradlew assembleRelease${NC}"
echo ""
echo -e "${YELLOW}📦 Your AAB will be located at:${NC}"
echo "android/app/build/outputs/bundle/release/app-release.aab"
echo ""
echo -e "${GREEN}🎉 Setup complete! Your app is ready for release.${NC}"
