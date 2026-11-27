export type { PopupDefinition, PopupOutcome, PopupTier, PopupEnv, BusyReason, PopupEvent } from './types';
export {
  popupStore,
  registerPopup,
  getPopupRenderer,
  requestPopup,
  openPremiumUpgrade,
  closePopup,
  cancelPopup,
  setPopupEnv,
  setPopupBusy,
  popupTimesShown,
  setPopupAnalyticsSink,
} from './instance';
export type { PopupRenderArgs, PopupServices } from './instance';
export { PopupStore } from './store';
export { usePopupSnapshot, useIsPopupActive, usePopupBusy, usePopupEnvSync } from './hooks';
// <PopupHost/> is imported directly by MainApp from '@/popups/PopupHost' so that screens importing
// '@/popups' for requestPopup() don't pull every popup's UI into their chunk.
