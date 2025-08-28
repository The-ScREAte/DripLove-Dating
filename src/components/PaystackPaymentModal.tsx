import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isIOS, buyIAPProduct } from '@/utils/iap';

interface PaystackPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  currency?: string;
  email: string;
  onSuccess: () => void;
  paymentMethod?: 'card' | 'momo' | 'iap';
  isOneTime?: boolean; // New prop to distinguish one-time vs subscription
}

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string;

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
  const [selectedPaymentMethod, setSelectedPaymentMethod] = React.useState<'card' | 'momo' | 'iap'>(paymentMethod);
  const [paystackPlanCode, setPaystackPlanCode] = React.useState<string>('');

  // Fetch payment config on component mount
  React.useEffect(() => {
    const fetchPaymentConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('payment_config')
          .select('paystack_plan_code')
          .limit(1)
          .single();
        
        if (!error && data?.paystack_plan_code) {
          setPaystackPlanCode(data.paystack_plan_code);
        }
      } catch (err) {
        // Silent error handling
      }
    };
    
    fetchPaymentConfig();
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      loadPaystackScript();
      if (!isOneTime) setSelectedPaymentMethod('card'); // enforce card for subscriptions
    }
  }, [isOpen, isOneTime]);

  const handlePay = async () => {
    if (selectedPaymentMethod === 'iap') {
      setIsLoading(true);
      try {
        // Use the correct App Store Connect product ID for monthly premium
        const productId = 'com.driplove.dating.premium.monthly';
        await buyIAPProduct(productId);
        onSuccess();
      } catch (err: any) {
        alert(err?.message || String(err) || 'IAP failed');
      } finally {
        setIsLoading(false);
      }
      return;
    }
    setIsLoading(true);
    // ...existing code for Paystack/MoMo...
    // Validate Paystack configuration
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
    // Validate plan code for subscriptions
    if (!isOneTime && !paystackPlanCode) {
      alert('Subscription plan is not configured. Please check payment configuration.');
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
    // ...existing code for Paystack/MoMo...
    // Prefer server-side initialization via Supabase Edge Function
    try {
      const metadata = {
        custom_fields: [
          { display_name: 'DripLove User', variable_name: 'driplove_user', value: email },
          { display_name: 'Payment Method', variable_name: 'payment_method', value: selectedPaymentMethod },
          { display_name: 'Payment Type', variable_name: 'payment_type', value: isOneTime ? 'one-time' : 'subscription' },
        ],
      };
      const payload: any = {
        email: email.trim(),
        metadata,
        callback_url: `${window.location.origin}/payment-success?status=successful&payment_type=${isOneTime ? 'one-time' : 'subscription'}`,
      };
      if (isOneTime) {
        payload.amount = Number(amount);
        payload.currency = (currency || 'GHS').toUpperCase();
        payload.channels = [selectedPaymentMethod === 'momo' ? 'mobile_money' : 'card'];
      } else {
        payload.plan = paystackPlanCode;
      }
      const { data, error } = await supabase.functions.invoke('paystack-init', {
        body: payload,
      });
      if (error || !data?.ok || !data?.authorization_url) {
        const errorMessage = error?.message || data?.error || 'Server init failed';
        const errorDetails = data?.details || error?.details || '';
        throw new Error(`${errorMessage}${errorDetails ? ` - Details: ${JSON.stringify(errorDetails)}` : ''}`);
      }
      window.location.href = data.authorization_url as string;
      return;
    } catch (serverErr) {
      // For subscriptions, always fallback to client-side
      if (!isOneTime) {
        // Falling back to client-side for subscription
      } else {
        // Falling back to inline init for one-time due to server error
      }
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
          paymentConfig.plan = paystackPlanCode;
          delete paymentConfig.currency;
          delete paymentConfig.amount;
        }
        const handler = (window as any).PaystackPop.setup(paymentConfig);
        handler.openIframe();
      } catch (fallbackErr) {
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
            {isOneTime && (
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
            )}
            {isIOS() && (
              <button
                onClick={() => setSelectedPaymentMethod('iap')}
                className={`flex-1 px-4 py-2 rounded border text-sm font-medium ${
                  selectedPaymentMethod === 'iap'
                    ? 'bg-yellow-500 text-black border-yellow-600'
                    : 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200'
                }`}
              >
                 Apple In-App Purchase
              </button>
            )}
          </div>
        </div>
        
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
              <p>✅ Monthly subscription</p>
              <p>✅ Automatic renewal</p>
              <p>✅ Cancel anytime</p>
              <p>✅ All premium features included</p>
            </div>
          )}
        </div>
        
        <button 
          onClick={handlePay} 
          disabled={isLoading}
          className={`w-full mt-2 py-3 rounded font-bold text-lg ${
            selectedPaymentMethod === 'iap'
              ? (isLoading ? 'bg-yellow-300 text-black cursor-not-allowed' : 'bg-yellow-500 text-black hover:bg-yellow-600')
              : (isLoading ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700')
          }`}
        >
          {isLoading
            ? 'Processing...'
            : selectedPaymentMethod === 'iap'
              ? `Pay with Apple (${currency} ${amount})`
              : `Pay with Card (${currency} ${amount})`}
        </button>
      </div>
    </div>
  );
};

export default PaystackPaymentModal;
