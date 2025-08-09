# 📋 Google Play Store Deployment Checklist

## ✅ Pre-Upload Requirements

### App Configuration
- [ ] **App ID**: `com.driplove.dating` ✅
- [ ] **Version Code**: 2 ✅ 
- [ ] **Version Name**: 1.1 ✅
- [ ] **Target SDK**: 34 (Android 14) ✅
- [ ] **Min SDK**: 22 (Android 5.1) ✅

### Build Configuration
- [ ] **Release build type** configured ✅
- [ ] **Keystore** generated and configured ✅
- [ ] **Code obfuscation** enabled (minifyEnabled: false - OK for initial release)
- [ ] **App signing** configured ✅

### App Content
- [ ] **App icons** present (check android/app/src/main/res/mipmap-*)
- [ ] **App name** set: "DripLove Dating" ✅
- [ ] **Permissions** properly declared in AndroidManifest.xml ✅

### Google Play Console Setup
- [ ] **Developer account** created and verified
- [ ] **App created** in Play Console
- [ ] **Store listing** completed:
  - [ ] App description
  - [ ] Screenshots (phone, tablet, maybe TV)
  - [ ] App icon (512x512 PNG)
  - [ ] Feature graphic (1024x500 PNG)
  - [ ] Privacy policy URL
  - [ ] Contact information

### Security & Privacy
- [ ] **Data safety** section completed in Play Console
- [ ] **Privacy policy** published and accessible
- [ ] **OAuth callback URLs** properly configured
- [ ] **Deep links** tested and working
- [ ] **Push notifications** working (Firebase integration)

### Testing
- [ ] **Internal testing** track set up
- [ ] **App tested** on different Android versions
- [ ] **Core functionality** verified:
  - [ ] User registration/login
  - [ ] Profile creation
  - [ ] Image upload
  - [ ] Matching system
  - [ ] Chat functionality
  - [ ] Push notifications
  - [ ] Payment processing (if applicable)

### Legal & Compliance
- [ ] **Content rating** completed
- [ ] **Target audience** defined
- [ ] **App content** complies with Play Store policies
- [ ] **Age verification** implemented (18+ dating app)

## 🚀 Upload Steps

1. **Build signed AAB**:
   ```bash
   ./build-android.sh
   # Choose option 3
   ```

2. **Locate your AAB file**:
   `android/app/build/outputs/bundle/release/app-release.aab`

3. **Upload to Play Console**:
   - Go to Play Console > Your App > Release > Production
   - Create new release
   - Upload your AAB file
   - Fill out release notes
   - Review and publish

## 📋 Common Issues & Solutions

### Build Issues
- **Keystore not found**: Run `./setup-android-release.sh`
- **Gradle sync failed**: Clean project and rebuild
- **Missing permissions**: Check AndroidManifest.xml

### Play Store Issues
- **App not eligible**: Complete all required sections
- **Content policy violation**: Review dating app guidelines
- **Technical requirements**: Ensure target SDK compliance

## 🔒 Security Notes

- **Never commit keystore files** to version control
- **Keep keystore passwords secure** - store them safely
- **Use app signing by Google Play** for additional security
- **Enable Play Protect** verification

## 📱 Post-Release

- [ ] **Monitor crash reports** in Play Console
- [ ] **Check user reviews** and respond appropriately
- [ ] **Set up release tracks** (internal, alpha, beta, production)
- [ ] **Plan update cycle** for bug fixes and features
