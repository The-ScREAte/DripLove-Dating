import React, { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { isIOS, buyIAPProduct } from '@/utils/iap';
import { Capacitor } from '@capacitor/core';

interface PaystackPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number; // GHS amount for Paystack
  currency?: string; // GHS for Paystack
  displayAmount?: number; // USD amount to show user
  displayCurrency?: string; // USD to show user
  email: string;
  onSuccess: () => void;
  paymentMethod?: 'card' | 'momo' | 'iap';
  isOneTime?: boolean; // New prop to distinguish one-time vs subscription
}

// Helper to get Paystack public key based on mode
const getPaystackPublicKey = async (): Promise<string> => {
  try {
    // Fetch mode from database
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('id', 'paystack_mode')
      .single();

    if (error || !data) {
      console.warn('Failed to fetch paystack_mode, using env fallback');
      return getEnvPublicKey();
    }

    const mode = (data.value as { mode?: string })?.mode || 'test';
    
    // Return the appropriate key based on mode
    const key = mode === 'live' 
      ? (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY_LIVE as string | undefined)
      : (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY_TEST as string | undefined);
    
    if (!key) {
      console.warn(`Missing VITE_PAYSTACK_PUBLIC_KEY_${mode.toUpperCase()}, using env fallback`);
      return getEnvPublicKey();
    }

    console.log(`[Paystack] Using ${mode} mode with public key`);
    return key;
  } catch (err) {
    console.error('Error fetching Paystack mode:', err);
    return getEnvPublicKey();
  }
};

// Fallback: use legacy env var or explicit mode-based env var
const getEnvPublicKey = (): string => {
  const mode = ((import.meta.env.VITE_PAYSTACK_MODE as string | undefined) || 'test').toLowerCase();
  return (
    (mode === 'test'
      ? (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY_TEST as string | undefined)
      : (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY_LIVE as string | undefined)) ||
    (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined) ||
    ''
  );
};

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

