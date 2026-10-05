import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Heart, Shield, Users, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import HoppingLogo from '@/components/HoppingLogo';
import { preloadPricingConfig } from '@/hooks/usePricingConfig';
import { FORM_PAGE_BG, formPrimaryButton } from '@/components/forms/formTheme';

const TermsOfService = lazy(() => import('./TermsOfService'));
const PrivacyPolicy = lazy(() => import('./PrivacyPolicy'));

interface TermsAcceptanceProps {
  user: any;
  onAccept: () => void;
}

const TermsAcceptance = ({ user, onAccept }: TermsAcceptanceProps) => {
  const { t } = useTranslation();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const { toast } = useToast();

  // Preload pricing in the background while the user views terms
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    const preloadInBackground = () => {
      if (cancelled) return;
    
      // Mark user as authenticated for instant app load
      try {
        sessionStorage.setItem('driplove_user_session', 'authenticated');
      } catch {}

      // Preload pricing (cached and reused by the paywall) without blocking
      // first paint. This used to also download a full batch of Discover
      // profiles and photos here, into a cache the Discover page never
      // reads - pure wasted data and battery while the user read the terms.
      preloadPricingConfig(user.id);
    };

    // Defer heavy background preloading to idle time to keep this page snappy.
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
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
    };
  }, [user?.id]);

  // Tracks whether this screen is still up, for the reload safety net below.
  const isMountedRef = React.useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleAccept = async () => {
    if (!termsAccepted) {
      toast({
        title: "Please accept terms",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      sessionStorage.setItem('driplove_user_session', 'authenticated');
      sessionStorage.removeItem('driplove_current_view');

      // Hand over to the app in place. This used to be followed by an
      // unconditional window.location.reload() 300ms later (an old Android
      // fix), which cold-started the whole app again - splash, auth check,
      // loading screen - right after the user had already been let in.
      onAccept();

      // Safety net only: if the parent somehow didn't move on and this screen
      // is still showing a few seconds later, fall back to the reload.
      setTimeout(() => {
        if (isMountedRef.current) window.location.reload();
      }, 4000);
    } catch (error: any) {
      console.error('Terms acceptance error:', error);
      setLoading(false);
      toast({
        title: "Something went wrong",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  const guidelines = [
    { icon: Heart, title: 'Be respectful', text: 'Treat everyone with kindness.' },
    { icon: Shield, title: 'Stay safe', text: 'Meet in public and protect your privacy.' },
    { icon: Users, title: 'Be authentic', text: 'Use real photos and honest info.' },
  ];

  return (
    <div
      className="dl-form fixed inset-0 z-[10000] overflow-y-auto overscroll-y-contain pointer-events-auto"
      style={{
        background: FORM_PAGE_BG,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 20px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 20px)',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      <div
        className="dl-fade-in mx-auto flex w-full max-w-md flex-col justify-center"
        style={{
          minHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 44px)'
        }}
      >
        <header className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <HoppingLogo size={56} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Welcome to DripLove</h1>
          <p className="mt-1.5 text-sm text-white/60">Let's keep things safe and fun for everyone.</p>
        </header>

        {/* Key Points */}
        <ul className="space-y-3">
          {guidelines.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-500/15">
                <Icon className="h-5 w-5 text-pink-400" />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-white">{title}</span>
                <span className="block text-sm text-white/60">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* Document Links */}
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 px-4 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/[0.06]"
          >
            <FileText className="h-4 w-4 text-pink-400" />
            Terms of Service
          </button>
          <button
            type="button"
            onClick={() => setShowPrivacy(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 px-4 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/[0.06]"
          >
            <Shield className="h-4 w-4 text-pink-400" />
            Privacy Policy
          </button>
        </div>

        {/* Acceptance Checkbox - the whole row is the tap target */}
        <label
          htmlFor="terms-acceptance"
          className={`mt-6 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors ${
            termsAccepted ? 'border-pink-500/60 bg-pink-500/[0.08]' : 'border-white/15 bg-white/[0.04]'
          }`}
        >
          <Checkbox
            id="terms-acceptance"
            checked={termsAccepted}
            onCheckedChange={(checked) => setTermsAccepted(checked === true)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-white/40 data-[state=checked]:border-pink-500 data-[state=checked]:bg-pink-500 data-[state=checked]:text-white"
          />
          <span className="text-sm leading-snug text-white/85">
            I agree to the Terms of Service and Privacy Policy, and I confirm I'm 18 or older.
          </span>
        </label>

        {/* Action Button */}
        <Button
          type="button"
          onClick={handleAccept}
          disabled={loading || !termsAccepted}
          className={`${formPrimaryButton} mt-5 w-full`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Getting things ready…
            </span>
          ) : (
            "Let's go"
          )}
        </Button>
      </div>

      {/* Terms of Service Dialog - z above this screen's own z-[10000],
          otherwise it opened hidden behind it. */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="z-[10002] max-w-4xl max-h-[90vh] w-[calc(100vw-24px)] rounded-2xl">
          <DialogTitle className="sr-only">Terms of Service</DialogTitle>
          <ScrollArea className="h-[80vh] pr-4">
            <Suspense
              fallback={
                <div className="h-[60vh] flex items-center justify-center">
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
        <DialogContent className="z-[10002] max-w-4xl max-h-[90vh] w-[calc(100vw-24px)] rounded-2xl">
          <DialogTitle className="sr-only">Privacy Policy</DialogTitle>
          <ScrollArea className="h-[80vh] pr-4">
            <Suspense
              fallback={
                <div className="h-[60vh] flex items-center justify-center">
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
