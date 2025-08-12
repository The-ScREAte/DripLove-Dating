// Payment configuration for Paystack
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
