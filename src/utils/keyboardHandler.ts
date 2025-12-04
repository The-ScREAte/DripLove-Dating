// Enhanced keyboard handling for mobile devices
import { Capacitor } from '@capacitor/core';

interface KeyboardConfig {
  paddingBottom?: number;
  scrollBehavior?: 'smooth' | 'auto';
  blockPadding?: number;
}

class KeyboardHandler {
  private isKeyboardVisible = false;
  private initialViewportHeight = 0;
  private keyboardHeight = 0;
  private activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;
  private scrollContainer: HTMLElement | null = null;
  private originalScrollTop = 0;
  private originalBodyPaddingBottom = '';
  private hasUserInteracted = false;

  constructor() {
    this.initialViewportHeight = window.innerHeight;
    
    // Longer delay to prevent immediate activation on page load
    setTimeout(() => {
      this.setupEventListeners();
    }, 2000);
  }

  private setupEventListeners() {
    // Listen for viewport height changes (keyboard show/hide detection)
    window.addEventListener('resize', this.handleViewportChange.bind(this));
    
    // iOS specific events
    if (Capacitor.getPlatform() === 'ios') {
      window.addEventListener('focusin', this.handleFocusIn.bind(this));
      window.addEventListener('focusout', this.handleFocusOut.bind(this));
    }

    // Visual viewport API for modern browsers
    if ('visualViewport' in window && window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.handleVisualViewportChange.bind(this));
    }
  }

  private handleViewportChange() {
    // Only handle viewport changes if there's an active input and user has interacted
    if (!this.activeInput || !this.hasUserInteracted) return;
    
    const currentHeight = window.innerHeight;
    const heightDifference = this.initialViewportHeight - currentHeight;
    
    // Keyboard is likely visible if viewport height decreased significantly
    const isKeyboardNowVisible = heightDifference > 150;
    
    if (isKeyboardNowVisible && !this.isKeyboardVisible) {
      this.keyboardHeight = heightDifference;
      this.onKeyboardShow();
    } else if (!isKeyboardNowVisible && this.isKeyboardVisible) {
      this.onKeyboardHide();
    }
  }

  private handleVisualViewportChange() {
    // Only handle visual viewport changes if there's an active input and user has interacted
    if (!this.activeInput || !this.hasUserInteracted || !window.visualViewport) return;
    
    const keyboardHeight = window.innerHeight - window.visualViewport.height;
    
    if (keyboardHeight > 150 && !this.isKeyboardVisible) {
      this.keyboardHeight = keyboardHeight;
      this.onKeyboardShow();
    } else if (keyboardHeight <= 150 && this.isKeyboardVisible) {
      this.onKeyboardHide();
    }
  }

  private handleFocusIn(event: FocusEvent) {
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      this.activeInput = target as HTMLInputElement | HTMLTextAreaElement;
      this.hasUserInteracted = true;
      
      // Don't automatically scroll - let the keyboard show first
      // The scrolling will happen in onKeyboardShow if needed
    }
  }

  private handleFocusOut() {
    setTimeout(() => {
      if (!document.activeElement || 
          (document.activeElement.tagName !== 'INPUT' && 
           document.activeElement.tagName !== 'TEXTAREA')) {
        this.activeInput = null;
        
        // If keyboard is still visible but no input is active, hide it
        if (this.isKeyboardVisible) {
          this.onKeyboardHide();
        }
      }
    }, 100);
  }

  private onKeyboardShow() {
    this.isKeyboardVisible = true;
    document.body.classList.add('keyboard-visible');
    
    // Store original body padding
    // Do not modify body padding; chat layout handles keyboard spacing via CSS variables
    this.originalBodyPaddingBottom = document.body.style.paddingBottom;
    
    // Only adjust layout if there's an active input that needs it
    if (this.activeInput) {
      // Add padding to body to prevent content from being hidden
      // No-op: avoid fighting chat input positioning on Android/iOS
      
      // Scroll active input into view
      setTimeout(() => {
        this.scrollInputIntoView(this.activeInput, { paddingBottom: 20 });
      }, 100);
    }
  }

  private onKeyboardHide() {
    this.isKeyboardVisible = false;
    document.body.classList.remove('keyboard-visible');
    
    // Restore original body padding
    // No-op: padding is controlled elsewhere
    
    // Reset scroll if needed
    setTimeout(() => {
      if (this.scrollContainer && this.originalScrollTop !== undefined) {
        this.scrollContainer.scrollTop = this.originalScrollTop;
      }
    }, 100);
  }

  public scrollInputIntoView(
    input: HTMLInputElement | HTMLTextAreaElement | null, 
    config: KeyboardConfig = {}
  ) {
    if (!input) return;

    const {
      paddingBottom = 20,
      scrollBehavior = 'smooth',
      blockPadding = 100
    } = config;

    // Find the scrollable container
    this.scrollContainer = this.findScrollableParent(input) || document.documentElement;
    
    // Store original scroll position
    this.originalScrollTop = this.scrollContainer.scrollTop;

    const inputRect = input.getBoundingClientRect();
    const containerRect = this.scrollContainer.getBoundingClientRect();
    
    // Calculate available viewport height (accounting for keyboard)
    const availableHeight = this.isKeyboardVisible 
      ? window.innerHeight - this.keyboardHeight 
      : window.innerHeight;
    
    // Check if input is visible in the available viewport
    const inputBottom = inputRect.bottom;
    const visibleBottom = availableHeight - paddingBottom;
    
    if (inputBottom > visibleBottom || inputRect.top < blockPadding) {
      // Calculate how much to scroll
      const targetTop = blockPadding;
      const scrollAmount = inputRect.top - targetTop;
      
      this.scrollContainer.scrollBy({
        top: scrollAmount,
        behavior: scrollBehavior
      });
    }
  }

  private findScrollableParent(element: HTMLElement): HTMLElement | null {
    let parent = element.parentElement;
    
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (style.overflow === 'auto' || style.overflow === 'scroll' || 
          style.overflowY === 'auto' || style.overflowY === 'scroll') {
        return parent;
      }
      parent = parent.parentElement;
    }
    
    return null;
  }

  public handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    this.activeInput = e.target;
    this.hasUserInteracted = true;
    
    // Don't immediately scroll - wait for keyboard to actually appear
    // The scrolling will happen automatically when keyboard is detected
  };

  public handleInputBlur = () => {
    // Reset viewport zoom after input loses focus (iOS fix)
    setTimeout(() => {
      // Force zoom reset on iOS
      if (Capacitor.getPlatform() === 'ios') {
        const viewport = document.querySelector('meta[name=viewport]') as HTMLMetaElement;
        if (viewport) {
          const content = viewport.getAttribute('content') || '';
          viewport.setAttribute('content', content + ', user-scalable=no');
          setTimeout(() => {
            viewport.setAttribute('content', content);
          }, 100);
        }
      }
    }, 100);
  };

  public destroy() {
    window.removeEventListener('resize', this.handleViewportChange.bind(this));
    window.removeEventListener('focusin', this.handleFocusIn.bind(this));
    window.removeEventListener('focusout', this.handleFocusOut.bind(this));
    
    if ('visualViewport' in window && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.handleVisualViewportChange.bind(this));
    }
    
    // Restore body state
    document.body.classList.remove('keyboard-visible');
    // No-op: padding is controlled elsewhere
  }
}

// Global instance
let keyboardHandler: KeyboardHandler | null = null;

export const initKeyboardHandler = () => {
  if (!keyboardHandler) {
    keyboardHandler = new KeyboardHandler();
  }
  return keyboardHandler;
};

export const getKeyboardHandler = () => {
  return keyboardHandler || initKeyboardHandler();
};

export const destroyKeyboardHandler = () => {
  if (keyboardHandler) {
    keyboardHandler.destroy();
    keyboardHandler = null;
  }
};

// Enhanced input styles that prevent zoom on iOS
export const getEnhancedInputStyles = (): React.CSSProperties => ({
  fontSize: '16px', // Prevents zoom on iOS
  outline: 'none',
  WebkitAppearance: 'none',
  appearance: 'none',
  WebkitBorderRadius: '0',
  borderRadius: '0.75rem', // Restore border radius
  touchAction: 'manipulation',
  WebkitTouchCallout: 'none',
  WebkitUserSelect: 'text',
  userSelect: 'text'
});