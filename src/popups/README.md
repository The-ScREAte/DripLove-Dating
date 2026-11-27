# Popups — one coordinator for everything that "pops up"

Rule: **nothing opens its own timer/flag/mount.** A component says *"I'd like popup X"*, the coordinator decides
*when* (and whether). One popup is visible at a time; queued by priority; never over typing, a touch/swipe,
a call, camera, payment, the on-screen keyboard, an open chat, or the out-of-swipes screen; never during
sign-up/onboarding; never stale.

## API (`import { … } from '@/popups'`)

```ts
registerPopup(def, render?)        // once, at module load. Inline popups (inline:true) need no renderer.
requestPopup(id, payload?, {ttlMs?, delayMs?})  // ask to show. Safe to call repeatedly; deduped by id.
closePopup(id, 'dismissed'|'converted')          // when the user closes / acts. Records the outcome.
cancelPopup(id)                    // the reason went away: drop it from the queue.
useIsPopupActive(id)               // for inline popups the owner draws itself.
usePopupBusy('camera', open)       // while true, calm popups wait ('camera'|'call'|'payment'|'typing'|…).
```

`PopupDefinition`: `{ id, tier, screens?, eligible?(env,payload), cooldownMs?, maxPerDay?, maxPerSession?, maxTotal?,
minAppAgeMs?, userInitiated?, ttlMs?, blockedBy?, ignoreDataReady?, inline?, legacy?, onShown?, autoCloseMs? }`

Tiers (shown in this order): `critical` (account/payment problems) › `transactional` (match, upsell the user
just triggered) › `engagement` (streak, verify nudge, free trial, app update) › `passive` (rating, tips).

Busy defaults: popups the user just caused (`userInitiated`: match, Upgrade tap) are held back only by
`camera`/`call`/`payment`/`os-permission`; other critical/transactional ones also never land over typing, touch
or the keyboard; engagement/passive additionally wait while a chat is open or the out-of-swipes screen is up.
Typing and touching are detected globally by `<PopupHost/>` (no per-screen wiring).
Floating controls with huge z-indexes (Discover top bar, undo/report buttons) get the `dl-under-popup` class so
they hide while a popup is open (`html[data-popup-blocking]`).
Analytics: `setPopupAnalyticsSink(fn)`; events also go to a local ring buffer `dl_popup_events`.

Global rules (in `store.ts`): critical/transactional ignore the min gap; engagement/passive wait `MIN_GAP_MS`
(75 s) after any popup closed and `QUIET_AFTER_RESUME_MS` (8 s) after launch/resume; `userInitiated`
popups (user tapped Upgrade) skip both and preempt an on-screen engagement/passive popup.
`eligible()` is re-checked **at show time**; if it's false the request is dropped (use `keepWhenIneligible`
to wait instead). Persistence (cooldown, per-day, lifetime caps) lives in one place: `storage.ts`.

## Adding a popup (e.g. payment-failed notice)

```tsx
registerPopup({ id: 'payment-failed', tier: 'critical', maxPerDay: 1, ignoreDataReady: true },
  ({ close, services }) => <PaymentFailedDialog onClose={() => close('dismissed')} onFix={() => close('converted')} />);
// anywhere: requestPopup('payment-failed', { reason });
```
Register it in `src/popups/registry.tsx` (or any module imported by it). The host (`<PopupHost/>` in MainApp)
draws it, wires Android back / Escape, and reports shown/dismissed/converted.

## Existing popups (registry.tsx)
`match` · `premium-upgrade` · `rating-funnel` · `verify-identity` · `swipe-guide` (inline) · `free-trial` · `streak-flash` ·
`streak-tap` · `app-update`. Content/logic of rating and payment popups belongs to their owners; WHEN they show belongs here.
