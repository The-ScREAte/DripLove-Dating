import React, { useState, useEffect } from 'react';
import WelcomeScreen from '@/components/WelcomeScreen';
import AuthForm from '@/components/AuthForm';
import RegistrationForm from '@/components/RegistrationForm';
import ProfileCompletionForm from '@/components/ProfileCompletionForm';
import TermsAcceptance from '@/components/TermsAcceptance';
import MainApp from '@/components/MainApp';
import AdminPage from '@/components/AdminPage';
import AboutUs from '@/components/AboutUs';
import TermsOfService from '@/components/TermsOfService';
import PrivacyPolicy from '@/components/PrivacyPolicy';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { transformFormDataForSubmission } from '@/utils/formValidation';

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
          console.log('Existing session found but email not confirmed - staying on welcome screen');
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
          console.log('User session exists but email not confirmed - staying on welcome screen');
          setUser(null);
          setCurrentView('welcome');
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
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin, account_status, first_name, last_name, date_of_birth, country, city, gender, preference, relationship_intent, occupation, industry, education_level, terms_accepted')
        .eq('id', userId)
        .single();
      
      if (error || !profile) {
        console.error('Profile not found for user:', userId);
        // For OAuth users, they might not have a profile yet, redirect to profile completion
        setCurrentView('profile-completion');
        setLoading(false);
        return;
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

      // Check if user has accepted terms
      if (!profile.terms_accepted) {
        setCurrentView('terms-acceptance');
        setLoading(false);
        return;
      }

      // Check if profile is incomplete (missing required fields)
      // Only redirect to profile completion for OAuth users (Google)
      // Manual registration users get basic profiles and can update later
      const requiredFields = ['first_name', 'last_name', 'date_of_birth', 'country', 'city', 'gender', 'preference', 'relationship_intent', 'occupation', 'industry', 'education_level'];
      const isIncomplete = requiredFields.some(field => !profile[field]);

      if (isIncomplete) {
        // Check if this is an OAuth user by looking at the auth provider
        const { data: { user } } = await supabase.auth.getUser();
        const isOAuthUser = user?.app_metadata?.provider === 'google';
        
        if (isOAuthUser) {
          setCurrentView('profile-completion');
          setLoading(false);
          return;
        }
        // Manual registration users skip profile completion and go directly to app
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
    toast({
      title: "Profile completion cancelled",
      description: "You need to complete your profile to use the app.",
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setCurrentView('welcome');
  };

  const handleTermsAccept = () => {
    setCurrentView('app');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white"></div>
      </div>
    );
  }
  
  if (currentView === 'admin') {
    return <AdminPage currentUser={user} onLogout={handleLogout} />;
  }
  
  
  return (
    <div className="w-full min-h-screen flex justify-center bg-background">
      <div className="w-full h-full">
        {currentView === 'welcome' && (
          <WelcomeScreen 
            onGetStarted={handleGetStarted} 
            onAdminAccess={handleAdminAccess}
            onShowAbout={handleShowAbout}
            onShowTerms={handleShowTerms}
            onShowPrivacy={handleShowPrivacy}
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
          <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4">
            <AuthForm 
              isLogin={true}
              onToggle={handleShowRegister}
            />
          </div>
        )}

        {currentView === 'register' && (
          <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4">
            <RegistrationForm 
              onSubmit={handleRegister}
              onBackToLogin={handleBackToLogin}
            />
          </div>
        )}

        {currentView === 'profile-completion' && user && (
          <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4">
            <ProfileCompletionForm
              user={user}
              onComplete={handleProfileComplete}
              onCancel={handleProfileCancel}
            />
          </div>
        )}

        {currentView === 'terms-acceptance' && user && (
          <TermsAcceptance
            user={user}
            onAccept={handleTermsAccept}
          />
        )}

        {currentView === 'app' && <MainApp user={user} onLogout={handleLogout} />}
      </div>
    </div>
  );
};

export default Index;
