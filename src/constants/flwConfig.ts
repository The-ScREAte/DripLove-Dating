// Flatterwave public key and config
export const FLW_PUBLIC_KEY = import.meta.env.VITE_FLW_PUBLIC_KEY || process.env.FLW_PUBLIC_KEY || '';
export const FLW_SECRET_KEY = import.meta.env.VITE_FLW_SECRET_KEY || process.env.FLW_SECRET_KEY || '';
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
