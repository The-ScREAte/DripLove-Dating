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
    keyboardHeightRef.current = height;
    const isVisible = height > 50;
    isKeyboardVisibleRef.current = isVisible;

    // Apply CSS variable for keyboard offset
    document.documentElement.style.setProperty("--keyboard-height", `${height}px`);
    
    // Toggle body class for additional styling hooks
    if (isVisible) {
      document.body.classList.add("keyboard-open");
      // Auto-scroll to bottom when keyboard first appears or changes height
      if (shouldScroll && (!wasVisible || height !== keyboardHeightRef.current)) {
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
      if (!isNative) return;

      try {
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
        await Keyboard.addListener("keyboardDidShow", (info) => {
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
    const handleVisualViewportResize = () => {
      if (!window.visualViewport || isNative) return;

      // Calculate keyboard height from viewport difference
      const keyboardHeight = window.innerHeight - window.visualViewport.height;
      
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
      }, 50);
    };

    // Initialize
    applyKeyboardOffset(0);
    
    if (isNative) {
      setupNativeKeyboardListeners();
    } else if (window.visualViewport) {
      // Web browser - use visualViewport
      window.visualViewport.addEventListener("resize", handleVisualViewportResize);
      window.visualViewport.addEventListener("scroll", handleVisualViewportResize);
    }

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      if (showListener) showListener.remove();
      if (hideListener) hideListener.remove();
      
      if (!isNative && window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleVisualViewportResize);
        window.visualViewport.removeEventListener("scroll", handleVisualViewportResize);
      }
      
      // Reset styles
      document.documentElement.style.removeProperty("--keyboard-height");
      document.body.classList.remove("keyboard-open");
    };
  }, [applyKeyboardOffset]);
}
