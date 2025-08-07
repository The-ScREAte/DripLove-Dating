# 🚀 Android Release Checklist for DripLove Dating App

## ✅ STEP 1: Prepare Your App for Release

### 1.1 ✅ Switch to Release Mode
- [x] Updated `android/app/build.gradle` with optimized release configuration
- [x] Enabled minification and resource shrinking
- [x] Added ProGuard rules for Capacitor and WebView
- [x] Configured signing for release builds

### 1.2 Create a Signed APK / AAB

#### Option A: Run the Setup Script (Recommended)
```bash
./setup-android-release.sh
```

#### Option B: Manual Setup
1. **Generate Keystore:**
```bash
keytool -genkey -v -keystore android/app/release-key.keystore -alias driplove-release -keyalg RSA -keysize 2048 -validity 10000
```

2. **Create `android/gradle.properties`:**
```properties
RELEASE_STORE_FILE=release-key.keystore
RELEASE_STORE_PASSWORD=your-password
RELEASE_KEY_ALIAS=driplove-release
RELEASE_KEY_PASSWORD=your-password
```

## ✅ STEP 2: Build Release AAB

### Quick Build
```bash
./build-android.sh
```
Choose option 3 for Release AAB.

### Manual Build
```bash
cd android
./gradlew bundleRelease
```

**Output Location:** `android/app/build/outputs/bundle/release/app-release.aab`

## ✅ STEP 3: Pre-Upload Checklist

### App Information
- [ ] **App Name:** DripLove
- [ ] **Package Name:** com.driplove.dating
- [ ] **Version Code:** 2
- [ ] **Version Name:** 1.1

### Required Assets
- [ ] App Icon (512x512 PNG)
- [ ] Feature Graphic (1024x500 PNG)
- [ ] Screenshots (at least 2, up to 8)
- [ ] App Description
- [ ] Privacy Policy URL
- [ ] Terms of Service URL

### Permissions Review
Check that your app only requests necessary permissions:
```xml
<!-- In android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<!-- Add only what you need -->
```

## ✅ STEP 4: Google Play Console Upload

### 4.1 Create App Listing
1. Go to [Google Play Console](https://play.google.com/console)
2. Create new app
3. Fill in app details:
   - App name: **DripLove**
   - Default language: **English (United States)**
   - App or game: **App**
   - Free or paid: **Free**

### 4.2 Upload AAB
1. Go to **Production** → **Releases**
2. Click **Create new release**
3. Upload your `app-release.aab` file
4. Add release notes
5. Review and rollout

### 4.3 Content Rating
1. Go to **Policy** → **Content rating**
2. Complete the questionnaire
3. Apply rating

### 4.4 Target Audience
1. Go to **Policy** → **Target audience**
2. Set age groups
3. Save

## ✅ STEP 5: Store Listing

### Required Information
- **App name:** DripLove
- **Short description:** (80 characters max)
- **Full description:** (4000 characters max)
- **App icon:** 512x512 PNG
- **Feature graphic:** 1024x500 PNG
- **Phone screenshots:** At least 2 (16:9 or 9:16 ratio)
- **Privacy Policy URL:** Required for dating apps
- **App category:** Dating
- **Content rating:** Mature 17+

### Screenshots Requirements
- **Minimum:** 2 screenshots
- **Maximum:** 8 screenshots
- **Format:** PNG or JPEG
- **Dimensions:** 16:9 or 9:16 aspect ratio
- **Minimum dimension:** 320px
- **Maximum dimension:** 3840px

## ✅ STEP 6: App Review Requirements

### For Dating Apps
- [ ] Age verification (if applicable)
- [ ] Clear privacy policy
- [ ] User safety features
- [ ] Content moderation policies
- [ ] Report/block functionality

### Technical Requirements
- [ ] App crashes less than 2% (ANR rate < 0.5%)
- [ ] Target API level 33 (Android 13) or higher
- [ ] 64-bit support
- [ ] App Bundle format (AAB)

## ✅ STEP 7: Release Process

### Internal Testing (Optional)
1. Upload AAB to **Internal testing**
2. Add test users
3. Test core functionality

### Production Release
1. Upload final AAB to **Production**
2. Complete all policy requirements
3. Submit for review
4. Monitor rollout

## 🔧 Build Commands Quick Reference

```bash
# Setup signing (one-time)
./setup-android-release.sh

# Build release AAB
./build-android.sh
# Choose option 3

# Or manually:
cd android && ./gradlew bundleRelease

# Debug build for testing
cd android && ./gradlew assembleDebug
```

## 📱 Testing Before Release

### Essential Tests
- [ ] App launches successfully
- [ ] Core features work (login, matching, chat)
- [ ] No crashes on different devices
- [ ] Push notifications work
- [ ] Deep links work
- [ ] App permissions are reasonable

### Performance Tests
- [ ] App starts in < 3 seconds
- [ ] Smooth scrolling and animations
- [ ] Reasonable memory usage
- [ ] Battery usage is optimized

## 🚨 Important Security Notes

1. **Keep your keystore safe!** You'll need it for all future updates
2. **Backup your `gradle.properties`** with signing credentials
3. **Never commit keystore or credentials to git**
4. **Store passwords securely** (password manager recommended)

## 📞 Support

If you encounter issues:
1. Check Android logs: `adb logcat`
2. Verify AAB with: `bundletool validate --bundle=app-release.aab`
3. Test on different devices and Android versions

## 🎉 After Release

- [ ] Monitor crash reports in Play Console
- [ ] Respond to user reviews
- [ ] Track app performance metrics
- [ ] Plan for updates and new features

---

**Last Updated:** August 6, 2025  
**App Version:** 1.1 (Build 2)
