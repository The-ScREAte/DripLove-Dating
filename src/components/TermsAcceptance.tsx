import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BadgeCheck, Heart, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import HoppingLogo from '@/components/HoppingLogo';
import { preloadPricingConfig } from '@/hooks/usePricingConfig';
import { FORM_PAGE_BG } from '@/components/forms/formTheme';
import { useBackClose } from '@/utils/backStack';
import { firstNameFromAuthUser } from '@/utils/handoff';
import '@/components/auth/auth.css';

const TermsOfService = lazy(() => import('./TermsOfService'));
const PrivacyPolicy = lazy(() => import('./PrivacyPolicy'));

/** What the parent gets back on accept (used for the "Welcome, {name}" moment). */
export interface TermsAcceptInfo {
  firstName?: string | null;
}

type TermsUser = { id: string; user_metadata?: Record<string, unknown> | null };

interface TermsAcceptanceProps {
  user: TermsUser;
  onAccept: (info?: TermsAcceptInfo) => void;
}

const TermsAcceptance = ({ user, onAccept }: TermsAcceptanceProps) => {
  const { t } = useTranslation();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(() => firstNameFromAuthUser(user));
  const savingRef = useRef(false);
  // Remember which link opened a document so focus returns to it when the dialog closes.
  const termsLinkRef = useRef<HTMLButtonElement | null>(null);
  const privacyLinkRef = useRef<HTMLButtonElement | null>(null);

  // Android hardware back closes the open document instead of leaving the screen.
  // With nothing open it keeps its default (leave the app): the session survives and the
  // app resumes right here on the next launch, so users are never trapped on this screen.
  useBackClose(showTerms, () => setShowTerms(false), { escape: false });
  useBackClose(showPrivacy, () => setShowPrivacy(false), { escape: false });

  // The saved first name (from the profile they just filled in) for the welcome moment.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.from('profiles').select('first_name').eq('id', user.id).maybeSingle();
        const n = typeof data?.first_name === 'string' ? data.first_name.trim() : '';
        if (!cancelled && n) setFirstName(n);
      } catch {
        // purely cosmetic - the plain greeting is used instead
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Warm everything the next screen needs while the user reads this one, so the hand-off
  // doesn't wait on code downloads: the app shell + Discover chunks, pricing, session flag.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    const preloadInBackground = () => {
      if (cancelled) return;
      try {
        sessionStorage.setItem('driplove_user_session', 'authenticated');
      } catch {
        // ignore storage errors
      }
      preloadPricingConfig(user.id);
      void import('@/components/MainApp').catch(() => undefined);
      void import('@/components/DiscoverPage').catch(() => undefined);
    };

    // requestIdleCallback is missing on Safari/WKWebView: fall back to a short timeout.
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as Window & { requestIdleCallback: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback(
        preloadInBackground,
        { timeout: 1200 }
      );
    } else {
      timeoutId = globalThis.setTimeout(preloadInBackground, 150) as unknown as number;
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
    };
  }, [user?.id]);

  // Tracks whether this screen is still up, for the reload safety net below.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleAccept = async () => {
    // Double-tap / Enter-repeat protection: one save at a time.
    if (!termsAccepted || savingRef.current) return;
    savingRef.current = true;
    setSaveError(false);
    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      try {
        sessionStorage.setItem('driplove_user_session', 'authenticated');
        sessionStorage.removeItem('driplove_current_view');
      } catch {
        // ignore storage errors
      }

      // Hand over to the app in place (no reload - that used to cold-start the whole app
      // again right after the user had been let in).
      onAccept({ firstName });

      // Safety net only: if the parent somehow didn't move on and this screen is still
      // showing a few seconds later, fall back to the reload.
      setTimeout(() => {
        if (isMountedRef.current) window.location.reload();
      }, 4000);
    } catch (error) {
      console.error('Terms acceptance error:', error);
      savingRef.current = false;
      setLoading(false);
      setSaveError(true);
    }
  };

  const principles = [
    { icon: Shield, text: 'Your safety is in your hands' },
    { icon: Heart, text: 'Respect boundaries and treat everyone kindly' },
    { icon: BadgeCheck, text: 'Use real photos and honest information' },
  ];

  const linkClass =
    'dl-inline-link touch-manipulation rounded-sm font-semibold text-brand-ink underline decoration-current/40 underline-offset-2 hover:decoration-current';

  return (
    <div
      className="dl-form fixed inset-0 z-[10000] overflow-y-auto overscroll-y-contain pointer-events-auto"
      style={{
        background: FORM_PAGE_BG,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 20px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 20px)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div className="dl-fade-in mx-auto flex min-h-full w-full max-w-md flex-col md:max-w-lg">
        <header className="mb-6 mt-2 text-center [@media(max-height:680px)]:mb-4">
          {/* On short phones (iPhone SE class) the logo gives way so the consent text is visible. */}
          <div className="mb-4 flex justify-center [@media(max-height:680px)]:hidden">
            <HoppingLogo size={56} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Welcome to DripLove</h1>
          <p className="mt-1.5 text-sm text-white/60">Let's keep things safe and fun for everyone.</p>
        </header>

        {/* Three principles: quiet, scannable, no box-in-a-box. */}
        <ul className="mb-5 space-y-3 [@media(max-height:680px)]:mb-4 [@media(max-height:680px)]:space-y-2">
          {principles.map(({ icon: Icon, text }, i) => (
            <li
              key={text}
              className="dl-rise flex items-center gap-3"
              style={{ animationDelay: `${120 + i * 70}ms` }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-500/15">
                <Icon className="h-[19px] w-[19px] text-pink-400" aria-hidden="true" />
              </span>
              <span className="text-[15px] font-medium leading-snug text-white/90">{text}</span>
            </li>
          ))}
        </ul>

        {/* The consent: ONE checkbox = one affirmative act (never pre-checked). The whole row is
            the tap target (>=44px); the document links open their dialogs without toggling it. */}
        <label
          htmlFor="terms-acceptance"
          className={`dl-rise flex min-h-[64px] cursor-pointer items-start gap-3.5 rounded-2xl border px-4 py-3.5 transition-colors ${
            termsAccepted ? 'border-pink-500/60 bg-pink-500/[0.09]' : 'border-white/10 bg-white/[0.04]'
          } focus-within:ring-2 focus-within:ring-pink-500/60`}
          style={{ animationDelay: '340ms' }}
        >
          <CheckboxPrimitive.Root
            id="terms-acceptance"
            checked={termsAccepted}
            onCheckedChange={(checked) => {
              setTermsAccepted(checked === true);
              if (checked === true) setSaveError(false);
            }}
            className="dl-check-box mt-0.5 flex h-7 w-7 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded-lg border-2 border-white/40 text-white outline-none data-[state=checked]:border-transparent data-[state=checked]:bg-brand-gradient"
          >
            <CheckboxPrimitive.Indicator forceMount>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path className="dl-check-path" d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </CheckboxPrimitive.Indicator>
          </CheckboxPrimitive.Root>
          <span className="text-[13px] leading-[1.55] text-white/65 md:text-[14px]">
            I meet the minimum age to use DripLove in my country, and I agree to the{' '}
            <button
              type="button"
              ref={termsLinkRef}
              onClick={(e) => {
                e.preventDefault();
                setShowTerms(true);
              }}
              className={linkClass}
            >
              Terms of Service
            </button>{' '}
            (including the arbitration agreement and class action waiver), the{' '}
            <button
              type="button"
              ref={privacyLinkRef}
              onClick={(e) => {
                e.preventDefault();
                setShowPrivacy(true);
              }}
              className={linkClass}
            >
              Privacy Policy
            </button>{' '}
            and the Community Guidelines. I understand that I am responsible for my own safety and for my conduct
            towards other members.
          </span>
        </label>

        {/* Action area: sticky inside the safe area so the button is always in view, even on the
            smallest phones, while the legal text scrolls. */}
        <div
          className="sticky bottom-0 mt-auto pb-1 pt-5"
          style={{ background: `linear-gradient(to top, ${FORM_PAGE_BG} 78%, rgba(11,11,15,0))` }}
        >
          <div className="min-h-[20px] text-center text-[13px]" aria-live="polite">
            {saveError ? (
              <p role="alert" className="text-red-300">
                {t('termsAccept.failed')}
              </p>
            ) : !termsAccepted ? (
              <p className="text-white/45">{t('termsAccept.hint')}</p>
            ) : null}
          </div>
          <Button
            key={termsAccepted ? 'ready' : 'idle'}
            variant="primary"
            size="lg"
            className={`mt-2 w-full ${termsAccepted && !loading ? 'dl-cta-ready' : ''}`}
            type="button"
            onClick={handleAccept}
            disabled={!termsAccepted}
            loading={loading}
            aria-disabled={!termsAccepted || loading}
          >
            {loading ? t('termsAccept.saving') : "Let's go"}
          </Button>
        </div>
      </div>

      {/* Terms of Service Dialog - z above this screen's own z-[10000],
          otherwise it opened hidden behind it. */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent
          className="z-[10002] max-w-4xl max-h-[90dvh] w-[calc(100vw-24px)] rounded-2xl"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            termsLinkRef.current?.focus();
          }}
        >
          <DialogTitle className="sr-only">Terms of Service</DialogTitle>
          <ScrollArea className="h-[80dvh] pr-4">
            <Suspense
              fallback={
                <div className="h-[60dvh] flex items-center justify-center">
                  <HoppingLogo size={56} />
                </div>
              }
            >
              <div className="pb-6">
                <TermsOfService onBack={() => setShowTerms(false)} />
              </div>
            </Suspense>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Privacy Policy Dialog */}
      <Dialog open={showPrivacy} onOpenChange={setShowPrivacy}>
        <DialogContent
          className="z-[10002] max-w-4xl max-h-[90dvh] w-[calc(100vw-24px)] rounded-2xl"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            privacyLinkRef.current?.focus();
          }}
        >
          <DialogTitle className="sr-only">Privacy Policy</DialogTitle>
          <ScrollArea className="h-[80dvh] pr-4">
            <Suspense
              fallback={
                <div className="h-[60dvh] flex items-center justify-center">
                  <HoppingLogo size={56} />
                </div>
              }
            >
              <div className="pb-6">
                <PrivacyPolicy onBack={() => setShowPrivacy(false)} />
              </div>
            </Suspense>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TermsAcceptance;
