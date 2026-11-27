import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import OnboardingTransition from '@/components/forms/OnboardingTransition';
import HandoffWelcome from '@/components/HandoffWelcome';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';

const TermsAcceptance = lazy(() => import('./TermsAcceptance'));

interface ProfileCompletionPageProps {
  /** Called once terms are accepted, to hand straight over to the main app
   *  in place. Without it (the standalone /complete-profile route) the page
   *  navigates home instead, which routes into the app the same way. */
  onComplete?: (info?: { firstName?: string | null; continued?: boolean }) => void;
}

/**
 * Complete-profile for people who are already signed in (e.g. Google/Apple).
 * The form itself is the shared onboarding wizard (same one sign-up uses);
 * this wrapper only waits for the session and runs the terms hand-off.
 */
const ProfileCompletionPage = ({ onComplete }: ProfileCompletionPageProps = {}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [showTermsAcceptance, setShowTermsAcceptance] = useState(false);
  const [isFinalizingTerms, setIsFinalizingTerms] = useState(false);
  const [finalName, setFinalName] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    // Warm the terms screen's code now, so it's ready the moment the profile
    // saves instead of loading behind a blank frame.
    void import('./TermsAcceptance');
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const getUser = async () => {
      try {
        const waitForSession = async (maxWaitMs = 8000, intervalMs = 200) => {
          const startedAt = Date.now();
          while (Date.now() - startedAt < maxWaitMs) {
            const {
              data: { session },
              error,
            } = await supabase.auth.getSession();
            if (error) return { session: null, error };
            if (session?.user) return { session, error: null };
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
          }
          return { session: null, error: null };
        };

        const { session, error } = await waitForSession();

        if (error) {
          console.error('Error getting session:', error);
          navigate('/');
          return;
        }

        if (!session?.user) {
          // No authenticated user, redirect to home
          navigate('/');
          return;
        }

        setUser(session.user);
      } catch (error) {
        console.error('Error in profile completion page:', error);
        navigate('/');
      }
    };

    getUser();
  }, [navigate]);

  const handleTermsAccept = useCallback(async (info?: { firstName?: string | null }) => {
    if (!user) return;
    // The welcome moment (HandoffWelcome) is the celebration - no extra toast on top of it.
    setFinalName(info?.firstName?.trim() || null);
    setIsFinalizingTerms(true);

    // Queue the welcome push for 10 minutes from now instead of sending it
    // instantly - a client-side setTimeout can't survive the app being
    // backgrounded/killed for that long, so this writes to a table a cron job
    // (process_pending_welcome_notifications, every minute) drains once due.
    // Fire-and-forget: the user shouldn't wait on this to reach Discover.
    void (async () => {
      try {
        await supabase.from('pending_welcome_notifications').insert({
          user_id: user.id,
          send_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
      } catch (error) {
        console.error('Failed to schedule welcome notification:', error);
      }
    })();

    // Hand over to the main app in place - no full page reload, so the
    // Discover profiles TermsAcceptance preloaded in memory are still there
    // and the app doesn't cold-start again from the splash screen.
    if (onComplete) {
      // `continued`: this page is already showing the welcome screen, so Index's copy shouldn't replay it.
      onComplete({ ...info, continued: true });
    } else {
      navigate('/');
    }

    // Safety net: only if this screen is somehow still showing a few seconds
    // later does it fall back to a full reload.
    setTimeout(() => {
      if (isMountedRef.current) window.location.reload();
    }, 4000);
  }, [user, onComplete, navigate]);

  const handleCancel = useCallback(async () => {
    await supabase.auth.signOut();
    toast({
      title: 'Profile completion cancelled',
      description: 'You have been signed out.',
    });
    navigate('/');
  }, [toast, navigate]);

  if (isFinalizingTerms) {
    // Same screen the app hand-off in Index shows, so the logo never re-appears between them.
    return <HandoffWelcome firstName={finalName} />;
  }

  if (!user) {
    return <OnboardingTransition />;
  }

  // Show terms acceptance after the profile is saved
  if (showTermsAcceptance) {
    return (
      <Suspense fallback={<OnboardingTransition />}>
        <TermsAcceptance user={user} onAccept={handleTermsAccept} />
      </Suspense>
    );
  }

  return (
    <OnboardingWizard
      mode="complete"
      user={user}
      onCancel={handleCancel}
      onComplete={() => setShowTermsAcceptance(true)}
    />
  );
};

export default ProfileCompletionPage;
