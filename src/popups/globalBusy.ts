import { popupStore } from './instance';
import type { BusyReason } from './types';

/** Idempotent busy setter for global listeners (they track their own on/off state). */
export const setPopupBusyGlobal = (reason: BusyReason, busy: boolean): void => {
  popupStore.setBusy(reason, busy);
};
