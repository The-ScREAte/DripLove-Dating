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

// Lazy load AdminPage (54KB) - only loads when admin features are accessed
const LazyAdminPage = lazy(() => import('@/components/AdminPage'));

// Loading component for lazy-loaded pages - minimal spinner
const PageLoader = () => null;

const Index = () => {
  // Restore view from sessionStorage to persist on reload - instant view
  const getInitialView = () => {
    try {
      const savedSession = sessionStorage.getItem('driplove_user_session');
      if (savedSession === 'authenticated') {
        return 'app' as const;
      }
      const savedView = sessionStorage.getItem('driplove_current_view');
      if (savedView === 'register' || savedView === 'profile-completion') {
        return savedView as 'register' | 'profile-completion';
      }
    } catch {}
    return 'welcome' as const;
  };
  
  const initialView = getInitialView();
  const [currentView, setCurrentView] = useState<'welcome' | 'login' | 'register' | 'profile-completion' | 'terms-acceptance' | 'app' | 'admin' | 'about' | 'terms' | 'privacy'>(initialView);
  const [user, setUser] = useState<any>(null);
  // If we have a cached session, don't show loading - validate in background
  const [loading, setLoading] = useState(initialView !== 'app');
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const { toast } = useToast();

  // Save view to sessionStorage when it changes
  React.useEffect(() => {
    try {
      if (currentView === 'register' || currentView === 'profile-completion') {
        sessionStorage.setItem('driplove_current_view', currentView);
      } else {
        sessionStorage.removeItem('driplove_current_view');
      }
      // Persist authenticated state
      if (currentView === 'app' || currentView === 'admin') {
        sessionStorage.setItem('driplove_user_session', 'authenticated');
      } else if (currentView === 'welcome' || currentView === 'login') {
        sessionStorage.removeItem('driplove_user_session');
      }
    } catch {}
  }, [currentView]);

  useEffect(() => {
    // Prevent re-initialization
    if (authInitialized) return;
    
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Session error - clear session storage and show welcome
        sessionStorage.removeItem('driplove_user_session');
        setLoading(false);
        setCurrentView('welcome');
        setAuthInitialized(true);
        return;
      }
      
      if (session?.user) {
        // Check if email is confirmed before proceeding
        if (!session.user.email_confirmed_at) {
          setLoading(false);
          setCurrentView('welcome');
          setAuthInitialized(true);
          return;
        }
        
        setUser(session.user);
        checkUserTypeAndRedirect(session.user.id);
        setAuthInitialized(true);
      } else {
        // No session - clear any saved session state and show welcome
        sessionStorage.removeItem('driplove_user_session');
        setCurrentView('welcome');
        setLoading(false);
        setAuthInitialized(true);
      }
    }).catch(() => {
      // Handle any errors by showing welcome screen
      sessionStorage.removeItem('driplove_user_session');
      setLoading(false);
      setCurrentView('welcome');
      setAuthInitialized(true);
    });

    // Listen for auth changes (but only respond to actual sign in/out events)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // Skip initial session event - we handle that above
      if (_event === 'INITIAL_SESSION') return;
      
      if (session?.user) {
        // Check if email is confirmed before proceeding
        if (!session.user.email_confirmed_at) {
          setUser(null);
          setCurrentView('login');
          setLoading(false);
          return;
        }
        
        // Track last login - update profile with login timestamp (non-blocking)
        if (_event === 'SIGNED_IN') {
          // Preload pricing config in background
          preloadPricingConfig(session.user.id);
          
          (async () => {
            try {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('login_count')
                .eq('id', session.user.id)
                .maybeSingle();
              
              if (profileData) {
                const currentCount = profileData.login_count || 0;
                await supabase
                  .from('profiles')
                  .update({ 
                    last_login_at: new Date().toISOString(),
                    login_count: currentCount + 1
                  })
                  .eq('id', session.user.id);
              }
            } catch {}
          })();
        }
        
        // Auth state changed for user ID: session.user.id
        setUser(session.user);
        checkUserTypeAndRedirect(session.user.id);
      } else if (_event === 'SIGNED_OUT') {
        // Only clear on explicit sign out, not on every state change
        setUser(null);
        sessionStorage.removeItem('driplove_user_session');
        setCurrentView('welcome');
        setLoading(false);
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

  const checkUserTypeAndRedirect = async (userId: string) => {
    try {
      // Fast-path: check sessionStorage for OAuth profile first
      let profile: any = null;

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
        
        // If no profile found, check if OAuth user needs profile completion
        if (!profile) {
          // Get auth user info to check provider
          const { data: { user: authUser } } = await supabase.auth.getUser();
          const provider = authUser?.app_metadata?.provider;
          const isOAuthUser = provider === 'google' || provider === 'apple';
          
          if (isOAuthUser) {
            setLoading(false);
            setCurrentView('profile-completion');
            return;
          }
          
          // Non-OAuth users need to register
          await supabase.auth.signOut();
          setLoading(false);
          setCurrentView('register');
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
        setCurrentView('welcome');
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
        setCurrentView('welcome');
        setLoading(false);
        return;
      }

      // Check if profile is incomplete (missing required fields)
      // Only redirect to profile completion for OAuth users (Google)
      // Manual registration users get basic profiles and can update later
      const requiredFields = ['first_name', 'last_name', 'date_of_birth', 'country', 'city', 'gender', 'preference', 'relationship_intent', 'occupation', 'industry', 'education_level'];
      const isIncomplete = requiredFields.some(field => !profile[field]);

      // Check if this is an OAuth user by looking at the auth provider
      const { data: { user } } = await supabase.auth.getUser();
      const provider = user?.app_metadata?.provider;
      const isOAuthUser = provider === 'google' || provider === 'apple';

      // For OAuth users with incomplete profiles, redirect to profile completion
      // ProfileCompletionPage will handle showing terms acceptance after completion
      if (isIncomplete && isOAuthUser) {
        setCurrentView('profile-completion');
        setLoading(false);
        return;
      }

      // For complete profiles, check if user has accepted terms
      if (!profile.terms_accepted) {
        setCurrentView('terms-acceptance');
        setLoading(false);
        return;
      }

      // Redirect based on user type
      if (profile?.is_admin) {
        setCurrentView('admin');
      } else {
        setCurrentView('app');
      }
    } catch (error) {
      console.error('Error checking user type:', error);
      // On error, sign out and redirect to welcome
      await supabase.auth.signOut();
      setCurrentView('welcome');
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
  const handleRegister = async (formData: any) => {
    // Registration is now fully handled in RegistrationForm, just update user and view if needed
    // If RegistrationForm returns a user, set it and show terms
    if (formData && formData.email) {
      // Try to fetch the user from Supabase after registration
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        setCurrentView('terms-acceptance');
      }
    }
  };

  const handleProfileComplete = () => {
    // After profile completion, show terms acceptance
    setCurrentView('terms-acceptance');
  };

  const handleProfileCancel = async () => {
    // Sign out the user if they cancel profile completion
    await supabase.auth.signOut();
    setUser(null);
    setCurrentView('welcome');
  };

  const handleLogout = async () => {
    // Remove push token before logging out
    if (user?.id) {
      const { removePushToken } = await import('@/services/pushNotifications');
      await removePushToken(user.id);
    }
    
    await supabase.auth.signOut();
    setUser(null);
    setCurrentView('welcome');
  };

  const handleTermsAccept = () => {
    setCurrentView('app');
  };

  
  
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
