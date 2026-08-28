import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.driplove.dating',
  appName: 'DripLove',
  webDir: 'dist',
  // Transparent background is required on iOS for native CameraPreview with toBack:true
  // (otherwise the WKWebView paints an opaque layer and the camera appears "blank").
  backgroundColor: '#00000000',
  server: {
    // Matches the real production domain so iOS Associated Domains
    // (Password AutoFill, Universal Links) can recognize the WKWebView's
    // origin as www.driplove.love instead of the synthetic capacitor://localhost.
    hostname: 'www.driplove.love',
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: true,
    // Performance optimizations
    allowNavigation: [
      'https://*.supabase.co',
      'https://*.supabase.io',
      'https://accounts.google.com',
      'https://oauth.googleusercontent.com'
    ]
  },
  ios: {
    scrollEnabled: true,
    // Performance optimizations for iOS
    preferredContentMode: 'mobile',
    // Ensure WKWebView itself is transparent (needed for CameraPreview toBack:true)
    // Capacitor typings may not include this, but Capacitor will still read it.
    webView: {
      backgroundColor: '#00000000'
    } as any,
    backgroundColor: '#00000000'
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Performance optimizations for Android WebView
    // Transparent background is required for native CameraPreview with toBack:true
    backgroundColor: '#00000000',
    // Enable hardware acceleration
    hardwareAccelerated: true,
    // Optimize WebView loading
    useLegacyBridge: false,
    // Improve scrolling performance
    overscrollHistoryNavigation: false,
    // Optimize for modern Android (SDK 26+)
    mixedContentMode: 0,
    // Enhanced Android WebView performance settings
    loggingBehavior: 'none',
    // Enable WebView cache and storage for better performance
    appendUserAgent: 'DripLove-Android',
    // Additional performance optimizations
    minWebViewVersion: '92.0.0.0' // Require modern WebView for better performance
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
    // StatusBar config removed - @capacitor/status-bar is replaced by
    // @capacitor-community/safe-area (see src/main.tsx), which handles system
    // bar styling and makes env(safe-area-inset-*) reliable on Android too.
    Keyboard: {
      // Prevent native viewport resize; we handle layout manually in JS
      resize: 'none',
      style: 'dark'
      // resizeOnFullScreen intentionally omitted - @capacitor-community/safe-area
      // requires this to be unset/false or it fights the plugin's own
      // keyboard-resize handling that useChatKeyboardFix relies on.
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
      'android-minSdkVersion': '26',
      BackupWebStorage: 'none',
      SplashMaintainAspectRatio: 'true',
      FadeSplashScreenDuration: '300',
      SplashShowOnlyFirstTime: 'false',
      SplashScreen: 'screen',
      SplashScreenDelay: '0',
      // Android performance optimizations
      'android-hardwareAccelerated': 'true',
      'android-windowSoftInputMode': 'adjustResize'
    }
  }
};

export default config;
