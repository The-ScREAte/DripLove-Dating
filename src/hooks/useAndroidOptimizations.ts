import { useEffect, useRef } from 'react';
import { 
  isAndroid, 
  applyAndroidOptimizations, 
  ensureAndroidTouchTargets, 
  enableAndroidSmoothScrolling 
} from '../utils/androidOptimizations';

/**
 * React hook for Android optimizations
 * Automatically applies Android-specific optimizations to a component
 */
export const useAndroidOptimizations = () => {
  const elementRef = useRef<HTMLElement>(null);
  
  useEffect(() => {
    if (!isAndroid() || !elementRef.current) return;
    
    const element = elementRef.current;
    
    // Apply comprehensive Android optimizations
    applyAndroidOptimizations(element);
    ensureAndroidTouchTargets(element);
    enableAndroidSmoothScrolling(element);
    
    // Find and optimize child interactive elements
    const interactiveChildren = element.querySelectorAll('button, input, textarea, [role="button"], [tabindex]');
    interactiveChildren.forEach((child) => {
      if (child instanceof HTMLElement) {
        ensureAndroidTouchTargets(child);
      }
    });
    
  }, []);
  
  return {
    ref: elementRef,
    isAndroid: isAndroid(),
  };
};

/**
 * Hook specifically for touch targets optimization
 */
export const useAndroidTouchTargets = () => {
  const elementRef = useRef<HTMLElement>(null);
  
  useEffect(() => {
    if (!isAndroid() || !elementRef.current) return;
    
    ensureAndroidTouchTargets(elementRef.current);
  }, []);
  
  return elementRef;
};

/**
 * Hook for smooth scrolling optimization
 */
export const useAndroidSmoothScrolling = () => {
  const elementRef = useRef<HTMLElement>(null);
  
  useEffect(() => {
    if (!isAndroid() || !elementRef.current) return;
    
    enableAndroidSmoothScrolling(elementRef.current);
  }, []);
  
  return elementRef;
};

/**
 * Hook for Android layout management - NO SAFE AREAS
 */
export const useAndroidSafeArea = () => {
  useEffect(() => {
    if (!isAndroid()) return;
    
    // Apply fixed padding for Android - NO safe area detection
    const root = document.documentElement;
    if (root) {
      root.style.setProperty('--android-safe-top', '24px');
      root.style.setProperty('--android-safe-bottom', '0px');
      root.style.setProperty('--android-safe-left', '0px');
      root.style.setProperty('--android-safe-right', '0px');
    }
  }, []);
  
  return {
    isAndroid: isAndroid(),
    safeAreaStyles: isAndroid() ? {
      paddingTop: 'var(--android-safe-top)',
      paddingBottom: 'var(--android-safe-bottom)',
      paddingLeft: 'var(--android-safe-left)',
      paddingRight: 'var(--android-safe-right)',
    } : {},
  };
};
