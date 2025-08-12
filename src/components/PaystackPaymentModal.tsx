import React from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PaystackPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  currency?: string;
  email: string;
  onSuccess: () => void;
  paymentMethod?: 'card' | 'momo';
  isOneTime?: boolean; // New prop to distinguish one-time vs subscription
}

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string;
const PAYSTACK_PLAN_CODE = import.meta.env.VITE_PAYSTACK_PLAN_CODE as string;

const loadPaystackScript = () => {
  return new Promise((resolve, reject) => {
    if ((window as any).PaystackPop) {
      resolve(true);
      return;
    }
    if (document.getElementById('paystack-js')) {
      setTimeout(() => {
        if ((window as any).PaystackPop) {
          resolve(true);
        } else {
          reject('Paystack script loaded but PaystackPop not available');
        }
      }, 1000);
      return;
    }
    const script = document.createElement('script');
    script.id = 'paystack-js';
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.onload = () => {
      setTimeout(() => {
        if ((window as any).PaystackPop) {
          resolve(true);
        } else {
          reject('Paystack script loaded but PaystackPop not available');
        }
      }, 500);
    };
    script.onerror = () => {
      reject('Paystack script failed to load');
    };
    document.head.appendChild(script);
  });
};

const PaystackPaymentModal: React.FC<PaystackPaymentModalProps> = ({ isOpen, onClose, amount, currency = 'GHS', email, onSuccess, paymentMethod = 'card', isOneTime = false }) => {
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = React.useState<'card' | 'momo'>(paymentMethod);

  React.useEffect(() => {
    if (isOpen) {
      loadPaystackScript().catch(console.error);
      if (!isOneTime) setSelectedPaymentMethod('card'); // enforce card for subscriptions
    }
  }, [isOpen, isOneTime]);

  const handlePay = async () => {
    setIsLoading(true);
    
    // For subscriptions, use direct Payment Page URL instead of server initialization
    // This is because plan-based server init often rejects callback_url parameters
    if (!isOneTime) {
      try {
        // Validate subscription configuration
        if (!PAYSTACK_PLAN_CODE) {
          alert('Subscription plan is not configured. Please contact support.');
          setIsLoading(false);
          return;
        }
        
        console.log('Redirecting to Paystack Payment Page for subscription');
        
        // For subscriptions, redirect to your configured Paystack Payment Page
        // Make sure to set the redirect URL in your Paystack dashboard to your GitHub Pages URL
        window.location.href = 'https://paystack.shop/pay/9yfwtz2c7g';
        return;
        
      } catch (subscriptionErr) {
        console.error('Subscription redirect failed:', subscriptionErr);
        alert('Subscription setup failed. Please try again later.');
        setIsLoading(false);
        return;
      }
    }
    
    // Debug logging for one-time payments
    console.log('Paystack Public Key:', PAYSTACK_PUBLIC_KEY ? 'Set' : 'Not set');
    console.log('Payment Type:', 'one-time');
    console.log('Amount:', amount);
    console.log('Currency:', currency);
    
    // Validate Paystack configuration for one-time payments
    if (!PAYSTACK_PUBLIC_KEY) {
      alert('Paystack is not configured. Please set VITE_PAYSTACK_PUBLIC_KEY in your environment variables.');
      setIsLoading(false);
      return;
    }
    
    if (!PAYSTACK_PUBLIC_KEY.startsWith('pk_')) {
      alert('Invalid Paystack public key format. It should start with "pk_".');
      setIsLoading(false);
      return;
    }

    // Validate email
    if (!email || !email.includes('@')) {
      alert('Please provide a valid email address.');
      setIsLoading(false);
      return;
    }

    await loadPaystackScript();
    if (!(window as any).PaystackPop) {
      alert('Payment system is not ready. Please refresh and try again.');
      setIsLoading(false);
      return;
    }

    // For one-time payments, try server initialization first
    try {
      const metadata = {
        custom_fields: [
          { display_name: 'DripLove User', variable_name: 'driplove_user', value: email },
          { display_name: 'Payment Method', variable_name: 'payment_method', value: selectedPaymentMethod },
          { display_name: 'Payment Type', variable_name: 'payment_type', value: 'one-time' },
        ],
      };

      // Use Supabase function with authorization header in the URL
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      // We'll pass the auth token as a parameter and handle it in the function
      const httpsCallbackUrl = `${supabaseUrl}/functions/v1/paystack-redirect?authorization=${encodeURIComponent('Bearer ' + anonKey)}&status=successful&payment_type=one-time`;
      
      const payload = {
        email: email.trim(),
        amount: Number(amount),
        currency: (currency || 'GHS').toUpperCase(),
        channels: [selectedPaymentMethod === 'momo' ? 'mobile_money' : 'card'],
        metadata,
        callback_url: httpsCallbackUrl,
      };

      // Call Supabase Edge Function via supabase-js (handles URL/env)
      const { data, error } = await supabase.functions.invoke('paystack-init', {
        body: payload,
      });
      if (error || !data?.ok || !data?.authorization_url) {
        console.error('Server init failed:', error || data);
        throw new Error(error?.message || data?.error || 'Server init failed');
      }
      window.location.href = data.authorization_url as string;
      return;
    } catch (serverErr) {
      console.warn('Server init failed, falling back to inline:', serverErr);
      console.warn('Falling back to inline init for one-time due to server error:', serverErr);
      // If server init fails for one-time, attempt inline as fallback using public key
      try {
        const ref = 'DRIPLOVE-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
        const trimmedKey = PAYSTACK_PUBLIC_KEY.trim();
        const paymentConfig: any = {
          key: trimmedKey,
          publicKey: trimmedKey,
          email: email.trim(),
          ref,
          callback: (response: any) => {
            try {
              const tx_ref = response?.reference;
              const transaction_id = (response as any)?.transaction || (response as any)?.trxref || '';
              window.location.href = `/payment-success?status=successful&tx_ref=${encodeURIComponent(tx_ref)}&transaction_id=${encodeURIComponent(transaction_id)}&payment_type=${isOneTime ? 'one-time' : 'subscription'}`;
            } finally {
              setIsLoading(false);
            }
          },
          onClose: () => setIsLoading(false),
          metadata: {
            custom_fields: [
              { display_name: 'DripLove User', variable_name: 'driplove_user', value: email },
              { display_name: 'Payment Method', variable_name: 'payment_method', value: selectedPaymentMethod },
              { display_name: 'Payment Type', variable_name: 'payment_type', value: isOneTime ? 'one-time' : 'subscription' },
            ],
          },
        };

        if (isOneTime) {
          const paystackAmount = Math.round(Number(amount) * 100);
          if (!Number.isFinite(paystackAmount) || paystackAmount < 100) {
            alert('Amount invalid. Minimum amount is 1.00');
            setIsLoading(false);
            return;
          }
          paymentConfig.amount = paystackAmount;
          paymentConfig.currency = (currency || 'GHS').toUpperCase();
          paymentConfig.channels = [selectedPaymentMethod === 'momo' ? 'mobile_money' : 'card'];
        } else {
          paymentConfig.plan = PAYSTACK_PLAN_CODE;
          delete paymentConfig.currency;
          delete paymentConfig.amount;
        }

        const handler = (window as any).PaystackPop.setup(paymentConfig);
        handler.openIframe();
      } catch (fallbackErr) {
        console.error('Inline fallback failed:', fallbackErr);
        alert('Payment initialization failed. Please try again later.');
        setIsLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">✕</button>
        <h2 className="text-xl font-bold mb-4">
          {isOneTime ? 'One-Time Premium Payment' : 'Subscribe to Premium'}
        </h2>
        
        {isOneTime && (
          <div className="mb-4">
            <label className="block font-medium mb-2">Select Payment Method:</label>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setSelectedPaymentMethod('card')}
                className={`flex-1 px-4 py-2 rounded border text-sm font-medium ${
                  selectedPaymentMethod === 'card' 
                    ? 'bg-green-600 text-white border-green-600' 
                    : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                }`}
              >
                💳 Card
              </button>
              <button
                onClick={() => setSelectedPaymentMethod('momo')}
                className={`flex-1 px-4 py-2 rounded border text-sm font-medium ${
                  selectedPaymentMethod === 'momo' 
                    ? 'bg-green-600 text-white border-green-600' 
                    : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                }`}
              >
                📱 Mobile Money
              </button>
            </div>
          </div>
        )}
        
        <div className="mb-4">
          <label className="block font-medium mb-1">Amount</label>
          <input 
            value={`${currency} ${amount}`} 
            readOnly 
            className="w-full border rounded px-2 py-1" 
            style={{ fontSize: '16px' }}
          />
        </div>
        
        <div className="mb-4 text-sm text-gray-600">
          {isOneTime ? (
            <div>
              <p>✅ 1 month premium access</p>
              <p>✅ No automatic renewal</p>
              <p>✅ All premium features included</p>
            </div>
          ) : (
            <div>
              <p>✅ Monthly automatic billing</p>
              <p>✅ Cancel anytime</p>
              <p>✅ All premium features included</p>
              <p>💳 Card payments only</p>
            </div>
          )}
        </div>
        
        <button 
          onClick={handlePay} 
          disabled={isLoading}
          className={`w-full text-white mt-2 py-3 rounded font-bold text-lg ${
            isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isLoading ? 'Processing...' : `Pay ${currency} ${amount}`}
        </button>
      </div>
    </div>
  );
};

export default PaystackPaymentModal;
