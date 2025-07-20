import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.driplove.dating',
  appName: 'DripLove Dating',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Performance optimizations
    allowNavigation: [
      'https://*.supabase.co',
      'https://*.supabase.io'
    ]
  },
  ios: {
    scheme: 'DripLove Dating',
    contentInset: 'automatic',
    scrollEnabled: true,
    // Performance optimizations for iOS
    preferredContentMode: 'mobile',
    // Handle safe areas properly
    handleUrlScheme: true
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false, // Disable in production for performance
    // Performance optimizations for Android
    loggingBehavior: 'none',
    // Memory optimizations
    allowBackup: false,
    // Network optimizations
    useCleartext: false
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    StatusBar: {
      style: 'default',
      backgroundColor: '#ffffff',
      overlaysWebView: true
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    },
    // Performance monitoring
    CapacitorHttp: {
      enabled: true
    }
  },
  // Build optimizations
  bundledWebRuntime: false // Use system WebView for better performance
};

export default config;
