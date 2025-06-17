import React, { useState, useEffect } from 'react';
import WelcomeScreen from '@/components/WelcomeScreen';
import AuthForm from '@/components/AuthForm';
import RegistrationForm from '@/components/RegistrationForm';
import MainApp from '@/components/MainApp';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const Index = () => {
  const [currentView, setCurrentView] = useState<'welcome' | 'login' | 'register' | 'app'>('welcome');
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth error:', error);
          setCurrentView('welcome');
          setLoading(false);
          return;
        }

        if (session?.user) {
          await handleUserSession(session.user);
        } else {
          setCurrentView('welcome');
        }
      } catch (error) {
        console.error('Initialization error:', error);
        setCurrentView('welcome');
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        setProfile(null);
        setCurrentView('welcome');
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        await handleUserSession(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [toast]);

  const handleUserSession = async (user: any) => {
    try {
      // Try to get the profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        // PGRST116 is "not found", other errors are real problems
        console.error('Profile fetch error:', profileError);
        toast({
          title: "Database Error",
          description: "There was a problem accessing your profile. Please try again.",
          variant: "destructive",
        });
        await supabase.auth.signOut();
        return;
      }

      if (!profileData) {
        // Profile doesn't exist, create a basic one
        console.log('No profile found, creating basic profile for user:', user.id);
        
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            first_name: user.user_metadata?.first_name || 'User',
            last_name: user.user_metadata?.last_name || '',
            email: user.email || '',
            date_of_birth: user.user_metadata?.date_of_birth || '1990-01-01',
            country: user.user_metadata?.country || 'Unknown',
            city: user.user_metadata?.city || 'Unknown',
            bio: user.user_metadata?.bio || '',
            preference: user.user_metadata?.preference || 'both',
            interests: user.user_metadata?.interests || [],
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating profile:', createError);
          toast({
            title: "Setup Error",
            description: "We couldn't set up your profile. Please try logging in again.",
            variant: "destructive",
          });
          await supabase.auth.signOut();
          return;
        }

        setProfile(newProfile);
      } else {
        setProfile(profileData);
      }

      setUser(user);
      setCurrentView('app');
    } catch (error) {
      console.error('User session handling error:', error);
      toast({
        title: "Authentication Error",
        description: "There was a problem with your session. Please try logging in again.",
        variant: "destructive",
      });
      await supabase.auth.signOut();
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

  const handleLogin = async (formData: any) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) throw error;

      // User validation will happen in the auth state change listener
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        title: "Login Error",
        description: error.message || "Failed to login. Please check your credentials.",
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
        introvert_extrovert: formData.introvertExtrovert[0], // Extract single value from array
        spontaneous_planner: formData.spontaneousPlanner[0], // Extract single value from array
        messy_organized: formData.messyOrganized[0], // Extract single value from array
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

      if (error) {
        if (error.message.includes('User already registered')) {
          throw new Error("An account with this email already exists. Please try logging in instead.");
        }
        throw error;
      }

      toast({
        title: "Account created!",
        description: "Welcome to LoveConnect! You can now start using the app.",
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

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white"></div>
      </div>
    );
  }

  if (currentView === 'welcome') {
    return <WelcomeScreen onGetStarted={() => setCurrentView('login')} />;
  }

  if (currentView === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4">
        <AuthForm 
          isLogin={true}
          onToggle={() => setCurrentView('register')}
          onSubmit={handleLogin}
        />
      </div>
    );
  }

  if (currentView === 'register') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4">
        <RegistrationForm 
          onSubmit={async (formData: any) => {
            try {
              if (formData.password !== formData.confirmPassword) {
                throw new Error("Passwords don't match");
              }

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

              if (error) {
                if (error.message.includes('User already registered')) {
                  throw new Error("An account with this email already exists. Please try logging in instead.");
                }
                throw error;
              }

              toast({
                title: "Account created!",
                description: "Welcome to LoveConnect! You can now start using the app.",
              });
            } catch (error: any) {
              console.error('Registration error:', error);
              toast({
                title: "Registration Error",
                description: error.message || "Failed to create account. Please try again.",
                variant: "destructive",
              });
            }
          }}
          onBackToLogin={() => setCurrentView('login')}
        />
      </div>
    );
  }

  return user && profile ? (
    <MainApp user={user} onLogout={handleLogout} />
  ) : (
    <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center">
      <div className="text-white text-center">
        <h2 className="text-2xl font-bold mb-4">Loading...</h2>
        <p>Please wait while we set up your account.</p>
      </div>
    </div>
  );
};

export default Index;