const PaystackPaymentModal: React.FC<PaystackPaymentModalProps> = ({ 
  isOpen, 
  onClose, 
  amount, 
  currency = 'GHS', 
  displayAmount,
  displayCurrency = 'USD',
  email, 
  onSuccess, 
  paymentMethod = 'card', 
  isOneTime = false 
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'card' | 'momo' | 'iap'>(paymentMethod);
  const [paystackPublicKey, setPaystackPublicKey] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadPaystackScript()
        .then(() => undefined)
        .catch(err => console.error('[PaystackModal] Failed to load Paystack script:', err));
      
      // Fetch the appropriate public key based on database mode
      getPaystackPublicKey().then(setPaystackPublicKey);
    }
  }, [isOpen, isOneTime]);

  const handlePay = async () => {
    if (selectedPaymentMethod === 'iap') {
      setIsLoading(true);
      try {
        // Use the correct App Store Connect product ID for monthly premium
        const productId = 'com.driplove.dating.premium.monthlysub2';
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
    if (!paystackPublicKey) {
      alert(
        'Paystack is not configured. Please contact support.'
      );
      setIsLoading(false);
      return;
    }
    if (!paystackPublicKey.startsWith('pk_')) {
      alert('Invalid Paystack public key format. It should start with "pk_".');
      setIsLoading(false);
      return;
    }
    // Prefer the authenticated Supabase email (matches server-side verify anti-abuse check)
    const { data: sessionData } = await supabase.auth.getSession();
    const authUser = sessionData?.session?.user || null;
    const emailToUse = (authUser?.email || email || '').trim();

    // Validate email (Paystack requires an email)
    if (!emailToUse || !emailToUse.includes('@')) {
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
          { display_name: 'DripLove User', variable_name: 'driplove_user', value: emailToUse },
          { display_name: 'DripLove User ID', variable_name: 'user_id', value: authUser?.id || '' },
          { display_name: 'Payment Method', variable_name: 'payment_method', value: selectedPaymentMethod },
          { display_name: 'Payment Type', variable_name: 'payment_type', value: isOneTime ? 'one-time' : 'subscription' },
        ],
      };

      // IMPORTANT:
      // - On web, we can use the app origin callback directly.
      // - On Capacitor/native, the app origin is typically `capacitor://localhost` / `http://localhost`
      //   which Paystack cannot redirect to. Use the Edge Function redirect that deep-links back into the app.
      const isNative = Capacitor.isNativePlatform();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const originLooksLocal =
        !origin ||
        origin.includes('localhost') ||
        origin.startsWith('capacitor://') ||
        origin.startsWith('ionic://') ||
        origin.startsWith('file://');

      const shouldUseEdgeRedirect = isNative || originLooksLocal;
      const callbackUrl = shouldUseEdgeRedirect
        ? `${SUPABASE_URL}/functions/v1/paystack-redirect?payment_type=${encodeURIComponent(
            isOneTime ? 'one-time' : 'subscription'
          )}`
        : `${origin}/payment-success?payment_type=${encodeURIComponent(isOneTime ? 'one-time' : 'subscription')}`;

      const payload: any = {
        email: emailToUse,
        metadata,
        callback_url: callbackUrl,
      };
      // IMPORTANT: For recurring subscriptions we intentionally initialize an amount-based transaction
      // (not a Paystack plan subscription). We store the authorization_code from the first payment
      // and renew via charge_authorization on our own schedule.
      payload.amount = Number(amount);
      payload.currency = (currency || 'GHS').toUpperCase();
      payload.channels = [selectedPaymentMethod === 'momo' ? 'mobile_money' : 'card'];

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
      // If server init fails, attempt inline as fallback using public key.
      // This still works for subscriptions because renewal is handled via saved authorization_code.
      try {
        const ref = 'DRIPLOVE-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
        const trimmedKey = paystackPublicKey.trim();
        const paymentConfig: any = {
          key: trimmedKey,
          publicKey: trimmedKey,
          email: emailToUse,
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
              { display_name: 'DripLove User', variable_name: 'driplove_user', value: emailToUse },
              { display_name: 'DripLove User ID', variable_name: 'user_id', value: authUser?.id || '' },
              { display_name: 'Payment Method', variable_name: 'payment_method', value: selectedPaymentMethod },
              { display_name: 'Payment Type', variable_name: 'payment_type', value: isOneTime ? 'one-time' : 'subscription' },
            ],
          },
        };

        const paystackAmount = Math.round(Number(amount) * 100);
        if (!Number.isFinite(paystackAmount) || paystackAmount < 100) {
          alert('Amount invalid. Minimum amount is 1.00');
          setIsLoading(false);
          return;
        }
        paymentConfig.amount = paystackAmount;
        paymentConfig.currency = (currency || 'GHS').toUpperCase();
        paymentConfig.channels = [selectedPaymentMethod === 'momo' ? 'mobile_money' : 'card'];

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
        {!isIOS() && (
          <h2 className="text-xl font-bold mb-4">
            {isOneTime ? 'One-Time Premium Payment' : 'Subscribe to Premium'}
          </h2>
        )}
        
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
            {/* Apple In-App Purchase button removed as per request */}
          </div>
        </div>
        
        <div className="mb-4">
          <label className="block font-medium mb-1">Amount</label>
          <input 
            value={`${displayCurrency || 'USD'} ${displayAmount || amount}`} 
            readOnly 
            className="w-full border rounded px-2 py-1 font-bold text-lg" 
            style={{ fontSize: '16px' }}
          />
          {displayCurrency && displayCurrency !== currency && (
            <p className="text-xs text-gray-500 mt-1">
              💱 Charged as GHS {amount.toFixed(2)} (equivalent amount in local currency)
            </p>
          )}
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
              ? `Subscribe Now (${displayCurrency || currency} ${displayAmount || amount})`
              : `Pay ${displayCurrency || currency} ${(displayAmount || amount).toFixed(2)}`}
        </button>
      </div>
    </div>
  );
};

export default PaystackPaymentModal;
