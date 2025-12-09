import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.driplove.dating',
  appName: 'DripLove',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Performance optimizations
    allowNavigation: [
      'https://*.supabase.co',
      'https://*.supabase.io',
      'https://accounts.google.com',
      'https://oauth.googleusercontent.com'
    ]
  },
  ios: {
    scheme: 'driplove',
    scrollEnabled: true,
    // Performance optimizations for iOS
    preferredContentMode: 'mobile'
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Performance optimizations for Android WebView
    backgroundColor: '#ffffff',
    // Enable hardware acceleration
    hardwareAccelerated: true,
    // Optimize WebView loading
    useLegacyBridge: false,
    // Improve scrolling performance
    overscrollHistoryNavigation: false,
    // Optimize for modern Android
    mixedContentMode: 0,
    // Enhanced Android WebView performance settings
    loggingBehavior: 'none',
    // Enable WebView cache and storage for better performance
    appendUserAgent: 'DripLove-Android'
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '361835962012-i85negkabf06fei55t34jh2gav0t56g6.apps.googleusercontent.com',
      forceCodeForRefreshToken: true
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "banner"]
    },
    StatusBar: {
      style: 'default',
      overlaysWebView: true
    },
    Keyboard: {
      // Prevent native viewport resize; we handle layout manually in JS
      resize: 'none',
      style: 'dark',
      resizeOnFullScreen: true
    },
    Browser: {
      // Safari View Controller configuration for iOS (for in-app OAuth)
      // This satisfies Apple's Guideline 4.0 by keeping users in-app during authentication
      toolbarColor: '#000000',
      // Enable Safari View Controller on iOS (in-app browser)
      presentationStyle: 'popover',
      // Android in-app WebView configuration
      // androidToolbarColor: '#000000',
      // Keep users in-app on Android with fullscreen modal
      windowName: '_blank'
    },
    // Performance monitoring
    CapacitorHttp: {
      enabled: true
    }
  },
  cordova: {
    preferences: {
      ScrollEnabled: 'false',
      'android-minSdkVersion': '22',
      BackupWebStorage: 'none',
      SplashMaintainAspectRatio: 'true',
      FadeSplashScreenDuration: '300',
      SplashShowOnlyFirstTime: 'false',
      SplashScreen: 'screen',
      SplashScreenDelay: '0'
    }
  }
};

export default config;
