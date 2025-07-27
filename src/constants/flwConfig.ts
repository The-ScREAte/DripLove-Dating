// Flutterwave public configuration - SECURE: Only public keys exposed to frontend
export const FLW_PUBLIC_KEY = import.meta.env.VITE_FLW_PUBLIC_KEY || process.env.FLW_PUBLIC_KEY || '';
// SECURITY: Secret keys moved to edge functions - never expose in frontend
// export const FLW_SECRET_KEY - REMOVED FOR SECURITY
export const FLW_ENCRYPTION_KEY = import.meta.env.VITE_FLW_ENCRYPTION_KEY || process.env.FLW_ENCRYPTION_KEY || '';

export interface PaymentMethod {
  type: 'card' | 'momo';
  label: string;
  details: string;
  name?: string; // For MoMo name or cardholder name
  extra?: string; // For provider/network or bank info
}

// Default payment methods (admin can update)
export const defaultPaymentMethods: PaymentMethod[] = [
  { type: 'card', label: 'Card', details: '' },
  { type: 'momo', label: 'Mobile Money', details: '' }
];
