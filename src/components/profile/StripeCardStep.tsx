import React, { useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';
import { getStripePublishableKey } from '@/utils/getStripePublishableKey';

// Which publishable key to load depends on the admin-toggleable test/live
// mode (app_settings.stripe_mode), so this can't be a plain module-level
// loadStripe(...) call the way Stripe's own docs show - the key isn't known
// until that setting is fetched. Cached after the first fetch per session
// (Stripe's own guidance is still to load the SDK once, not per-render) -
// mode changes take effect on the next full reload, not for cards already
// mid-flow.
let cachedStripePromise: Promise<Stripe | null> | null = null;
const getStripePromise = (): Promise<Stripe | null> => {
  if (!cachedStripePromise) {
    cachedStripePromise = getStripePublishableKey().then((key) => loadStripe(key));
  }
  return cachedStripePromise;
};

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#ffffff',
      fontSize: '16px',
      '::placeholder': { color: '#9ca3af' },
    },
    invalid: { color: '#f87171' },
  },
  // We don't collect a billing address anywhere else in this flow, so asking
  // for just a ZIP with nothing else was confusing (surfaced as a submit
  // blocked by "Your postal code is incomplete." with no visible field
  // pointing at why - the postal code was part of Stripe's own default
  // CardElement layout, easy to miss beside card number/exp/CVC).
  hidePostalCode: true,
};

interface StripeCardStepProps {
  clientSecret: string;
  submitting: boolean;
  /** Gates the actual card submission on the Terms and Conditions checkbox
   * shown above this component, in the parent. */
  canSubmit: boolean;
  onCardSaved: (paymentMethodId: string) => void;
  onBack: () => void;
}

const CardForm: React.FC<StripeCardStepProps> = ({ clientSecret, submitting, canSubmit, onCardSaved, onBack }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (!canSubmit) {
      setError('Please accept the Terms and Conditions to continue.');
      return;
    }
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setConfirming(true);
    setError(null);
    try {
      const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      });
      if (confirmError) {
        setError(confirmError.message || 'Failed to save card');
        return;
      }
      const paymentMethodId = typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent?.payment_method?.id;
      if (!paymentMethodId) {
        setError('Failed to save card');
        return;
      }
      onCardSaved(paymentMethodId);
    } finally {
      setConfirming(false);
    }
  };

  const busy = confirming || submitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-pink-500/30 bg-black p-3">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="flex items-center gap-1.5 text-xs text-white/40">
        <ShieldCheck className="w-3.5 h-3.5 text-pink-400 shrink-0" />
        Card details are encrypted and handled directly by Stripe.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy} className="flex-1 bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white">
          Back
        </Button>
        <Button type="submit" disabled={!stripe || busy} className="flex-1 bg-pink-600 hover:bg-pink-700 text-white">
          {busy ? 'Saving...' : 'Save Card & Submit'}
        </Button>
      </div>
    </form>
  );
};

const StripeCardStep: React.FC<StripeCardStepProps> = (props) => {
  const [stripePromise] = useState(() => getStripePromise());
  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret }}>
      <CardForm {...props} />
    </Elements>
  );
};

export default StripeCardStep;
