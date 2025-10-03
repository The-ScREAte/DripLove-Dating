// Mobile-specific optimizations for iOS and Android

// 1. iOS/Android specific styles with comprehensive safe area and touch support
export const mobileStyles = {
  // Prevent zoom on input focus (iOS) and optimize for Android
  preventZoom: {
    fontSize: '16px', // iOS doesn't zoom if font-size >= 16px
    transform: 'scale(1)', // Prevent zoom with transform
    WebkitTextSizeAdjust: '100%', // Prevent text scaling on Android
    textSizeAdjust: '100%',
  },
  
  // Smooth scrolling for both iOS and Android
  smoothScroll: {
    WebkitOverflowScrolling: 'touch',
    scrollBehavior: 'smooth',
    overscrollBehavior: 'contain', // Prevent bounce scrolling on Android
  },
  
  // Optimize touch targets for both platforms
  touchTarget: {
    minHeight: '48px', // Android accessibility minimum (48dp)
    minWidth: '48px',  // iOS minimum is 44px, Android 48px covers both
    padding: '12px',   // Adequate touch padding
  },
  
  // No safe area handling - let browser handle it naturally
  safeArea: {
    paddingTop: '0px',
    paddingBottom: '0px', 
    paddingLeft: '0px',
    paddingRight: '0px',
  },
};

// 2. Image optimization for mobile
export const mobileImageConfig = {
  // Lazy loading intersection observer options
  intersectionOptions: {
    rootMargin: '50px',
    threshold: 0.1,
  },
  
  // Image compression settings - ULTRA OPTIMIZED FOR SPEED
  compressionOptions: {
    quality: 0.55,
    maxWidth: 300,
    maxHeight: 450,
    format: 'webp',
  },
  
  // Preload critical images
  preloadCritical: true,
  preloadCount: 2,
};

// 3. Network optimization
export const networkOptimization = {
  // Batch requests to reduce network calls
  batchSize: 10,
  debounceDelay: 300,
  
  // Retry logic for failed requests
  maxRetries: 3,
  retryDelay: 1000,
  
  // Cache configuration
  cacheTimeout: 5 * 60 * 1000, // 5 minutes
};

// 4. Performance monitoring
export const trackPerformance = (metricName: string, value: number) => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    // Use Performance API to track custom metrics
    performance.mark(`${metricName}-${value}`);
  }
};

// 5. Bundle size optimization
export const lazyLoadComponents = {
  // Components that should be lazy loaded
  AdminPage: () => import('../components/AdminPage'),
  ProfileCompletionPage: () => import('../components/ProfileCompletionPage'),
  PremiumUpgrade: () => import('../components/PremiumUpgrade'),
  UserProfileModal: () => import('../components/UserProfileModal'),
};

// 6. Memory optimization
export const memoryOptimization = {
  // Clear unused data
  clearImageCache: () => {
    // Implementation to clear image cache
    if ('caches' in window) {
      caches.delete('image-cache');
    }
  },
  
  // Garbage collection helper
  forceGC: () => {
    if (window.gc) {
      window.gc();
    }
  },
  
  // Monitor memory usage
  getMemoryUsage: () => {
    if ('memory' in performance) {
      return (performance as any).memory;
    }
    return null;
  }
};

// 7. Touch/Swipe optimizations for Android & iOS
export const touchOptimization = {
  // Passive event listeners for better scroll performance
  passiveOptions: { passive: true },
  
  // Touch delay reduction (especially important for Android)
  fastClick: {
    touchAction: 'manipulation',
  },
  
  // Swipe thresholds optimized for both platforms
  swipeThreshold: {
    distance: 50,
    velocity: 0.3,
  },
  
  // Android-specific touch improvements
  androidTouch: {
    // Minimum touch target size (Android accessibility guidelines)
    minHeight: '48dp', // 48dp = 48px at 1x density
    minWidth: '48dp',
    
    // Touch feedback
    androidRipple: true,
    touchFeedback: {
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
      duration: '150ms',
    },
    
    // Prevent text selection on touch
    userSelect: 'none',
    WebkitUserSelect: 'none',
    
    // Prevent touch highlighting
    WebkitTapHighlightColor: 'transparent',
    tapHighlightColor: 'transparent',
  },
};

// 8. Minimal optimizations - no Android-specific code
export const optimizations = {
  // Basic performance optimizations
  willChange: 'transform',
  transform: 'translateZ(0)',
  
  // Touch responsiveness
  minTouchTarget: '44px',
  touchAction: 'manipulation',
  
  // No safe area handling
  safeAreaSupport: {
    paddingTop: '0px',
    paddingBottom: '0px', 
    paddingLeft: '0px',
    paddingRight: '0px',
  },
  
  // Android gesture navigation support
  gestureNavigation: {
    height: '20px', // Android 10+ gesture area
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    zIndex: '9999',
  },
  
  // Performance optimizations for Android WebView
  webViewOptimizations: {
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'pan-x pan-y',
  },
};

// 9. iOS-specific optimizations
export const iosOptimizations = {
  // Prevent rubber band scrolling
  overscrollBehavior: 'none',
  
  // Optimize for iPhone notch
  viewportFit: 'cover',
  
  // Metal rendering optimization
  isolation: 'isolate',
};
