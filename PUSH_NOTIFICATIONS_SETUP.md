# Push Notifications Setup Guide

## 🔥 Firebase Setup Required

To enable push notifications, you need to set up Firebase Cloud Messaging (FCM). Follow these steps:

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" 
3. Enter project name: `dataing-buddy-auth-hub`
4. Follow the setup wizard

### 2. Get Firebase Configuration
1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll down to "Your apps" section
3. Click "Add app" → Web app (</>) 
4. Register app name: `dataing-buddy-auth-hub`
5. Copy the `firebaseConfig` object

### 3. Enable Cloud Messaging
1. In Firebase Console, go to **Cloud Messaging** in left sidebar
2. Click "Get started" if prompted
3. Go to **Project Settings** → **Cloud Messaging** tab
4. Copy the "Server key" and "Web Push certificates" VAPID key

### 4. Configure the App
Replace the placeholder values in `src/config/firebase.ts` with your actual Firebase config:

```typescript
const firebaseConfig = {
  apiKey: "your-api-key-from-firebase",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id", 
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

And replace the VAPID key:
```typescript
vapidKey: 'your-vapid-key-from-cloud-messaging'
```

### 5. Test Push Notifications
Once configured, you can test push notifications in the admin panel or by triggering events like:
- New matches
- New messages  
- Image approvals
- System notifications

## 📱 Mobile App Support
The system supports both web (Firebase) and native mobile (Capacitor) push notifications automatically.

## 🔧 Current Features
- ✅ Web push notifications (Firebase FCM)
- ✅ Native mobile push notifications (Capacitor)
- ✅ Admin notification sending
- ✅ Automatic match/message/like notifications
- ✅ Foreground notification display
- ✅ Background notification handling