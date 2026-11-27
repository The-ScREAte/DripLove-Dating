import { Suspense, useEffect } from 'react';
import { useBackClose } from '@/utils/backStack';
import { getPopupRenderer, popupStore, type PopupServices } from './instance';
import { usePopupSnapshot } from './hooks';
import { setPopupBusyGlobal } from './globalBusy';
import './registry';
import './popups.css';

interface PopupHostProps {
  services: PopupServices;
}

const isTextField = (el: Element | null): boolean => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable === true;
};

/**
 * Mount ONCE (MainApp). Draws whichever popup the coordinator has chosen, and feeds it the
 * app-wide "user is busy" signals that don't belong to any one screen: typing, touching/dragging,
 * and the app going to the background.
 */
const PopupHost = ({ services }: PopupHostProps) => {
  const { active } = usePopupSnapshot();

  // Android hardware back / Escape closes the visible popup first.
  useBackClose(!!active, () => {
    if (active) popupStore.close(active.id, 'dismissed');
  });

  // Dev-only handle so QA scripts drive the SAME store instance the app uses (stripped from production builds).
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __popups?: unknown }).__popups = popupStore;
  }, []);

  useEffect(() => {
    let touching = false;
    let touchTimer: ReturnType<typeof setTimeout> | null = null;

    const setTouching = (v: boolean) => {
      if (touching === v) return;
      touching = v;
      setPopupBusyGlobal('touching', v);
    };
    const onDown = () => {
      if (touchTimer) clearTimeout(touchTimer);
      setTouching(true);
    };
    const onUp = () => {
      if (touchTimer) clearTimeout(touchTimer);
      // Small tail so the popup doesn't land the instant a swipe ends.
      touchTimer = setTimeout(() => setTouching(false), 400);
    };
    let typing = false;
    const onFocusIn = (e: FocusEvent) => {
      const next = isTextField(e.target as Element);
      if (next !== typing) {
        typing = next;
        setPopupBusyGlobal('typing', next);
      }
    };
    const onFocusOut = () => {
      // focus moves between fields fire focusout then focusin; defer to see where it lands
      setTimeout(() => {
        const next = isTextField(document.activeElement);
        if (next !== typing) {
          typing = next;
          setPopupBusyGlobal('typing', next);
        }
      }, 0);
    };
    const onVisibility = () => popupStore.setEnv({ appActive: document.visibilityState !== 'hidden' });

    document.addEventListener('pointerdown', onDown, { passive: true, capture: true });
    document.addEventListener('pointerup', onUp, { passive: true, capture: true });
    document.addEventListener('pointercancel', onUp, { passive: true, capture: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', onVisibility);
      if (touchTimer) clearTimeout(touchTimer);
      if (touching) setPopupBusyGlobal('touching', false);
      if (typing) setPopupBusyGlobal('typing', false);
    };
  }, []);

  const hasRenderer = !!active && !!getPopupRenderer(active.id);
  useEffect(() => {
    const root = document.documentElement;
    if (hasRenderer) root.setAttribute('data-popup-blocking', '');
    else root.removeAttribute('data-popup-blocking');
    return () => root.removeAttribute('data-popup-blocking');
  }, [hasRenderer]);

  if (!active) return null;
  const render = getPopupRenderer(active.id);
  if (!render) return null; // inline popup: the owning component draws it

  return (
    <div key={active.key} data-popup={active.id}>
      <Suspense fallback={null}>
        {render({
          payload: active.payload,
          services,
          close: (outcome = 'dismissed') => popupStore.close(active.id, outcome),
        })}
      </Suspense>
    </div>
  );
};

export default PopupHost;
