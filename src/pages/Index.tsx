
import React, { useState, useEffect } from 'react';
import WelcomeScreen from '@/components/WelcomeScreen';
import AuthForm from '@/components/AuthForm';
import RegistrationForm from '@/components/RegistrationForm';
import MainApp from '@/components/MainApp';
import AdminPage from '@/components/AdminPage';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const Index = () => {
  const [currentView, setCurrentView] = useState<'welcome' | 'login' | 'register' | 'app' | 'admin'>('welcome');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) {
        setCurrentView('app');
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        console.log("Auth state changed user ID:", session.user.id);
        setCurrentView('app');
      } else {
        setCurrentView('welcome');
      }
    });
    

    return () => subscription.unsubscribe();
  }, []);

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
    setCurrentView('admin');
  };

  const handleBackToWelcome = () => {
    setCurrentView('welcome');
  };

  const handleLogin = async (formData: any) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) throw error;

      console.log("Logged in user ID:", data.user?.id);
      
      toast({
        title: "Welcome back to AfroVibe!",
        description: "You've been successfully logged in.",
      });
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRegister = async (formData: any) => {
    try {
      if (formData.password !== formData.confirmPassword) {
        throw new Error("Passwords don't match");
      }

      // Check if user already exists by attempting to sign in first
      const { data: existingUser } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: 'dummy_password'
      });

      if (existingUser?.user) {
        throw new Error("An account with this email already exists. Please try logging in instead.");
      }

      // Transform the form data before sending to Supabase
      const transformedData = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        date_of_birth: formData.dateOfBirth,
        country: formData.country,
        city: formData.city,
        bio: formData.bio,
        preference: formData.preference,
        interests: formData.interests,
        gender: formData.gender,
        relationship_intent: formData.relationshipIntent,
        smoking: formData.smoking,
        drinking: formData.drinking,
        exercise_level: formData.exerciseLevel,
        sleeping_schedule: formData.sleepingSchedule,
        occupation: formData.occupation,
        industry: formData.industry,
        education_level: formData.educationLevel,
        zip_code: formData.zipCode,
        introvert_extrovert: formData.introvertExtrovert[0],
        spontaneous_planner: formData.spontaneousPlanner[0],
        messy_organized: formData.messyOrganized[0],
        fun_fact: formData.funFact,
        perfect_first_date: formData.perfectFirstDate,
        last_googled: formData.lastGoogled,
      };

      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: transformedData,
        },
      });
      
      if (error) throw error;
      
      if (data.user) {
        await supabase.from("profiles").insert({
          id: data.user.id,
          email: data.user.email,
          ...transformedData,
        });
      }
      

      if (error) {
        if (error.message.includes('User already registered')) {
          throw new Error("An account with this email already exists. Please try logging in instead.");
        }
        throw error;
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

  const handleLogout = () => {
    setUser(null);
    setCurrentView('welcome');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white"></div>
      </div>
    );
  }

  if (currentView === 'admin') {
    return <AdminPage />;
  }

  if (currentView === 'welcome') {
    return <WelcomeScreen onGetStarted={handleGetStarted} onAdminAccess={handleAdminAccess} />;
  }

  if (currentView === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4">
        <AuthForm 
          isLogin={true}
          onToggle={handleShowRegister}
          onSubmit={handleLogin}
        />
      </div>
    );
  }

  if (currentView === 'register') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4">
        <RegistrationForm 
          onSubmit={handleRegister}
          onBackToLogin={handleBackToLogin}
        />
      </div>
    );
  }

  return <MainApp user={user} onLogout={handleLogout} />;
};

export default Index;
