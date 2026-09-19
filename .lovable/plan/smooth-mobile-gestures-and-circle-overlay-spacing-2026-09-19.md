# Smooth mobile gestures and Circle overlay spacing

## What will change

- **Liked Me pull-to-refresh**
  - Replace the current directional indicator with a clean refresh icon and restrained status label.
  - Keep the released refresh state visible for at least 2 seconds, even when data returns immediately.
  - Animate the indicator and content smoothly back into place instead of collapsing abruptly.
  - Preserve the existing top-of-list guard so normal scrolling cannot accidentally refresh.

- **Chat pull-to-refresh**
  - Apply the same polished icon, deliberate pull threshold, minimum 2-second refresh hold, and smooth return to the conversation list.
  - Keep the gesture limited to the top of the chat list so it does not interfere with conversation scrolling.

- **Conversation edge-swipe back**
  - Make a left-edge swipe track the finger with resistance, like iOS navigation.
  - Reveal the chat list beneath the moving conversation instead of closing immediately after 50 pixels.
  - Complete the navigation with a smooth slide when the distance or release speed is sufficient; otherwise spring cleanly back.
  - Keep message-read updates in the background and respect reduced-motion preferences.

- **Circle profile overlays**
  - Move the daily likes counter slightly lower.
  - Move the category label slightly higher while retaining safe separation from the cultural-symbol overlay.

## Technical details

- Use refs and animation frames for gesture movement to avoid rerendering the full conversation on every touch event.
- Add a minimum refresh-display timer without delaying the network request itself.
- Add touch-cancel cleanup and stable transition states so interrupted gestures never leave a panel displaced.
- Validate TypeScript, the running preview, and mobile-width gesture states after implementation.
