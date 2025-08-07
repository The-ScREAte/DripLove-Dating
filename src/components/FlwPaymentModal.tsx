
import React from 'react';
import { PaymentMethod } from '@/constants/flwConfig';
import { getPaymentConfig } from '@/utils/paymentConfig';
import { FLW_PUBLIC_KEY } from '@/constants/flwConfig';

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
    // Check if Flutterwave is already loaded
    if ((window as any).FlutterwaveCheckout) {
      resolve(true);
      return;
    }
    
    // Check if script is already in DOM
    if (document.getElementById('flw-js')) {
      // Wait a bit and check again
      setTimeout(() => {
        if ((window as any).FlutterwaveCheckout) {
          resolve(true);
        } else {
          reject('Flutterwave script loaded but FlutterwaveCheckout not available');
        }
      }, 1000);
      return;
    }
    
    const script = document.createElement('script');
    script.id = 'flw-js';
    script.src = 'https://checkout.flutterwave.com/v3.js';
    script.onload = () => {
      // Give it a moment to initialize
      setTimeout(() => {
        if ((window as any).FlutterwaveCheckout) {
          resolve(true);
        } else {
          reject('Flutterwave script loaded but FlutterwaveCheckout not available');
        }
      }, 500);
    };
    script.onerror = () => {
      console.error('Failed to load Flutterwave script');
      reject('Flutterwave script failed to load');
    };
    document.head.appendChild(script);
  });
};

const FlwPaymentModal: React.FC<FlwPaymentModalProps> = ({ isOpen, onClose, amount, currency = 'GHS', email, paymentMethods, onSuccess }) => {
  const [selectedMethod, setSelectedMethod] = React.useState<PaymentMethod | null>(null);
  const [paymentConfig, setPaymentConfig] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // Set initial selected method when paymentMethods change
  React.useEffect(() => {
    if (paymentMethods && paymentMethods.length > 0 && !selectedMethod) {
      setSelectedMethod(paymentMethods[0]);
    }
  }, [paymentMethods, selectedMethod]);

  React.useEffect(() => {
    const loadConfig = async () => {
      const config = await getPaymentConfig();
      setPaymentConfig(config);
    };
    loadConfig();
  }, []);
  
  React.useEffect(() => {
    if (isOpen) {
      loadFlutterwaveScript().catch(console.error);
    }
  }, [isOpen]);

  const handlePay = async () => {
    try {
      setIsLoading(true);
      
      await loadFlutterwaveScript();
      
      if (!(window as any).FlutterwaveCheckout) {
        console.error('Flutterwave script not loaded');
        alert('Payment system is not ready. Please refresh and try again.');
        return;
      }

      if (!selectedMethod) {
        alert('Please select a payment method.');
        return;
      }

      if (!paymentConfig) {
        alert('Payment configuration not loaded. Please try again.');
        return;
      }

      let payment_options = 'card';
      let meta: any = { 
        charge_type: 'recurring',
        source: 'driplove_dating_app',
        subscription_type: 'premium_monthly'
      };
      
      if (selectedMethod.type === 'momo') {
        payment_options = 'mobilemoneyghana';
        meta = { ...meta, payment_type: 'mobilemoneyghana' };
      }

      // Get the public key from environment variables (most reliable source)
      let publicKey = '';
      
      // First try environment variable from config
      if (FLW_PUBLIC_KEY) {
        publicKey = FLW_PUBLIC_KEY.trim();
      }
      
      // Fallback to import.meta.env
      if (!publicKey) {
        publicKey = (import.meta.env.VITE_FLW_PUBLIC_KEY || '').trim();
      }
      
      // Fallback to direct public_key field from database
      if (!publicKey && paymentConfig.public_key) {
        publicKey = paymentConfig.public_key.trim();
      }
      
      // Only use payment method extra field if it looks like a valid key
      if (!publicKey && paymentConfig.payment_methods && Array.isArray(paymentConfig.payment_methods)) {
        const methodConfig = paymentConfig.payment_methods.find((m: any) => m.type === selectedMethod.type);
        if (methodConfig?.extra && methodConfig.extra.startsWith('FLWPUBK_')) {
          publicKey = methodConfig.extra.trim();
        }
      }

      if (!publicKey) {
        console.error('No public key found in config');
        alert('Payment configuration is incomplete. Please contact support.');
        return;
      }

      // Validate public key format
      if (!publicKey.startsWith('FLWPUBK_')) {
        console.error('Invalid public key format:', publicKey);
        alert('Invalid payment configuration. Please contact support.');
        return;
      }

      
      // Add a unique prefix to tx_ref for easy filtering in Flutterwave dashboard
      const txRefPrefix = 'DRIPLOVE-';
      const paymentData = {
        public_key: publicKey,
        tx_ref: `${txRefPrefix}${Date.now()}-${Math.random().toString(36).substring(7)}`,
        amount: amount,
        currency: currency,
        payment_options: payment_options,
        customer: {
          email: email,
          name: 'DripLove User',
          phone_number: '',
        },
        meta: meta,
        redirect_url: window.location.origin + '/payment-success',
        callback: function(data: any) {
          if (data.status === 'successful') {
            onSuccess();
            onClose();
          }
          setIsLoading(false);
        },
        onclose: function() {
          setIsLoading(false);
        },
        customizations: {
          title: 'DripLove Premium Subscription',
          description: 'Monthly subscription to DripLove dating app',
          logo: window.location.origin + '/driplove-logo.png',
        },
      };

      
      (window as any).FlutterwaveCheckout(paymentData);
    } catch (error) {
      console.error('Payment error:', error);
      alert('An error occurred while processing payment. Please try again.');
      setIsLoading(false);
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
            {paymentMethods && paymentMethods.length > 0 ? (
              paymentMethods.map((method, idx) => (
                <button
                  key={method.type + idx}
                  onClick={() => setSelectedMethod(method)}
                  className={`px-3 py-2 rounded border ${selectedMethod?.type === method.type ? 'bg-pink-600 text-white' : 'bg-gray-100'}`}
                >
                  {method.label}
                </button>
              ))
            ) : (
              <div className="text-gray-500">Loading payment methods...</div>
            )}
          </div>
          {/* Do not show receiving account details to user */}
        </div>
        <div className="mb-4">
          <label className="block font-medium mb-1">Amount</label>
          <input 
            value={amount} 
            readOnly 
            className="w-full border rounded px-2 py-1" 
            style={{ fontSize: '16px' }}
          />
        </div>
        <button 
          onClick={handlePay} 
          disabled={isLoading || !selectedMethod || !paymentConfig}
          className={`w-full text-white mt-2 py-2 rounded font-bold text-lg ${
            isLoading || !selectedMethod || !paymentConfig 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-pink-600 hover:bg-pink-700'
          }`}
        >
          {isLoading ? 'Processing...' : 'Pay with Flutterwave'}
        </button>
      </div>
    </div>
  );
};

export default FlwPaymentModal;
