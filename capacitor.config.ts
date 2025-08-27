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
    contentInset: 'automatic',
    scrollEnabled: true,
    // Performance optimizations for iOS
    preferredContentMode: 'mobile'
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false
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
  cordova: {
    preferences: {
      ScrollEnabled: 'false',
      'android-minSdkVersion': '22',
      BackupWebStorage: 'none',
      SplashMaintainAspectRatio: 'true',
      FadeSplashScreenDuration: '300',
      SplashShowOnlyFirstTime: 'false',
      SplashScreen: 'screen',
      SplashScreenDelay: '3000'
    }
  }
};

export default config;
