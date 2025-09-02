// SECURITY: Input sanitization utilities to prevent XSS attacks

/**
 * Sanitizes text input by removing potentially dangerous characters
 * while preserving basic formatting
 */
export const sanitizeTextInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  
  // Remove HTML tags and script content
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>?/gm, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .trim();
};

/**
 * Sanitizes message content for chat
 * Allows basic text but prevents script injection
 */
export const sanitizeMessage = (message: string): string => {
  if (!message || typeof message !== 'string') return '';
  
  return message
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .slice(0, 1000); // Limit message length, don't trim to preserve spaces
};

/**
 * Sanitizes profile bio with stricter rules
 */
export const sanitizeBio = (bio: string): string => {
  if (!bio || typeof bio !== 'string') return '';
  
  return bio
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>?/gm, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/[<>]/g, '') // Remove angle brackets entirely
    .slice(0, 500); // Limit bio length but don't trim spaces during typing
};

/**
 * Validates and sanitizes name fields
 */
export const sanitizeName = (name: string): string => {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .replace(/[^a-zA-Z\s'-]/g, '') // Only allow letters, spaces, apostrophes, hyphens
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50); // Limit name length
};

/**
 * Escape HTML entities to prevent XSS when displaying user content
 */
export const escapeHtml = (text: string): string => {
  if (!text || typeof text !== 'string') return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

/**
 * Validate URL inputs to prevent malicious URLs
 */
export const validateUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
};

/**
 * Sanitize and validate email addresses
 */
export const sanitizeEmail = (email: string): string => {
  if (!email || typeof email !== 'string') return '';
  
  return email
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, '')
    .trim()
    .slice(0, 100); // Limit email length
};