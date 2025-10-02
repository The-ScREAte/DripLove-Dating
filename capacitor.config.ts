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
    webContentsDebuggingEnabled: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    StatusBar: {
      style: 'default',
      overlaysWebView: true
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    },
    Browser: {
      // Safari View Controller configuration for iOS
      toolbarColor: '#000000',
      // Enable Safari View Controller on iOS
      presentationStyle: 'popover'
    },
    // Performance monitoring
    CapacitorHttp: {
      enabled: true
    },
    // Apple Sign-In configuration - FORCE use of Services ID instead of App ID
    SignInWithApple: {
      // This should force the plugin to use Services ID instead of App ID
      clientId: 'com.driplove.dating.signin'
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
