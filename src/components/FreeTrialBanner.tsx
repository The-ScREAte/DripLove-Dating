import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Sparkles, Globe, MessageCircle, Heart, MapPin, Compass, X, Loader2 } from 'lucide-react';
import { useFreeTrialOffer } from '@/hooks/useFreeTrialOffer';

const FEATURES: { icon: typeof Globe; label: string }[] = [
  { icon: Globe, label: 'Match people across the world' },
  { icon: MessageCircle, label: 'Unlimited chats' },
  { icon: Heart, label: 'Unlimited swipes' },
  { icon: MapPin, label: 'Access to multiple countries' },
  { icon: Compass, label: 'Open Range of Love' },
];

interface FreeTrialBannerProps {
  userId: string | undefined;
  /** Called after the CTA is tapped, whether the purchase succeeds, fails, or is cancelled */
  onDismiss?: () => void;
  /** Show a close (X) button in the corner */
  dismissible?: boolean;
  className?: string;
}

const DISMISS_KEY = 'driplove_trial_banner_dismissed';

const FreeTrialBanner = ({ userId, onDismiss, dismissible, className = '' }: FreeTrialBannerProps) => {
  const { loading, eligibleForTrial, offerInfo, canStart, starting, startTrial } = useFreeTrialOffer(userId);
  const [hiddenThisSession, setHiddenThisSession] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Only the fresh-trial pitch - no "your trial has ended, resubscribe"
  // variant, so this stays silent once the store no longer offers a trial.
  if (loading || hiddenThisSession || !eligibleForTrial) return null;

  const hide = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
    setHiddenThisSession(true);
    onDismiss?.();
  };

  const handleTap = async () => {
    await startTrial();
    onDismiss?.();
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-pink-500/30 bg-black shadow-[0_8px_30px_rgba(219,39,119,0.25)] ${className}`}
    >
      {/* Ambient gradient glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(120% 140% at 0% 0%, rgba(219,39,119,0.35) 0%, rgba(0,0,0,0) 55%), radial-gradient(120% 140% at 100% 100%, rgba(147,51,234,0.35) 0%, rgba(0,0,0,0) 55%)',
        }}
      />

      {dismissible && (
        <button
          type="button"
          onClick={hide}
          aria-label="Dismiss"
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="relative px-5 py-5">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-pink-300">
          <Sparkles className="h-3 w-3 animate-pulse" />
          {offerInfo.trialPeriodLabel ? `${offerInfo.trialPeriodLabel} free` : 'Free trial'}
        </div>
        <h3 className="text-lg font-bold text-white">Try DripLove Premium, free</h3>

        <div className="mt-3 space-y-2">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500/25 to-purple-500/25">
                <Icon className="h-3.5 w-3.5 text-pink-300" />
              </div>
              <span className="text-sm text-white/85">{label}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleTap}
          disabled={starting || !canStart}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 py-3 text-sm font-bold text-white shadow-lg shadow-pink-900/40 transition active:scale-[0.98] disabled:opacity-60"
        >
          {(starting || !canStart) ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {starting ? 'Processing...' : 'Preparing...'}
            </>
          ) : (
            'Start Free Trial →'
          )}
        </button>

        <p className="mt-2.5 text-center text-[11px] text-white/45">
          {offerInfo.trialPeriodLabel ? `No charge for ${offerInfo.trialPeriodLabel}.` : 'No charge during your trial.'} Cancel anytime.
          {/* Google Play trials end the moment they're cancelled (see
              supabase/functions/_shared/google-trial.ts). */}
          {Capacitor.getPlatform() === 'android' && ' Cancelling during the free trial ends Premium immediately.'}
        </p>
      </div>
    </div>
  );
};

export default FreeTrialBanner;
