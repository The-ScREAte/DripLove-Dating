// Universal input utilities to prevent iOS zoom and handle mobile keyboards

export const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  // Small delay to ensure keyboard is shown
  setTimeout(() => {
    if (e.target) {
      e.target.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  }, 300);
};

export const handleInputBlur = () => {
  // Reset viewport zoom after input loses focus (iOS fix)
  setTimeout(() => {
    window.scrollTo(0, 0);
    // Force zoom reset on iOS
    const viewport = document.querySelector('meta[name=viewport]');
    if (viewport) {
      const content = viewport.getAttribute('content');
      viewport.setAttribute('content', content + ', user-scalable=no');
      setTimeout(() => {
        viewport.setAttribute('content', content || '');
      }, 100);
    }
  }, 100);
};

export const getInputStyles = (): React.CSSProperties => ({
  fontSize: '16px',
  outline: 'none',
  WebkitAppearance: 'none' as any,
  appearance: 'none' as any,
  WebkitBorderRadius: '0',
  borderRadius: '0',
  touchAction: 'manipulation'
});

export const applyInputHandlers = (inputElement: HTMLInputElement | HTMLTextAreaElement) => {
  if (!inputElement) return;
  
  inputElement.addEventListener('focus', (e) => {
    handleInputFocus(e as any);
  });
  
  inputElement.addEventListener('blur', handleInputBlur);
  
  // Apply styles
  const styles = getInputStyles();
  Object.assign(inputElement.style, styles);
};
