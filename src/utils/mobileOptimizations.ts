// Mobile-specific optimizations for iOS and Android

// 1. iOS/Android specific styles
export const mobileStyles = {
  // Prevent zoom on input focus (iOS)
  preventZoom: {
    fontSize: '16px', // iOS doesn't zoom if font-size >= 16px
    transform: 'scale(1)', // Prevent zoom with transform
  },
  
  // Smooth scrolling for mobile
  smoothScroll: {
    WebkitOverflowScrolling: 'touch',
    overflowScrolling: 'touch',
  },
  
  // Optimize touch targets
  touchTarget: {
    minHeight: '44px', // iOS recommended minimum
    minWidth: '44px',
  },
  
  // Safe area handling
  safeArea: {
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    paddingLeft: 'env(safe-area-inset-left)',
    paddingRight: 'env(safe-area-inset-right)',
  }
};

// 2. Image optimization for mobile
export const mobileImageConfig = {
  // Lazy loading intersection observer options
  intersectionOptions: {
    rootMargin: '50px',
    threshold: 0.1,
  },
  
  // Image compression settings
  compressionOptions: {
    quality: 0.8,
    maxWidth: 400,
    maxHeight: 600,
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
  ProfileCompletionForm: () => import('../components/ProfileCompletionForm'),
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

// 7. Touch/Swipe optimizations
export const touchOptimization = {
  // Passive event listeners for better scroll performance
  passiveOptions: { passive: true },
  
  // Touch delay reduction
  fastClick: {
    touchAction: 'manipulation',
  },
  
  // Swipe thresholds
  swipeThreshold: {
    distance: 50,
    velocity: 0.3,
  }
};

// 8. Android-specific optimizations
export const androidOptimizations = {
  // Hardware acceleration
  willChange: 'transform',
  transform: 'translateZ(0)',
  
  // Reduce overdraw
  backgroundColor: 'transparent',
  
  // Optimize text rendering
  textRendering: 'optimizeSpeed',
  fontDisplay: 'swap',
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
