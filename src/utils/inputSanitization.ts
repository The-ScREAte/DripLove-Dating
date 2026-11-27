// SECURITY: Input sanitization utilities to prevent XSS attacks
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