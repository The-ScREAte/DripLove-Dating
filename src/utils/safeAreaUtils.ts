/**
 * Safe Area Utilities for iOS and Android
 * Provides better detection and handling of safe areas on mobile devices
 */

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Detect if the device supports safe area insets
 */
export const supportsSafeAreaInsets = (): boolean => {
  // Check if CSS env() function is supported
  if (typeof CSS !== 'undefined' && CSS.supports) {
    return CSS.supports('padding-top', 'env(safe-area-inset-top)') ||
           CSS.supports('padding-top', 'constant(safe-area-inset-top)');
  }
  
  // Fallback check for WebKit browsers
  return 'CSS' in window && 'supports' in CSS;
};

/**
 * Get the current safe area insets
 */
export const getSafeAreaInsets = (): SafeAreaInsets => {
  const defaultInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  
  if (!supportsSafeAreaInsets()) {
    // Provide fallback values for common mobile devices
    return getMobileFallbackInsets();
  }

  try {
    // Try to get computed style values
    const computedStyle = getComputedStyle(document.documentElement);
    
    const top = parseInt(computedStyle.getPropertyValue('--safe-area-inset-top').replace('px', '')) || 0;
    const right = parseInt(computedStyle.getPropertyValue('--safe-area-inset-right').replace('px', '')) || 0;
    const bottom = parseInt(computedStyle.getPropertyValue('--safe-area-inset-bottom').replace('px', '')) || 0;
    const left = parseInt(computedStyle.getPropertyValue('--safe-area-inset-left').replace('px', '')) || 0;

    return { top, right, bottom, left };
  } catch (error) {
    console.warn('Failed to get safe area insets:', error);
    return getMobileFallbackInsets();
  }
};

/**
 * Get fallback insets for mobile devices that don't support env()
 */
export const getMobileFallbackInsets = (): SafeAreaInsets => {
  const userAgent = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isAndroid = /android/.test(userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  
  // Default mobile safe areas
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };

  if (isIOS) {
    // iOS specific detection
    const screenHeight = window.screen.height;
    const screenWidth = window.screen.width;
    
    // iPhone with notch/Dynamic Island detection
    if (screenHeight === 812 && screenWidth === 375) {
      // iPhone X/XS
      insets.top = 44;
      insets.bottom = isStandalone ? 34 : 0;
    } else if (screenHeight === 896) {
      // iPhone XR/11/XS Max/11 Pro Max
      insets.top = 44;
      insets.bottom = isStandalone ? 34 : 0;
    } else if (screenHeight === 844 && screenWidth === 390) {
      // iPhone 12/13/14
      insets.top = 47;
      insets.bottom = isStandalone ? 34 : 0;
    } else if (screenHeight === 852 && screenWidth === 393) {
      // iPhone 14 Pro/15 Pro
      insets.top = 59;
      insets.bottom = isStandalone ? 34 : 0;
    } else if (screenHeight === 932 && screenWidth === 430) {
      // iPhone 14 Pro Max/15 Pro Max
      insets.top = 59;
      insets.bottom = isStandalone ? 34 : 0;
    } else if (screenHeight >= 800) {
      // Other modern iPhones with potential notch
      insets.top = 44;
      insets.bottom = isStandalone ? 34 : 0;
    } else {
      // Older iPhones
      insets.top = 20;
    }
  } else if (isAndroid) {
    // Android specific detection
    insets.top = 24; // Standard Android status bar
    
    // Some Android devices have gesture navigation
    if (isStandalone) {
      insets.bottom = 24;
    }
  } else {
    // Other mobile devices
    insets.top = 24;
  }

  return insets;
};

/**
 * Apply safe area insets to an element
 */
export const applySafeAreaInsets = (element: HTMLElement, areas: ('top' | 'right' | 'bottom' | 'left')[] = ['top', 'right', 'bottom', 'left']) => {
  const insets = getSafeAreaInsets();
  
  areas.forEach(area => {
    const value = insets[area];
    if (value > 0) {
      element.style.setProperty(`padding-${area}`, `${value}px`);
    }
  });
};

/**
 * Create CSS custom properties for safe areas
 */
export const setSafeAreaCSSProperties = () => {
  const insets = getSafeAreaInsets();
  const root = document.documentElement;
  
  // Set fallback values if env() isn't working
  if (insets.top > 0) {
    root.style.setProperty('--safe-area-inset-top', `${insets.top}px`);
  }
  if (insets.right > 0) {
    root.style.setProperty('--safe-area-inset-right', `${insets.right}px`);
  }
  if (insets.bottom > 0) {
    root.style.setProperty('--safe-area-inset-bottom', `${insets.bottom}px`);
  }
  if (insets.left > 0) {
    root.style.setProperty('--safe-area-inset-left', `${insets.left}px`);
  }
};

/**
 * Initialize safe area support
 */
export const initializeSafeAreas = () => {
  // Set CSS properties on load
  setSafeAreaCSSProperties();
  
  // Re-apply on orientation change
  window.addEventListener('orientationchange', () => {
    setTimeout(setSafeAreaCSSProperties, 100);
  });
  
  // Re-apply on resize
  let resizeTimeout: NodeJS.Timeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(setSafeAreaCSSProperties, 100);
  });
};

/**
 * Check if the current device has a notch or similar feature
 */
export const hasNotch = (): boolean => {
  const insets = getSafeAreaInsets();
  return insets.top > 24; // More than standard status bar height
};

/**
 * Get the minimum safe top padding for the current device
 */
export const getMinimumSafeTopPadding = (): number => {
  const insets = getSafeAreaInsets();
  return Math.max(insets.top, 20); // Minimum 20px for any mobile device
};
