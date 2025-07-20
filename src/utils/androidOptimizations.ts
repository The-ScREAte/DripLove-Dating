// Android-specific utilities for DripLove Dating App
// Ensures consistent safe areas, touch targets, and smooth scrolling

import { androidOptimizations, touchOptimization, mobileStyles } from './mobileOptimizations';

/**
 * Detects if the app is running on Android
 */
export const isAndroid = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /android/.test(userAgent);
};

/**
 * Detects Android version for specific optimizations
 */
export const getAndroidVersion = (): number | null => {
  if (!isAndroid()) return null;
  
  const match = window.navigator.userAgent.match(/Android (\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
};

/**
 * Applies Android-specific optimizations to DOM elements
 */
export const applyAndroidOptimizations = (element: HTMLElement): void => {
  if (!isAndroid()) return;
  
  // Apply safe area styles
  Object.assign(element.style, {
    paddingTop: androidOptimizations.safeAreaSupport.paddingTop,
    paddingBottom: androidOptimizations.safeAreaSupport.paddingBottom,
    paddingLeft: androidOptimizations.safeAreaSupport.paddingLeft,
    paddingRight: androidOptimizations.safeAreaSupport.paddingRight,
  });
  
  // Apply touch optimizations
  Object.assign(element.style, {
    touchAction: androidOptimizations.touchAction,
    WebkitUserSelect: androidOptimizations.webViewOptimizations.WebkitUserSelect,
    WebkitTouchCallout: androidOptimizations.webViewOptimizations.WebkitTouchCallout,
    WebkitTapHighlightColor: androidOptimizations.webViewOptimizations.WebkitTapHighlightColor,
  });
  
  // Apply performance optimizations
  Object.assign(element.style, {
    transform: androidOptimizations.transform,
    willChange: androidOptimizations.willChange,
  });
};

/**
 * Ensures touch targets meet Android accessibility guidelines (48dp minimum)
 */
export const ensureAndroidTouchTargets = (element: HTMLElement): void => {
  if (!isAndroid()) return;
  
  const computedStyle = window.getComputedStyle(element);
  const height = parseInt(computedStyle.height);
  const width = parseInt(computedStyle.width);
  
  // Android minimum touch target is 48dp (48px at 1x density)
  if (height < 48) {
    element.style.minHeight = '48px';
    element.style.paddingTop = element.style.paddingTop || '12px';
    element.style.paddingBottom = element.style.paddingBottom || '12px';
  }
  
  if (width < 48) {
    element.style.minWidth = '48px';
    element.style.paddingLeft = element.style.paddingLeft || '12px';
    element.style.paddingRight = element.style.paddingRight || '12px';
  }
};

/**
 * Applies smooth scrolling optimizations for Android
 */
export const enableAndroidSmoothScrolling = (element: HTMLElement): void => {
  if (!isAndroid()) return;
  
  Object.assign(element.style, {
    WebkitOverflowScrolling: 'touch',
    scrollBehavior: 'smooth',
    overscrollBehavior: 'contain',
  });
  
  // Add passive event listeners for better scroll performance
  element.addEventListener('touchstart', () => {}, { passive: true });
  element.addEventListener('touchmove', () => {}, { passive: true });
  element.addEventListener('scroll', () => {}, { passive: true });
};

/**
 * Sets up Android gesture navigation support
 */
export const setupAndroidGestureNavigation = (): void => {
  if (!isAndroid()) return;
  
  const androidVersion = getAndroidVersion();
  if (!androidVersion || androidVersion < 10) return; // Gesture nav introduced in Android 10
  
  // Add CSS custom properties for gesture navigation
  document.documentElement.style.setProperty('--android-gesture-height', '20px');
  
  // Ensure content doesn't overlap with gesture area
  const body = document.body;
  if (body) {
    body.style.paddingBottom = 'max(env(safe-area-inset-bottom), 20px)';
  }
};

/**
 * Comprehensive Android setup function
 * Call this once when the app initializes on Android
 */
export const initializeAndroidOptimizations = (): void => {
  if (!isAndroid()) return;
  
  console.log('🤖 Initializing Android optimizations for DripLove...');
  
  // Set up gesture navigation
  setupAndroidGestureNavigation();
  
  // Apply global Android styles
  const root = document.documentElement;
  if (root) {
    // Android-specific CSS custom properties
    root.style.setProperty('--android-status-bar-height', '24px');
    root.style.setProperty('--android-nav-height', '48px');
    root.style.setProperty('--android-min-touch-target', '48px');
    
    // Apply global optimizations
    applyAndroidOptimizations(document.body);
  }
  
  // Optimize all existing interactive elements
  const interactiveElements = document.querySelectorAll('button, input, textarea, [role="button"], [tabindex]');
  interactiveElements.forEach((element) => {
    if (element instanceof HTMLElement) {
      ensureAndroidTouchTargets(element);
    }
  });
  
  // Set up scroll optimization for scrollable containers
  const scrollableElements = document.querySelectorAll('[style*="overflow"], .overflow-scroll, .overflow-auto');
  scrollableElements.forEach((element) => {
    if (element instanceof HTMLElement) {
      enableAndroidSmoothScrolling(element);
    }
  });
  
  console.log('✅ Android optimizations applied successfully!');
};

/**
 * MutationObserver to automatically optimize new elements
 */
export const startAndroidElementWatcher = (): (() => void) => {
  if (!isAndroid()) return () => {};
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          // Check if it's an interactive element
          if (node.matches('button, input, textarea, [role="button"], [tabindex]')) {
            ensureAndroidTouchTargets(node);
          }
          
          // Check if it's scrollable
          const style = window.getComputedStyle(node);
          if (style.overflow === 'scroll' || style.overflow === 'auto' || 
              style.overflowY === 'scroll' || style.overflowY === 'auto') {
            enableAndroidSmoothScrolling(node);
          }
          
          // Apply general optimizations
          applyAndroidOptimizations(node);
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  return () => observer.disconnect();
};

// Auto-initialize when module loads on Android
if (typeof window !== 'undefined' && isAndroid()) {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAndroidOptimizations);
  } else {
    initializeAndroidOptimizations();
  }
}
