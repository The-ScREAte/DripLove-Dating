import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import HoppingLogo from '@/components/HoppingLogo';
import './auth.css';

interface AuthStatusScreenProps {
  /** `loading` shows the hopping logo + one line; `error` shows a calm failure with a retry. */
  state: 'loading' | 'error';
  /** One short, plain-language line. Never pass raw provider/technical errors here. */
  message?: string;
  onRetry?: () => void;
  /** Overrides the button label (default "Try again"). */
  actionLabel?: string;
}

/**
 * The single in-between screen for OAuth hand-offs (Google/Apple web callbacks).
 * Same near-black page colour as the sign-up flow and the terms page, so moving
 * between them never flashes a different colour.
 */
const AuthStatusScreen: React.FC<AuthStatusScreenProps> = ({ state, message, onRetry, actionLabel }) => {
  const { t } = useTranslation();

  return (
    <div
      className="dl-auth-status fixed inset-0 z-[10001] flex flex-col items-center justify-center gap-5 px-8 text-center"
      style={{
        background: '#0B0B0F',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      role={state === 'error' ? 'alert' : 'status'}
      aria-live={state === 'error' ? 'assertive' : 'polite'}
    >
      <HoppingLogo size={64} animate={state === 'loading'} />

      {state === 'loading' ? (
        <p className="text-base font-medium text-white/80">{message ?? t('auth.signingIn')}</p>
      ) : (
        <>
          <div className="max-w-xs space-y-1.5">
            <h1 className="text-lg font-semibold text-white">{t('auth.signInFailedTitle')}</h1>
            <p className="text-sm text-white/60">{message ?? t('auth.signInFailedBody')}</p>
          </div>
          {onRetry && (
            <Button variant="primary" size="lg" className="w-full max-w-xs" onClick={onRetry} autoFocus>
              {actionLabel ?? t('auth.tryAgain')}
            </Button>
          )}
        </>
      )}
    </div>
  );
};

export default AuthStatusScreen;
