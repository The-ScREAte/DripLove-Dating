import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

/**
 * App-wide keyboard avoidance: whatever input the user is typing into
 * (login, admin forms, broadcast composer, anywhere) scrolls above the
 * on-screen keyboard when it opens, and the extra room collapses back the
 * moment the keyboard closes. Mounted once at the app root.
 *
 * The previous global handler (utils/keyboardHandler.ts) detected the
 * keyboard via window/visualViewport resize events, which iOS Capacitor
 * WebViews don't reliably fire when the keyboard appears - so on iOS it
 * silently never triggered, leaving focused inputs (e.g. the password
 * field on login) hidden behind the keyboard. Capacitor's own Keyboard
 * plugin events are the only reliable signal there, which is also why
 * useChatKeyboardFix (chat's own, separate keyboard handling) uses them.
 *
 * Backs off entirely while chat's own hook is active (detected via its
 * `.chat-input-container` marker) so the two never fight over the same
 * `--keyboard-height` CSS var / `keyboard-open` body class.
 */
export function useGlobalKeyboardOffset() {
  useEffect(() => {
    const isEditable = (element: Element | null): element is HTMLElement =>
      element instanceof HTMLElement &&
      (element.matches("input:not([type='radio']):not([type='checkbox']):not([type='button']), textarea, select") || element.isContentEditable);

    const revealActiveField = () => {
      const active = document.activeElement;
      if (!isEditable(active)) return;
      active.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

      // A second check after layout settles handles lazy Admin tabs and portaled
      // dialogs whose position changes when the keyboard first resizes the viewport.
      window.setTimeout(() => {
        if (document.activeElement === active) {
          active.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }
      }, 180);
    };

    const applyOffset = (height: number) => {
      // Chat already handles its own keyboard avoidance (fixed input bar +
      // internal scroll container) - let it own the shared CSS var/class
      // undisturbed rather than layering a second writer on top of it.
      if (document.querySelector(".chat-input-container")) return;

      const isOpen = height > 50;
      document.documentElement.style.setProperty("--keyboard-height", `${height}px`);
      document.body.classList.toggle("keyboard-open", isOpen);
      // Give the page room to scroll the focused field above the keyboard;
      // collapses back to no extra space the instant the keyboard closes.
      document.body.style.paddingBottom = isOpen ? `${height}px` : "";
      const adminPage = document.querySelector<HTMLElement>(".admin-page-container");
      if (adminPage) {
        adminPage.style.paddingBottom = isOpen ? `calc(${height}px + env(safe-area-inset-bottom, 0px))` : "";
        adminPage.style.scrollPaddingBottom = isOpen ? `${height + 24}px` : "";
      }

      if (isOpen) {
        setTimeout(revealActiveField, 120); // let the keyboard's own show animation settle first
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!document.querySelector(".admin-page-container") || !isEditable(event.target as Element | null)) return;
      window.setTimeout(revealActiveField, 180);
    };

    const isNative = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform();
    let showListener: { remove: () => void } | undefined;
    let hideListener: { remove: () => void } | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleVisualViewportResize = () => {
      if (!window.visualViewport) return;
      const height = window.innerHeight - window.visualViewport.height;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => applyOffset(height > 50 ? height : 0), 50);
    };

    if (isNative && platform === "ios") {
      (async () => {
        try {
          showListener = await Keyboard.addListener("keyboardWillShow", (info) => applyOffset(info.keyboardHeight));
          hideListener = await Keyboard.addListener("keyboardWillHide", () => applyOffset(0));
        } catch {
          // No reliable fallback for iOS native - nothing else to attach.
        }
      })();
    } else if (window.visualViewport) {
      // Android native and web/PWA: visualViewport resize is reliable here.
      window.visualViewport.addEventListener("resize", handleVisualViewportResize);
    }
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      showListener?.remove();
      hideListener?.remove();
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleVisualViewportResize);
      }
      document.removeEventListener("focusin", handleFocusIn);
      const adminPage = document.querySelector<HTMLElement>(".admin-page-container");
      adminPage?.style.removeProperty("padding-bottom");
      adminPage?.style.removeProperty("scroll-padding-bottom");
      document.documentElement.style.removeProperty("--keyboard-height");
      document.body.classList.remove("keyboard-open");
      document.body.style.paddingBottom = "";
    };
  }, []);
}
