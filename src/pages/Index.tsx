import React, { useState, useEffect, Suspense, lazy } from 'react';
import WelcomeScreen from '@/components/WelcomeScreen';
import AuthDialog from '@/components/AuthDialog';
import AuthForm from '@/components/AuthForm';
import RegistrationForm from '@/components/RegistrationForm';
import ProfileCompletionPage from '@/components/ProfileCompletionPage';
import TermsAcceptance from '@/components/TermsAcceptance';
import MainApp from '@/components/MainApp';
import AboutUs from '@/components/AboutUs';
import TermsOfService from '@/components/TermsOfService';
import PrivacyPolicy from '@/components/PrivacyPolicy';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { transformFormDataForSubmission } from '@/utils/formValidation';
import VideoBackground from '@/components/VideoBackground';
import { preloadPricingConfig } from '@/hooks/usePricingConfig';
import { preloadExchangeRates } from '@/services/exchangeRateService';

// Lazy load AdminPage (54KB) - only loads when admin features are accessed
const LazyAdminPage = lazy(() => import('@/components/AdminPage'));

// Loading component for lazy-loaded pages - minimal spinner
const PageLoader = () => null;

const Index = ({
  user,
  isAuthenticated,
}: {
  user: ({
    id: string;
    email?: string | null;
    app_metadata?: { provider?: string };
    user_metadata?: Record<string, unknown>;
  } & Record<string, unknown>) | null;
  isAuthenticated: boolean;
}) => {
  const [currentView, setCurrentView] = useState<'welcome' | 'login' | 'register' | 'profile-completion' | 'terms-acceptance' | 'app' | 'admin' | 'about' | 'terms' | 'privacy'>(
    isAuthenticated ? 'app' : 'welcome'
  );
  const [loading, setLoading] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const { toast } = useToast();
  const didRouteRef = React.useRef(false);

  const setViewIfChanged = (nextView: typeof currentView) => {
    setCurrentView((prev) => (prev === nextView ? prev : nextView));
  };

  // React to global auth state (single source of truth lives in AppWrapper)
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      setViewIfChanged('welcome');
      didRouteRef.current = false;
      return;
    }

    if (didRouteRef.current) return;
    didRouteRef.current = true;

    // If user is authenticated, run app-specific profile routing
    setLoading(true);
    preloadPricingConfig(user.id);
    preloadExchangeRates(); // Preload exchange rates for currency conversion
    checkUserTypeAndRedirect(user.id);
  }, [isAuthenticated, user?.id]);

  const checkUserTypeAndRedirect = async (userId: string) => {
    try {
      // Fast-path: check sessionStorage for OAuth profile first
      let profile: (Record<string, unknown> & {
        is_admin?: boolean;
        account_status?: string;
        terms_accepted?: boolean;
      }) | null = null;

      try {
        if (typeof window !== 'undefined') {
          const raw = sessionStorage.getItem('oauth_profile');
          if (raw) {
            profile = JSON.parse(raw);
            try { sessionStorage.removeItem('oauth_profile'); } catch {}
          }
        }
      } catch {}

      if (!profile) {
        // Single fast query with retry logic built-in
        const result = await supabase
          .from('profiles')
          .select('is_admin, account_status, first_name, last_name, date_of_birth, country, city, gender, preference, relationship_intent, occupation, industry, education_level, terms_accepted')
          .eq('id', userId)
          .maybeSingle();
        profile = result.data;
        
        // If no profile found, send authenticated user to profile completion.
        // This avoids race/provider edge-cases where OAuth metadata is delayed.
        if (!profile) {
          setLoading(false);
          setViewIfChanged('profile-completion');
          return;
        }
      }

      // Check account status
      if (profile.account_status === 'blocked') {
        await supabase.auth.signOut();
        toast({
          title: "Account Blocked",
          description: "Your account has been blocked. Please contact support.",
          variant: "destructive",
        });
        setViewIfChanged('welcome');
        setLoading(false);
        return;
      }

      if (profile.account_status === 'on_hold') {
        await supabase.auth.signOut();
        toast({
          title: "Account On Hold",
          description: "Your account is currently on hold. Please contact support.",
          variant: "destructive",
        });
        setViewIfChanged('welcome');
        setLoading(false);
        return;
      }

      // Check if profile is incomplete (missing required fields)
      // Only redirect to profile completion for OAuth users (Google)
      // Manual registration users get basic profiles and can update later
      const requiredFields = ['first_name', 'last_name', 'date_of_birth', 'country', 'city', 'gender', 'preference', 'relationship_intent', 'occupation', 'industry', 'education_level'];
      const isIncomplete = requiredFields.some(field => !profile[field]);

      // Check if this is an OAuth user by looking at the auth provider
      const provider = user?.app_metadata?.provider;
      const isOAuthUser = provider === 'google' || provider === 'apple';

      // For OAuth users with incomplete profiles, redirect to profile completion
      // ProfileCompletionPage will handle showing terms acceptance after completion
      if (isIncomplete && isOAuthUser) {
        setViewIfChanged('profile-completion');
        setLoading(false);
        return;
      }

      // For complete profiles, check if user has accepted terms
      if (!profile.terms_accepted) {
        setViewIfChanged('terms-acceptance');
        setLoading(false);
        return;
      }

      // Redirect based on user type
      if (profile?.is_admin) {
        setViewIfChanged('admin');
      } else {
        setViewIfChanged('app');
      }
    } catch (error) {
      console.error('Error checking user type:', error);
      // If we're authenticated but offline / profile fetch fails, do NOT force logout.
      // Keep the user in the app to avoid the "logged out" flash/offline-stuck behavior.
      if (isAuthenticated) {
        setViewIfChanged('app');
      } else {
        setViewIfChanged('welcome');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGetStarted = () => {
    setCurrentView('login');
  };

  const handleShowRegister = () => {
    setCurrentView('register');
  };

  const handleBackToLogin = () => {
    setCurrentView('welcome');
  };

  const handleAdminAccess = () => {
    setCurrentView('login'); // Redirect to login instead of direct admin access
  };

  const handleShowLogin = () => {
    setCurrentView('login');
  };

  const handleBackToWelcome = () => {
    setCurrentView('welcome');
  };

  const handleShowAbout = () => {
    setCurrentView('about');
  };

  const handleShowTerms = () => {
    setCurrentView('terms');
  };

  const handleShowPrivacy = () => {
    setCurrentView('privacy');
  };

  const handleManualLogin = () => {
    setShowAuthDialog(true);
    setIsLoginMode(true);
  };

  const handleAuthDialogToggle = () => {
    // Close the dialog and navigate to registration page
    setShowAuthDialog(false);
    setCurrentView('register');
  };

  const handleAuthDialogClose = () => {
    setShowAuthDialog(false);
  };

  // Shortest possible registration: essentials only
  const handleRegister = async (formData: unknown) => {
    // Registration passes user directly - use it immediately
    if (typeof formData === 'object' && formData && 'user' in formData) {
      setCurrentView('terms-acceptance');
      return;
    }
    
    // Fallback: if auth is already established, proceed
    if (isAuthenticated && user) {
      setCurrentView('terms-acceptance');
    }
  };

  const handleProfileComplete = () => {
    // After profile completion, show terms acceptance
    setCurrentView('terms-acceptance');
  };

  const handleProfileCancel = async () => {
    // Sign out the user if they cancel profile completion
    await supabase.auth.signOut();
    setCurrentView('welcome');
  };

  const handleLogout = async () => {
    // Remove push token before logging out
    if (user?.id) {
      const { removePushToken } = await import('@/services/pushNotifications');
      await removePushToken(user.id);
    }
    
    // Clear all IAP state to prevent it leaking to next logged-in user
    const { clearAllIapState } = await import('@/iap-google');
    clearAllIapState();
    
    await supabase.auth.signOut();
    // Reset the routing ref so re-auth can properly route again
    didRouteRef.current = false;
    setCurrentView('welcome');
  };

  const handleTermsAccept = () => {
    // Update view
    setCurrentView('app');
  };

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
        <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="w-full h-fill flex justify-center bg-transparent" style={{ margin: 0, padding: 0 }}>
      <div className="w-full h-fill" style={{ margin: 0, padding: 0 }}>

        {currentView === 'welcome' && (
          <>
            <WelcomeScreen
              onLogin={handleShowLogin}
              onAbout={handleShowAbout}
              onTerms={handleShowTerms}
              onPrivacy={handleShowPrivacy}
              onManualLogin={handleManualLogin}
            />
            <AuthDialog
              open={showAuthDialog}
              onOpenChange={setShowAuthDialog}
              isLogin={isLoginMode}
              onToggle={handleAuthDialogToggle}
            />
          </>
        )}

        {currentView === 'about' && (
          <AboutUs onBack={handleBackToWelcome} />
        )}

        {currentView === 'terms' && (
          <TermsOfService onBack={handleBackToWelcome} />
        )}

        {currentView === 'privacy' && (
          <PrivacyPolicy onBack={handleBackToWelcome} />
        )}

        {currentView === 'login' && (
          <div className="h-fill bg-gradient-to-br from-purple-500 to-pink-500 flex items-start px-4 pt-8 overflow-y-auto relative" style={{ minHeight: '100vh' }}>
            {/* Video Background */}
            <VideoBackground />
            <AuthForm 
              isLogin={true}
              onToggle={handleShowRegister}
              onBack={handleBackToWelcome}
            />
          </div>
        )}

        {currentView === 'register' && (
          <div className="h-fill bg-gradient-to-br from-purple-500 to-pink-500 flex items-start justify-center px-4 pt-8 overflow-y-auto relative" style={{ minHeight: '100vh' }}>
            {/* Video Background - always rendered, loads async */}
            <VideoBackground />
            <RegistrationForm 
              onSubmit={handleRegister}
              onBackToLogin={handleBackToLogin}
            />
          </div>
        )}

        {currentView === 'profile-completion' && user && (
          <div className="h-fill bg-gradient-to-br from-purple-500 to-pink-500 flex items-start justify-center px-4 pt-8 overflow-y-auto relative" style={{ minHeight: '100vh' }}>
            <VideoBackground />
            <ProfileCompletionPage />
          </div>
        )}

        {currentView === 'terms-acceptance' && user && (
          <TermsAcceptance
            user={user}
            onAccept={handleTermsAccept}
          />
        )}

        {currentView === 'app' && user && (
          <ErrorBoundary>
            <MainApp user={user} onLogout={handleLogout} />
          </ErrorBoundary>
        )}

        {currentView === 'admin' && (
          <Suspense fallback={null}>
            <LazyAdminPage currentUser={user} onLogout={handleLogout} />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default Index;
