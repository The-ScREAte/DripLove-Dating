// Firebase service worker for background push notifications
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

// Same config as main app - keep in sync with src/config/firebase.ts
const firebaseConfig = {
  apiKey: "AIzaSyBK9QJ8X-example", // Replace with your Firebase API key
  authDomain: "dataing-buddy-auth-hub.firebaseapp.com", // Replace with your domain
  projectId: "dataing-buddy-auth-hub", // Replace with your project ID
  storageBucket: "dataing-buddy-auth-hub.firebasestorage.app", // Replace with your storage bucket
  messagingSenderId: "123456789", // Replace with your sender ID
  appId: "1:123456789:web:example" // Replace with your app ID
};

// Initialize Firebase in service worker
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Handle background messages
onBackgroundMessage(messaging, (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  const notificationTitle = payload.notification?.title || 'New notification';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: payload.data
  };

  // Show notification
  self.registration.showNotification(notificationTitle, notificationOptions);
});
