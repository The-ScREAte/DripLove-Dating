// Safe Android optimizations to prevent crashes
// Only applies essential optimizations without aggressive DOM manipulation

/**
 * Detects if the app is running on Android
 */
export const isAndroid = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /android/.test(userAgent);
};

/**
 * Safe Android setup function - minimal optimizations
 */
export const initializeSafeAndroidOptimizations = (): void => {
  if (!isAndroid()) return;
  
  
  try {
    // Set viewport meta tag safely
    const viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
    if (viewportMeta) {
      viewportMeta.content = 'width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover';
    }

    // Apply basic optimizations to root elements only
    const html = document.documentElement;
    const body = document.body;
    
    if (html) {
      html.style.setProperty('--android-status-bar-height', '24px');
      html.style.setProperty('--android-nav-height', '48px');
      html.style.setProperty('--android-min-touch-target', '48px');
    }
    
    if (body) {
      body.style.touchAction = 'manipulation';
      (body.style as any).webkitUserSelect = 'none';
      (body.style as any).webkitTouchCallout = 'none';
      (body.style as any).webkitTapHighlightColor = 'transparent';
    }
    
  } catch (error) {
    console.error('❌ Error applying Android optimizations:', error);
  }
};

/**
 * Safe touch target optimization
 */
export const ensureSafeTouchTargets = (element: HTMLElement): void => {
  if (!isAndroid() || !element) return;
  
  try {
    const computedStyle = window.getComputedStyle(element);
    const height = parseInt(computedStyle.height);
    const width = parseInt(computedStyle.width);
    
    // Android minimum touch target is 48dp
    if (height < 48) {
      element.style.minHeight = '48px';
    }
    
    if (width < 48) {
      element.style.minWidth = '48px';
    }
    
    // Add touch optimizations
    element.style.touchAction = 'manipulation';
    (element.style as any).webkitTapHighlightColor = 'transparent';
  } catch (error) {
    console.error('Error optimizing touch targets:', error);
  }
};

/**
 * Safe scroll optimization
 */
export const enableSafeScrolling = (element: HTMLElement): void => {
  if (!isAndroid() || !element) return;
  
  try {
    (element.style as any).webkitOverflowScrolling = 'touch';
    element.style.scrollBehavior = 'smooth';
    element.style.overscrollBehavior = 'contain';
  } catch (error) {
    console.error('Error optimizing scrolling:', error);
  }
};