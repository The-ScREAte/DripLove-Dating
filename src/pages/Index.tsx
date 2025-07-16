import React, { useState, useEffect } from 'react';
import WelcomeScreen from '@/components/WelcomeScreen';
import AuthForm from '@/components/AuthForm';
import RegistrationForm from '@/components/RegistrationForm';
import ProfileCompletionForm from '@/components/ProfileCompletionForm';
import MainApp from '@/components/MainApp';
import AdminPage from '@/components/AdminPage';
import AboutUs from '@/components/AboutUs';
import TermsOfService from '@/components/TermsOfService';
import PrivacyPolicy from '@/components/PrivacyPolicy';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { transformFormDataForSubmission } from '@/utils/formValidation';

const Index = () => {
  const [currentView, setCurrentView] = useState<'welcome' | 'login' | 'register' | 'profile-completion' | 'app' | 'admin' | 'about' | 'terms' | 'privacy'>('welcome');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
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
        console.log("Auth state changed user ID:", session.user.id);
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
        .select('is_admin, account_status, first_name, last_name, date_of_birth, country, city, gender, preference, relationship_intent, occupation, industry, education_level')
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

      // Check if profile is incomplete (missing required fields)
      const requiredFields = ['first_name', 'last_name', 'date_of_birth', 'country', 'city', 'gender', 'preference', 'relationship_intent', 'occupation', 'industry', 'education_level'];
      const isIncomplete = requiredFields.some(field => !profile[field]);

      if (isIncomplete) {
        setCurrentView('profile-completion');
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
    try {
      if (formData.password !== formData.confirmPassword) {
        throw new Error("Passwords don't match");
      }

      // Include the new registration fields
      const essentials = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        date_of_birth: formData.dateOfBirth,
        country: formData.country,
        city: formData.city,
        zip_code: formData.zipCode,
        gender: formData.gender,
        preference: formData.preference,
        relationship_intent: formData.relationshipIntent,
        occupation: formData.occupation,
        industry: formData.industry,
        education_level: formData.educationLevel,
      };

      console.log('Registration essentials:', essentials);

      // Register user with Supabase Auth - the trigger will create the profile automatically
      const { data, error } = await supabase.auth.signUp({
        email: essentials.email,
        password: formData.password,
        options: {
          data: essentials,
        },
      });
      if (error) throw error;

      if (data.user) {
        setUser(data.user);
        setCurrentView('app');
      }

      toast({
        title: "Welcome to AfroVibe!",
        description: "Your account has been created successfully!",
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      toast({
        title: "Registration Error",
        description: error.message || "Failed to create account. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleProfileComplete = () => {
    // Re-check user type after profile completion
    if (user) {
      checkUserTypeAndRedirect(user.id);
    }
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

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white"></div>
      </div>
    );
  }
  
  if (currentView === 'admin') {
    return <AdminPage currentUser={user} onLogout={handleLogout} />;
  }
  
  
  return (
    <div className="w-full min-h-screen flex justify-center bg-background">
      <div className="mobile-container w-full h-full">
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

        {currentView === 'app' && <MainApp user={user} onLogout={handleLogout} />}
      </div>
    </div>
  );
};

export default Index;
