import React from 'react';
import { useTranslation } from 'react-i18next';

type Platform = 'ios' | 'android' | 'web';

interface PaywallLegalProps {
  platform: Platform;
  /** Localized price as shown to the user, e.g. "$4.99" or "$4.99/month". */
  price?: string | null;
  /**
   * iOS already shows Apple's full auto-renewal paragraph (premium.paymentOptions.iap.disclosure);
   * pass false there so the renewal line is not repeated.
   */
  showRenewal?: boolean;
  className?: string;
}

/**
 * App Store 3.1.2 / Play subscription disclosure that must sit on the purchase screen:
 * price + period + auto-renewal + where to cancel, with working Terms of Use and
 * Privacy Policy links. One component so every purchase path says the same thing.
 */
const PaywallLegal: React.FC<PaywallLegalProps> = ({ platform, price, showRenewal = true, className }) => {
  const { t } = useTranslation();
  const cleanPrice = (price || '').replace(/\s*\/\s*(month|mo)\b.*$/i, '').trim();

  let renewal: string | null = null;
  if (showRenewal && cleanPrice) {
    renewal =
      platform === 'web'
        ? t('premium.legal.renewalWeb', { price: cleanPrice })
        : t('premium.legal.renewalStore', {
            price: cleanPrice,
            store: platform === 'ios' ? 'App Store' : 'Google Play',
          });
  }

  const linkClass = 'underline underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-sm';

  return (
    <div className={`text-[11px] leading-snug text-gray-400 text-center px-2 space-y-1 ${className ?? ''}`}>
      {renewal && <p>{renewal}</p>}
      <p>
        <a href="/terms-of-service" className={linkClass}>
          {t('premium.legal.terms')}
        </a>
        <span aria-hidden="true"> · </span>
        <a href="/privacy-policy" className={linkClass}>
          {t('premium.legal.privacy')}
        </a>
      </p>
    </div>
  );
};

export default PaywallLegal;
