import { useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

/**
 * Robust keyboard handling hook for chat input
 * Handles both native (Capacitor) and web keyboard events
 * Auto-scrolls chat to bottom when keyboard opens
 * DOES NOT close keyboard on scroll - only on intentional dismiss
 */
export function useChatKeyboardFix() {
  const keyboardHeightRef = useRef(0);
  const isKeyboardVisibleRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastViewportHeightRef = useRef(window.innerHeight);

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

    // Add extra padding for emoji keyboard (typically taller)
    const adjustedHeight = height > 0 ? height + 15 : 0;

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
    
    let showListener: any;
    let hideListener: any;
    let didShowListener: any;

    const setupNativeKeyboardListeners = async () => {
      if (!isNative) return;

      try {
        // Configure keyboard to NOT resize/scroll on scroll
        // This prevents keyboard from closing when user scrolls
        try {
          await Keyboard.setScroll({ isDisabled: true });
        } catch (e) {
          // Older versions may not support this
        }

        // Use keyboardWillShow for smooth animation
        showListener = await Keyboard.addListener("keyboardWillShow", (info) => {
          console.log("[Keyboard] Will show, height:", info.keyboardHeight);
          applyKeyboardOffset(info.keyboardHeight);
        });

        hideListener = await Keyboard.addListener("keyboardWillHide", () => {
          console.log("[Keyboard] Will hide");
          applyKeyboardOffset(0);
        });

        // Also listen to didShow for cases where height changes (emoji → text keyboard)
        didShowListener = await Keyboard.addListener("keyboardDidShow", (info) => {
          // Only update if height changed (keyboard type switch)
          if (Math.abs(keyboardHeightRef.current - info.keyboardHeight) > 20) {
            console.log("[Keyboard] Did show with different height:", info.keyboardHeight);
            applyKeyboardOffset(info.keyboardHeight);
          }
        });

      } catch (error) {
        console.log("[Keyboard] Plugin not available, using web fallback:", error);
      }
    };

    // Web fallback using visualViewport API
    // Only tracks viewport resize, NOT scroll events (to prevent keyboard closing on scroll)
    const handleVisualViewportResize = () => {
      if (!window.visualViewport || isNative) return;

      const currentHeight = window.visualViewport.height;
      const windowHeight = window.innerHeight;
      
      // Calculate keyboard height from viewport difference
      const keyboardHeight = windowHeight - currentHeight;
      
      // Only update if the viewport size actually changed (not just scrolled)
      const heightDelta = Math.abs(currentHeight - lastViewportHeightRef.current);
      
      // Ignore small changes that might be from scroll/bounce
      if (heightDelta < 50) return;
      
      lastViewportHeightRef.current = currentHeight;
      
      // Debounce to avoid rapid updates during keyboard animation
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        // Only consider it a keyboard if the height difference is significant
        if (keyboardHeight > 100) {
          applyKeyboardOffset(keyboardHeight);
        } else if (keyboardHeight < 50) {
          applyKeyboardOffset(0);
        }
      }, 100);
    };

    // Initialize
    applyKeyboardOffset(0);
    lastViewportHeightRef.current = window.visualViewport?.height || window.innerHeight;
    
    if (isNative) {
      setupNativeKeyboardListeners();
    } else if (window.visualViewport) {
      // Web browser - use visualViewport resize only (NOT scroll)
      window.visualViewport.addEventListener("resize", handleVisualViewportResize);
    }

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      if (showListener) showListener.remove();
      if (hideListener) hideListener.remove();
      if (didShowListener) didShowListener.remove();
      
      if (!isNative && window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleVisualViewportResize);
      }
      
      // Reset styles
      document.documentElement.style.removeProperty("--keyboard-height");
      document.body.classList.remove("keyboard-open");
    };
  }, [applyKeyboardOffset]);
}
