# 🔥 Firebase Setup Guide for Push Notifications

## 📋 Quick Setup Checklist

### ✅ Already Completed
- [x] Firebase SDK installed (`npm install firebase`)
- [x] Firebase configuration file created (`src/config/firebase.ts`)
- [x] Service worker for background notifications (`public/firebase-messaging-sw.js`)
- [x] Updated push notification service to support Firebase
- [x] Capacitor Push Notifications plugin installed

### 🚀 Steps to Complete Setup

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project"
3. Enter project name (e.g., "dataing-buddy-auth-hub")
4. Enable Google Analytics (optional)
5. Create project

## Step 2: Add Web App to Firebase Project

1. In your Firebase project, click the **Web** icon (`</>`)
2. Enter app nickname: "Dataing Buddy Web"
3. Check "Also set up Firebase Hosting" (optional)
4. Click "Register app"
5. **Copy the Firebase config object** - you'll need this!

## Step 3: Enable Cloud Messaging

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Click on **Cloud Messaging** tab
3. Under **Web configuration**, click **Generate key pair**
4. **Copy the VAPID key** - you'll need this!

## Step 4: Update Firebase Configuration

Replace the placeholder values in `/src/config/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "your-project-id.firebaseapp.com", 
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

And update the VAPID key:
```typescript
const token = await getToken(messaging, {
  vapidKey: 'YOUR_ACTUAL_VAPID_KEY'
});
```

## Step 5: Update Service Worker

Update `/public/firebase-messaging-sw.js` with the same Firebase config.

## Step 6: For Native Apps (iOS/Android)

### Android Setup
1. In Firebase Console, click **Add app** → **Android**
2. Enter package name from `android/app/build.gradle` (e.g., `com.datingbuddy.app`)
3. Download `google-services.json`
4. Place file in `android/app/google-services.json`
5. Run: `npx cap sync android`

### iOS Setup  
1. In Firebase Console, click **Add app** → **iOS**
2. Enter bundle ID from `ios/App/App/Info.plist`
3. Download `GoogleService-Info.plist`
4. Add file to `ios/App/App/` directory in Xcode
5. Run: `npx cap sync ios`

## Step 7: Apply Database Migration

The push tokens table is ready but needs to be applied:

```sql
-- Apply this migration to your Supabase database
-- File: supabase/migrations/20250714_add_push_tokens.sql
```

## Step 8: Update Edge Function

Update `/supabase/functions/send-push-notification/index.ts` to actually send Firebase notifications instead of just logging.

## 🧪 Testing Your Setup

### Web Testing
1. Open your app in browser (HTTPS required for production)
2. Go to Profile → Push Notifications
3. Check if Firebase token is generated
4. Test notification buttons

### Mobile Testing
1. Build and install on device:
   ```bash
   npm run build
   npx cap sync ios/android
   npx cap open ios/android
   ```
2. Check notification permissions
3. Test push notifications

## 🔍 Troubleshooting

### Common Issues

**"Firebase not supported"**
- Ensure you're using HTTPS (required for service workers)
- Check browser compatibility

**"Permission denied"**
- User needs to manually grant notification permission
- Check browser notification settings

**"No token generated"**
- Verify Firebase config is correct
- Check VAPID key is valid
- Ensure service worker is registered

**Native app not receiving notifications**
- Verify `google-services.json` / `GoogleService-Info.plist` are in correct locations
- Check Firebase project has the correct package/bundle IDs
- Ensure Capacitor sync was run after adding config files

## 📊 Current Status

- ✅ **Web**: Firebase integration ready (needs config)
- ✅ **Android**: Capacitor ready (needs `google-services.json`)
- ✅ **iOS**: Capacitor ready (needs `GoogleService-Info.plist`)
- ✅ **Backend**: Edge function ready (needs FCM integration)
- ✅ **Database**: Migration ready (needs to be applied)

## 🎯 Next Steps

1. Complete Firebase project setup
2. Update configuration files with real values
3. Test on web and mobile devices
4. Apply database migration  
5. Integrate real push sending in Edge Function

Once these steps are complete, you'll have full push notification support across web and mobile! 🚀
