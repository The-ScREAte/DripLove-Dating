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
      'https://oauth.googleusercontent.com',
      // Stripe Elements (advertiser card collection) - without these, the
      // native WebView blocks every request to Stripe's domains outright
      // (confirmed via a direct fetch() test: supabase.co and google.com
      // succeeded, js.stripe.com/api.stripe.com both failed with "Failed to
      // fetch"), so the card form's script never loads and never times out
      // with a visible error - it just silently never renders.
      'https://*.stripe.com'
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
    },
    // Screenshot/screen-recording protection. OFF by default at launch
    // (landing/auth/registration/profile-completion - everything Index.tsx
    // renders before MainApp mounts - stay screenshot-able), turned ON for
    // the whole logged-in app experience by MainApp.tsx calling
    // PrivacyScreen.enable() on mount / .disable() on unmount. Individual
    // screens inside that should still be exempt (Profile, the mini-games)
    // call .disable() for as long as they're showing, restoring the
    // logged-in baseline on unmount - see src/hooks/useAllowScreenshots.ts.
    //
    // Android: FLAG_SECURE - the OS refuses to capture the window at all
    // (screenshot AND recording), no further app code needed, works in the
    // Simulator/emulator exactly like a real device.
    //
    // iOS has no OS-level flag; preventScreenshots implements the same
    // outcome via the well-known secure-UITextField-layer technique
    // (re-parenting the app window's CALayer under a secure text field, so
    // iOS's own capture pipeline excludes it - see PrivacyScreen.swift,
    // configurePreventionScreenshot). This previously caused a blank white
    // screen at launch because the original plugin code reparented the
    // window layer *before* the secure field had actually been marked
    // secure (UIKit only builds its special secure rendering sublayers once
    // isSecureTextEntry is true and the field has had a layout pass) - see
    // the patch in patches/@capacitor-community+privacy-screen+6.1.0.patch
    // for the ordering fix. Only verifiable on a real device: the iOS
    // Simulator's screenshot/recording tools capture the framebuffer
    // directly and do not route through the real capture pipeline this
    // technique hooks into, so testing here can only confirm the app still
    // renders normally, not that a screenshot actually comes out blank.
    //
    // The plugin's own background/app-switcher "privacy cover" (a full-screen
    // view shown whenever the app resigns active, e.g. opening the App
    // Switcher) is back on (re-enabled in the patch) after real-device
    // testing showed real content visible/capturable there - the earlier
    // "keep content visible, rely on capture-time block alone" decision is
    // reversed. It's presented via a direct, synchronous UIView insertion
    // (not the original's UIViewController presentation behind a
    // DispatchQueue.main.async) specifically so it lands in the same
    // run-loop pass the App Switcher snapshot is taken in - see
    // handleWillResignActiveNotification in PrivacyScreen.swift. It's
    // automatically post-login-only via the same `isEnabled` flag enable()/
    // disable() already maintain, no separate auth check needed.
    //
    // screenshotTaken/screenRecordingStarted additionally drive an in-app
    // "Screen capture blocked" message - see
    // src/components/ScreenCaptureBlockedOverlay.tsx (gated on
    // isAuthenticated so it can't fire on the landing/login page, where
    // protection was never actually on) - the same pattern apps like
    // WhatsApp use on top of their own capture block.
    //
    // enable()/disable() are called from src/pages/Index.tsx the instant
    // isAuthenticated changes (src/utils/privacyScreenBridge.ts), not from
    // MainApp.tsx's mount - MainApp is lazy-loaded, so waiting on it added a
    // real, user-visible gap where content was on screen and screenshot-able
    // before protection engaged. MainApp keeps its own enable/disable-on-
    // mount/unmount as a harmless (idempotent) defensive backup.
    //
    // Web has no equivalent of either mechanism - no browser API can block
    // or reliably detect a screenshot/recording at all, native-only.
    PrivacyScreen: {
      enable: false,
      preventScreenshots: true // iOS only - see note above
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
