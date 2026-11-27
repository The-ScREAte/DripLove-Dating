import { AlertTriangle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { requestPopup } from '@/popups/instance';

export interface PaymentIssuePayload {
  platform: 'ios' | 'android';
  /** When the access they already paid for runs out (store grace period end). */
  expiresAt?: string | null;
}

interface SubLike {
  plan_name?: string | null;
  status?: string | null;
  expires_at?: string | null;
}

/**
 * A store renewal charge failed and the store is retrying (status 'payment_pending', written only by the
 * Apple/Google webhooks). Premium still works, but the user must fix their payment method or lose it.
 * We only ASK; the popup coordinator decides when (critical tier, at most once a day).
 */
export function maybeRequestPaymentIssuePopup(sub: SubLike | null | undefined): void {
  if (!sub || sub.plan_name !== 'premium' || sub.status !== 'payment_pending') return;
  const platform = Capacitor.getPlatform();
  if (platform !== 'ios' && platform !== 'android') return; // Paystack (web) never produces this state
  requestPopup<PaymentIssuePayload>('payment-issue', { platform, expiresAt: sub.expires_at ?? null });
}

const MANAGE_URL = {
  ios: 'itms-apps://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
} as const;

export const PaymentIssueDialog = ({
  platform,
  expiresAt,
  onClose,
}: PaymentIssuePayload & { onClose: (converted: boolean) => void }) => {
  const { t, i18n } = useTranslation();
  const store = platform === 'ios' ? 'App Store' : 'Google Play';
  const until = expiresAt ? new Date(expiresAt) : null;
  const untilLabel =
    until && until.getTime() > Date.now()
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(until)
      : null;

  const openManage = async () => {
    try {
      await Browser.open({ url: MANAGE_URL[platform] });
    } catch {
      window.location.href = MANAGE_URL[platform];
    }
    onClose(true);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="h-6 w-6 text-amber-400" aria-hidden="true" />
            {t('premium.paymentIssue.title')}
          </DialogTitle>
          <DialogDescription className="pt-2 text-base">
            {t('premium.paymentIssue.body', { store })}
            {untilLabel && <span className="mt-2 block">{t('premium.paymentIssue.until', { date: untilLabel })}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-4">
          <Button variant="primary" size="md" className="w-full" onClick={openManage}>
            {t('premium.paymentIssue.update')}
          </Button>
          <Button variant="quiet" size="md" className="w-full" onClick={() => onClose(false)}>
            {t('premium.paymentIssue.later')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentIssueDialog;
