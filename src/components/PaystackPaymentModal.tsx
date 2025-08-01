import React from 'react';

interface PaystackPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  currency?: string;
  email: string;
  onSuccess: () => void;
  paymentMethod?: 'card' | 'momo';
}

const PAYSTACK_PUBLIC_KEY = 'pk_test_0bd90a6eb17e79c6d91152923d1de09cef91ab88';

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

const PaystackPaymentModal: React.FC<PaystackPaymentModalProps> = ({ isOpen, onClose, amount, currency = 'GHS', email, onSuccess, paymentMethod = 'card' }) => {
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      loadPaystackScript().catch(console.error);
    }
  }, [isOpen]);

  const handlePay = async () => {
    setIsLoading(true);
    await loadPaystackScript();
    if (!(window as any).PaystackPop) {
      alert('Payment system is not ready. Please refresh and try again.');
      setIsLoading(false);
      return;
    }
    const handler = (window as any).PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: email,
      // amount and currency are not needed when using plan
      plan: 'PLN_oldq605a3cpksq4', // Your Paystack plan code for monthly subscription
      ref: 'DRIPLOVE-' + Date.now() + '-' + Math.random().toString(36).substring(7),
      callback: function(response: any) {
        // Redirect to payment-success page with Paystack transaction details
        // response.reference is tx_ref, response.transaction is transaction_id
        const tx_ref = response.reference;
        const transaction_id = response.transaction || response.trxref || '';
        window.location.href = `/payment-success?status=successful&tx_ref=${encodeURIComponent(tx_ref)}&transaction_id=${encodeURIComponent(transaction_id)}`;
        setIsLoading(false);
      },
      onClose: function() {
        setIsLoading(false);
      },
      metadata: {
        custom_fields: [
          {
            display_name: 'DripLove User',
            variable_name: 'driplove_user',
            value: email,
          },
          {
            display_name: 'Payment Method',
            variable_name: 'payment_method',
            value: paymentMethod,
          },
        ],
      },
    });
    handler.openIframe();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">✕</button>
        <h2 className="text-xl font-bold mb-4">Upgrade to Premium</h2>
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
          disabled={isLoading}
          className={`w-full text-white mt-2 py-2 rounded font-bold text-lg ${
            isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isLoading ? 'Processing...' : 'Pay with Paystack'}
        </button>
      </div>
    </div>
  );
};

export default PaystackPaymentModal;
