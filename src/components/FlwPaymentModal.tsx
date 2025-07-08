
import React from 'react';
import { FLW_PUBLIC_KEY } from '@/constants/flwConfig';

import { PaymentMethod } from '@/constants/flwConfig';

interface FlwPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  currency?: string;
  email: string;
  paymentMethods: PaymentMethod[];
  onSuccess: () => void;
}

const loadFlutterwaveScript = () => {
  return new Promise((resolve, reject) => {
    if (document.getElementById('flw-js')) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'flw-js';
    script.src = 'https://checkout.flutterwave.com/v3.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject('Flutterwave script failed to load');
    document.body.appendChild(script);
  });
};

const FlwPaymentModal: React.FC<FlwPaymentModalProps> = ({ isOpen, onClose, amount, currency = 'GHS', email, paymentMethods, onSuccess }) => {
  const [selectedMethod, setSelectedMethod] = React.useState<PaymentMethod | null>(paymentMethods[0] || null);
  React.useEffect(() => {
    if (isOpen) {
      loadFlutterwaveScript();
    }
  }, [isOpen]);

  const handlePay = async () => {
    await loadFlutterwaveScript();
    if ((window as any).FlutterwaveCheckout && selectedMethod) {
      let payment_options = 'card';
      let meta: any = { charge_type: 'recurring' };
      if (selectedMethod.type === 'momo') {
        payment_options = 'mobilemoneyghana';
        meta = { ...meta, payment_type: 'mobilemoneyghana' };
      }
      (window as any).FlutterwaveCheckout({
        public_key: FLW_PUBLIC_KEY,
        tx_ref: `afrovibe-premium-${Date.now()}`,
        amount,
        currency,
        payment_options,
        customer: {
          email,
        },
        meta,
        redirect_url: window.location.origin + '/payment-success',
        customizations: {
          title: 'Afrovibe Premium',
          description: 'Upgrade to premium',
          logo: '/favicon.ico',
        },
      });
    } else {
      alert('Flutterwave payment could not be initialized.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">✕</button>
        <h2 className="text-xl font-bold mb-4">Upgrade to Premium</h2>
        <div className="mb-4">
          <label className="block font-medium mb-1">Select payment method:</label>
          <div className="flex gap-2 mb-2">
            {paymentMethods.map((method, idx) => (
              <button
                key={method.type + idx}
                onClick={() => setSelectedMethod(method)}
                className={`px-3 py-2 rounded border ${selectedMethod?.type === method.type ? 'bg-pink-600 text-white' : 'bg-gray-100'}`}
              >
                {method.label}
              </button>
            ))}
          </div>
          {/* Do not show receiving account details to user */}
        </div>
        <div className="mb-4">
          <label className="block font-medium mb-1">Amount</label>
          <input value={amount} readOnly className="w-full border rounded px-2 py-1" />
        </div>
        <button onClick={handlePay} className="w-full bg-pink-600 text-white mt-2 py-2 rounded font-bold text-lg">
          Pay with Flutterwave
        </button>
      </div>
    </div>
  );
};

export default FlwPaymentModal;
