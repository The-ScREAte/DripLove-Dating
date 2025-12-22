import { useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

/**
 * Robust keyboard handling hook for chat input
 * Handles both native (Capacitor) and web keyboard events
 * Auto-scrolls chat to bottom when keyboard opens
 */
export function useChatKeyboardFix() {
  const keyboardHeightRef = useRef(0);
  const isKeyboardVisibleRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scrollChatToBottom = useCallback(() => {
    // Find the messages container and scroll to bottom
    requestAnimationFrame(() => {
      const messagesContainer = document.querySelector('.chat-messages-container');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    });
  }, []);

  const applyKeyboardOffset = useCallback((height: number, shouldScroll = true) => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const wasVisible = isKeyboardVisibleRef.current;
    const previousHeight = keyboardHeightRef.current;
    keyboardHeightRef.current = height;
    const isVisible = height > 50;
    isKeyboardVisibleRef.current = isVisible;

    // Add extra padding and safe-area inset for devices with home indicator
    const safeArea = parseInt(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ion-safe-area-bottom") || "0"
    );
    const adjustedHeight = height > 0 ? height + safeArea + 10 : 0;

    // Apply CSS variable for keyboard offset
    document.documentElement.style.setProperty("--keyboard-height", `${adjustedHeight}px`);
    
    // Toggle body class for additional styling hooks
    if (isVisible) {
      document.body.classList.add("keyboard-open");
      // Auto-scroll to bottom when keyboard first appears or changes height significantly
      if (shouldScroll && (!wasVisible || Math.abs(height - previousHeight) > 20)) {
        setTimeout(scrollChatToBottom, 100);
      }
    } else {
      document.body.classList.remove("keyboard-open");
    }
  }, [scrollChatToBottom]);

  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform();
    
    let showListener: any;
    let hideListener: any;

    const setupNativeKeyboardListeners = async () => {
      if (!isNative || platform !== 'ios') return; // Only iOS uses Capacitor keyboard events

      try {
        // iOS: keyboardWillShow/WillHide fire and are reliable
        showListener = await Keyboard.addListener("keyboardWillShow", (info) => {
          applyKeyboardOffset(info.keyboardHeight);
        });

        hideListener = await Keyboard.addListener("keyboardWillHide", () => {
          applyKeyboardOffset(0);
        });

        // Also listen to didShow for cases where height changes (emoji → text keyboard)
        await Keyboard.addListener("keyboardDidShow", (info) => {
          // iOS: update if height changed (emoji/text, etc.)
          if (Math.abs(keyboardHeightRef.current - info.keyboardHeight) > 20) {
            applyKeyboardOffset(info.keyboardHeight);
          }
        });

        await Keyboard.addListener("keyboardDidHide", () => {
          applyKeyboardOffset(0);
        });

      } catch (error) {
        // Silent fallback to web handling
      }
    };

    // Web fallback using visualViewport API
    const handleVisualViewportResize = () => {
      if (!window.visualViewport) return;

      // Calculate keyboard height from viewport difference
      const keyboardHeight = window.innerHeight - window.visualViewport.height;
      
      // Debounce to avoid rapid updates during keyboard animation
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        // Only consider it a keyboard if the height difference is significant
        if (keyboardHeight > 50) {
          applyKeyboardOffset(keyboardHeight);
        } else if (keyboardHeight < 50) {
          applyKeyboardOffset(0);
        }
      }, 50);
    };

    // Initialize
    applyKeyboardOffset(0);
    
    // Attach both: on Android native, visualViewport exists and is more reliable for height
    if (isNative) {
      if (platform === 'ios') {
        // iOS → use Capacitor keyboard events only
        setupNativeKeyboardListeners();
      } else if (platform === 'android') {
        // Android → use visualViewport only
        if (window.visualViewport) {
          window.visualViewport.addEventListener("resize", handleVisualViewportResize);
          window.visualViewport.addEventListener("scroll", handleVisualViewportResize);
        }
        // Tag body for Android-specific CSS overrides
        document.body.classList.add('android');
      }
    } else {
      // Web/PWA → use visualViewport when available
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", handleVisualViewportResize);
        window.visualViewport.addEventListener("scroll", handleVisualViewportResize);
      }
    }

    // Handle orientation changes to reset offsets and ensure proper layout
    const handleOrientationChange = () => {
      applyKeyboardOffset(0, false);
      scrollChatToBottom();
    };
    window.addEventListener("orientationchange", handleOrientationChange);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      if (showListener) showListener.remove();
      if (hideListener) hideListener.remove();
      
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleVisualViewportResize);
        window.visualViewport.removeEventListener("scroll", handleVisualViewportResize);
      }
      document.body.classList.remove('android');
      window.removeEventListener("orientationchange", handleOrientationChange);
      
      // Reset styles
      document.documentElement.style.removeProperty("--keyboard-height");
      document.body.classList.remove("keyboard-open");
    };
  }, [applyKeyboardOffset]);
}
