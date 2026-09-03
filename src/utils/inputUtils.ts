// Universal input utilities to prevent iOS zoom on focus.
// Keyboard-avoidance (scrolling the focused field above the on-screen
// keyboard) is now handled globally by useGlobalKeyboardOffset, mounted
// once at the app root - it reacts to focus/blur on its own via
// document.activeElement, so these no longer need to do anything for that.
// Kept as no-ops so existing onFocus/onBlur call sites don't need to change.

export const handleInputFocus = (_e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {};

export const handleInputBlur = () => {};

export const getInputStyles = (): React.CSSProperties => ({
  fontSize: '16px', // Prevents zoom on iOS
  outline: 'none',
  WebkitAppearance: 'none',
  appearance: 'none',
  WebkitBorderRadius: '0',
  borderRadius: '0.75rem',
  touchAction: 'manipulation',
  WebkitTouchCallout: 'none',
  WebkitUserSelect: 'text',
  userSelect: 'text',
});
