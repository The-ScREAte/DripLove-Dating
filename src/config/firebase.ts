// Firebase configuration for push notifications
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, Messaging, MessagePayload } from 'firebase/messaging';

// Your Firebase config - You'll need to replace these with your actual values
// Get these from: https://console.firebase.google.com -> Project Settings -> General tab
const firebaseConfig = {
  apiKey: "your-api-key-here",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

// Initialize Firebase
let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

export const initializeFirebase = async () => {
  try {
    // Check if Firebase Messaging is supported
    const supported = await isSupported();
    if (!supported) {
      console.log('🚫 Firebase Messaging not supported on this browser');
      return null;
    }

    if (!app) {
      app = initializeApp(firebaseConfig);
      messaging = getMessaging(app);
      console.log('🔥 Firebase initialized successfully');
    }
    
    return messaging;
  } catch (error) {
    console.error('❌ Error initializing Firebase:', error);
    return null;
  }
};

export const getFirebaseToken = async (): Promise<string | null> => {
  try {
    if (!messaging) {
      await initializeFirebase();
    }

    if (!messaging) return null;

    // Request permission and get token
    const token = await getToken(messaging, {
      vapidKey: 'your-vapid-key-here' // You'll need to generate this in Firebase Console
    });

    if (token) {
      console.log('🔑 Firebase token generated:', token);
      return token;
    } else {
      console.log('⚠️ No registration token available');
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting Firebase token:', error);
    return null;
  }
};

export const setupFirebaseMessageListener = (callback: (payload: MessagePayload) => void) => {
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    console.log('📨 Firebase message received in foreground:', payload);
    callback(payload);
  });
};

export { messaging };
