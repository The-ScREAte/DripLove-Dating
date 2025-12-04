import { useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

/**
 * Robust keyboard handling hook for chat input
 * Uses bottom positioning for reliable input placement
 * Auto-scrolls chat to bottom when keyboard opens
 */
export function useChatKeyboardFix() {
  const keyboardHeightRef = useRef(0);
  const isKeyboardVisibleRef = useRef(false);
  const lastViewportHeightRef = useRef(window.innerHeight);

  const scrollChatToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const messagesContainer = document.querySelector('.chat-messages-container');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    });
  }, []);

  const applyKeyboardOffset = useCallback((height: number) => {
    const wasVisible = isKeyboardVisibleRef.current;
    const isVisible = height > 50;
    
    keyboardHeightRef.current = height;
    isKeyboardVisibleRef.current = isVisible;

    // Set the CSS variable - no extra padding needed, just use the actual height
    document.documentElement.style.setProperty("--keyboard-height", `${height}px`);
    
    if (isVisible) {
      document.body.classList.add("keyboard-open");
      // Auto-scroll to bottom when keyboard appears
      if (!wasVisible) {
        setTimeout(scrollChatToBottom, 150);
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
        // Use keyboardWillShow for immediate response
        showListener = await Keyboard.addListener("keyboardWillShow", (info) => {
          console.log("[Keyboard] Will show:", info.keyboardHeight);
          applyKeyboardOffset(info.keyboardHeight);
        });

        hideListener = await Keyboard.addListener("keyboardWillHide", () => {
          console.log("[Keyboard] Will hide");
          applyKeyboardOffset(0);
        });

        // Handle keyboard type changes (text ↔ emoji)
        didShowListener = await Keyboard.addListener("keyboardDidShow", (info) => {
          const heightDiff = Math.abs(keyboardHeightRef.current - info.keyboardHeight);
          // Only update if height changed significantly (keyboard type switch)
          if (heightDiff > 30) {
            console.log("[Keyboard] Height changed to:", info.keyboardHeight);
            applyKeyboardOffset(info.keyboardHeight);
          }
        });

      } catch (error) {
        console.log("[Keyboard] Plugin not available:", error);
      }
    };

    // Web fallback using visualViewport API
    const handleVisualViewportResize = () => {
      if (!window.visualViewport || isNative) return;

      const currentHeight = window.visualViewport.height;
      const windowHeight = window.innerHeight;
      const keyboardHeight = Math.max(0, windowHeight - currentHeight);
      
      // Ignore small fluctuations
      const heightDelta = Math.abs(currentHeight - lastViewportHeightRef.current);
      if (heightDelta < 50) return;
      
      lastViewportHeightRef.current = currentHeight;
      
      if (keyboardHeight > 100) {
        applyKeyboardOffset(keyboardHeight);
      } else {
        applyKeyboardOffset(0);
      }
    };

    // Initialize
    applyKeyboardOffset(0);
    lastViewportHeightRef.current = window.visualViewport?.height || window.innerHeight;
    
    if (isNative) {
      setupNativeKeyboardListeners();
    } else if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleVisualViewportResize);
    }

    return () => {
      if (showListener) showListener.remove();
      if (hideListener) hideListener.remove();
      if (didShowListener) didShowListener.remove();
      
      if (!isNative && window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleVisualViewportResize);
      }
      
      document.documentElement.style.removeProperty("--keyboard-height");
      document.body.classList.remove("keyboard-open");
    };
  }, [applyKeyboardOffset]);
}
