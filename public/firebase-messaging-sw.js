// Firebase service worker for background push notifications
// Service workers must use importScripts, not ES6 imports

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Same config as main app - keep in sync with src/config/firebase.ts
const firebaseConfig = {
  apiKey: "AIzaSyDummy-ForTesting-ReplaceWithReal", // Replace with your real Firebase API key
  authDomain: "your-project.firebaseapp.com", // Replace with your real domain
  projectId: "your-project-id", // Replace with your real project ID
  storageBucket: "your-project.firebasestorage.app", // Replace with your real storage bucket
  messagingSenderId: "123456789", // Replace with your real sender ID
  appId: "1:123456789:web:abcd1234" // Replace with your real app ID
};

// Initialize Firebase in service worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
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
