// Firebase configuration for push notifications
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, Messaging, MessagePayload } from 'firebase/messaging';

// Your Firebase config - You'll need to replace these with your actual values
// Get these from: https://console.firebase.google.com -> Project Settings -> General tab
const firebaseConfig = {
  apiKey: "AIzaSyDummy-ForTesting-ReplaceWithReal", // Replace with your real Firebase API key
  authDomain: "your-project.firebaseapp.com", // Replace with your real domain
  projectId: "your-project-id", // Replace with your real project ID
  storageBucket: "your-project.firebasestorage.app", // Replace with your real storage bucket
  messagingSenderId: "123456789", // Replace with your real sender ID
  appId: "1:123456789:web:abcd1234" // Replace with your real app ID
};

// Initialize Firebase
let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

export const initializeFirebase = async () => {
  try {
    // Check if config is properly set (not placeholder values)
    if (firebaseConfig.apiKey.includes('Dummy') || firebaseConfig.projectId === 'your-project-id') {
      console.log('🚫 Firebase not configured - using placeholder values');
      return null;
    }

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
    // Check if config is properly set
    if (firebaseConfig.apiKey.includes('Dummy') || firebaseConfig.projectId === 'your-project-id') {
      console.log('🚫 Firebase token not available - configuration required');
      return null;
    }

    if (!messaging) {
      await initializeFirebase();
    }

    if (!messaging) return null;

    // Check if VAPID key is configured
    if (firebaseConfig.apiKey.includes('dummy') || !firebaseConfig.apiKey.startsWith('AIza')) {
      console.log('🚫 Invalid Firebase API key - check configuration');
      return null;
    }

    // Request permission and get token
    const token = await getToken(messaging, {
      vapidKey: 'BCdummy-vapid-key-replace-with-real' // Replace with your real VAPID key from Firebase Console
    });

    if (token) {
      console.log('🔑 Firebase token generated:', token);
      return token;
    } else {
      console.log('⚠️ No registration token available - permission may be denied');
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
