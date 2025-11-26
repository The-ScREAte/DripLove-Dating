import React, { useState, useEffect, Suspense, lazy } from 'react';
import WelcomeScreen from '@/components/WelcomeScreen';
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
import { videoPreloader } from '@/utils/videoPreloader';

// Lazy load AdminPage (54KB) - only loads when admin features are accessed
const LazyAdminPage = lazy(() => import('@/components/AdminPage'));

// Loading component for lazy-loaded pages
const PageLoader = () => (
  <div className="min-h-fill bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
    <div className="text-center">
      <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

const Index = () => {
  const [currentView, setCurrentView] = useState<'welcome' | 'login' | 'register' | 'profile-completion' | 'terms-acceptance' | 'app' | 'admin' | 'about' | 'terms' | 'privacy'>('welcome');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Check if email is confirmed before proceeding
        if (!session.user.email_confirmed_at) {
          setLoading(false);
          return;
        }
        
        setUser(session.user);
        checkUserTypeAndRedirect(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // Check if email is confirmed before proceeding
        if (!session.user.email_confirmed_at) {
          setUser(null);
          setCurrentView('login');
          setLoading(false);
          return;
        }
        
        // Auth state changed for user ID: session.user.id
        setUser(session.user);
        checkUserTypeAndRedirect(session.user.id);
      } else {
        setUser(null);
        setCurrentView('welcome');
        setLoading(false);
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

  const checkUserTypeAndRedirect = async (userId: string) => {
    try {
      // Fast-path: if the OAuth handler just created a minimal profile it will
      // stash it in sessionStorage under 'oauth_profile'. Use that to avoid a
      // short timing window where the DB read may not yet return the new row.
      let profile: any = null;
      let error: any = null;

      try {
        if (typeof window !== 'undefined') {
          const raw = sessionStorage.getItem('oauth_profile');
          if (raw) {
            profile = JSON.parse(raw);
            // Clear it so subsequent checks rely on the DB
            try { sessionStorage.removeItem('oauth_profile'); } catch {}
          }
        }
      } catch (e) {
        // If sessionStorage is unavailable, fall back to DB
        profile = null;
      }

      if (!profile) {
        const result = await supabase
          .from('profiles')
          .select('is_admin, account_status, first_name, last_name, date_of_birth, country, city, gender, preference, relationship_intent, occupation, industry, education_level, terms_accepted')
          .eq('id', userId)
          .single();
        profile = result.data;
        error = result.error;
      }
      
      if (error || !profile) {
        console.error('Profile not found for user:', userId, 'Error:', error);
        // For OAuth users, profile might not be ready yet, wait and retry once
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const retryResult = await supabase
          .from('profiles')
          .select('is_admin, account_status, first_name, last_name, date_of_birth, country, city, gender, preference, relationship_intent, occupation, industry, education_level, terms_accepted')
          .eq('id', userId)
          .single();
          
        if (retryResult.error || !retryResult.data) {
          console.error('Profile still not found after retry, redirecting to profile completion');
          setLoading(false);
          setCurrentView('profile-completion');
          return;
        }
        
        profile = retryResult.data;
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
    setCurrentView('login');
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
    // Removed: Profile completion cancelled toast
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

  if (loading) {
    // Option 1: Show nothing while loading
    return null;
    // Option 2: Show a minimal blank screen
    // return <div style={{ minHeight: '100vh', background: '#fff' }} />;
  }
  
  if (currentView === 'admin') {
    return (
      <Suspense fallback={<PageLoader />}>
        <LazyAdminPage currentUser={user} onLogout={handleLogout} />
      </Suspense>
    );
  }
  
  
  return (
    <div className="w-full h-fill flex justify-center bg-transparent" style={{ margin: 0, padding: 0 }}>
      <div className="w-full h-fill" style={{ margin: 0, padding: 0 }}>

        {currentView === 'welcome' && (
          <WelcomeScreen
            onLogin={handleShowLogin}
            onAbout={handleShowAbout}
            onTerms={handleShowTerms}
            onPrivacy={handleShowPrivacy}
          />
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
          <div className="h-fill bg-gradient-to-br from-purple-500 to-pink-500 flex justify-center px-4 py-8 overflow-y-auto relative" style={{ minHeight: '100vh', paddingTop: '10vh' }}>
            {/* Video Background */}
            <div className="absolute inset-0 overflow-hidden">
              <video
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                src={videoPreloader.getVideoUrl()}
                className="absolute top-0 left-0 w-full h-full object-cover opacity-30"
                onLoadedData={(e) => {
                  e.currentTarget.play().catch(() => {});
                }}
                onTimeUpdate={(e) => {
                  const video = e.currentTarget;
                  if (video.duration && video.currentTime >= video.duration - 0.5) {
                    video.currentTime = 0;
                    video.play().catch(() => {});
                  }
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-pink-500/10 via-pink-500/20 to-pink-500/30"></div>
            </div>
            <div className="w-full max-w-md relative z-10">
              <AuthForm 
                isLogin={true}
                onToggle={handleShowRegister}
                onBack={handleBackToWelcome}
              />
            </div>
          </div>
        )}

        {currentView === 'register' && (
          <div className="h-fill bg-gradient-to-br from-purple-500 to-pink-500 flex justify-center px-4 py-8 overflow-y-auto relative" style={{ minHeight: '100vh', paddingTop: '5vh' }}>
            {/* Video Background - always rendered, loads async */}
            <div className="absolute inset-0 overflow-hidden">
              <video
                autoPlay
                loop
                muted
                playsInline
                webkit-playsinline="true"
                x5-playsinline="true"
                preload="auto"
                src={videoPreloader.getVideoUrl()}
                className="absolute top-0 left-0 w-full h-full object-cover opacity-30"
                onLoadedData={(e) => {
                  e.currentTarget.play().catch(() => {});
                }}
                onTimeUpdate={(e) => {
                  const video = e.currentTarget;
                  if (video.duration && video.currentTime >= video.duration - 0.5) {
                    video.currentTime = 0;
                    video.play().catch(() => {});
                  }
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-pink-500/10 via-pink-500/20 to-pink-500/30"></div>
            </div>
            <div className="w-full max-w-md relative z-10">
              <RegistrationForm 
                onSubmit={handleRegister}
                onBackToLogin={handleBackToLogin}
              />
            </div>
          </div>
        )}

        {currentView === 'profile-completion' && user && (
          <ProfileCompletionPage />
        )}

        {currentView === 'terms-acceptance' && user && (
          <TermsAcceptance
            user={user}
            onAccept={handleTermsAccept}
          />
        )}

        {currentView === 'app' && (
          <ErrorBoundary>
            <MainApp user={user} onLogout={handleLogout} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
};

export default Index;
