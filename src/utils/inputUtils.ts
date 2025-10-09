// Universal input utilities to prevent iOS zoom and handle mobile keyboards
import { getKeyboardHandler, getEnhancedInputStyles } from './keyboardHandler';

export const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  const keyboardHandler = getKeyboardHandler();
  keyboardHandler.handleInputFocus(e);
};

export const handleInputBlur = () => {
  const keyboardHandler = getKeyboardHandler();
  keyboardHandler.handleInputBlur();
};

export const getInputStyles = (): React.CSSProperties => {
  return getEnhancedInputStyles();
};

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
