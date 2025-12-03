import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

export function useChatKeyboardFix() {
  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();
    
    let showListener: any;
    let hideListener: any;

    const setupKeyboardListeners = async () => {
      if (isNative) {
        try {
          showListener = await Keyboard.addListener("keyboardWillShow", (e) => {
            document.body.style.setProperty("--keyboard-offset", `${e.keyboardHeight}px`);
            document.body.classList.add("keyboard-open");
          });

          hideListener = await Keyboard.addListener("keyboardWillHide", () => {
            document.body.style.setProperty("--keyboard-offset", "0px");
            document.body.classList.remove("keyboard-open");
          });
        } catch (error) {
          console.log("Keyboard plugin not available:", error);
        }
      }
    };

    setupKeyboardListeners();

    // Web browser fallback using visualViewport
    const handleVisualViewportResize = () => {
      if (window.visualViewport) {
        const offset = window.innerHeight - window.visualViewport.height;
        if (offset > 100) { // Keyboard is likely open
          document.body.style.setProperty("--keyboard-offset", `${offset}px`);
          document.body.classList.add("keyboard-open");
        } else {
          document.body.style.setProperty("--keyboard-offset", "0px");
          document.body.classList.remove("keyboard-open");
        }
      }
    };

    if (!isNative && window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleVisualViewportResize);
    }

    return () => {
      if (showListener) showListener.remove();
      if (hideListener) hideListener.remove();
      if (!isNative && window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleVisualViewportResize);
      }
      document.body.style.removeProperty("--keyboard-offset");
      document.body.classList.remove("keyboard-open");
    };
  }, []);
}
