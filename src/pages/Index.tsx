
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AuthForm from '@/components/AuthForm';
import WelcomeScreen from '@/components/WelcomeScreen';
import MainApp from '@/components/MainApp';
import AboutUs from '@/components/AboutUs';
import AdminPage from '@/components/AdminPage';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGetStarted = () => {
    setShowAuth(true);
  };

  const handleAdminAccess = () => {
    setShowAdmin(true);
  };

  const handleAboutUs = () => {
    setShowAbout(true);
  };

  const handleBackToWelcome = () => {
    setShowAuth(false);
    setShowAdmin(false);
    setShowAbout(false);
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast({
        title: "Logged out successfully",
        description: "See you soon!",
      });
    } catch (error: any) {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white"></div>
      </div>
    );
  }

  // Show About Us page
  if (showAbout) {
    return <AboutUs onBack={handleBackToWelcome} />;
  }

  // Show admin page
  if (showAdmin) {
    return <AdminPage onBack={handleBackToWelcome} />;
  }

  // Show auth form
  if (showAuth && !user) {
    return <AuthForm onBack={handleBackToWelcome} />;
  }

  // Show main app if authenticated
  if (user) {
    return <MainApp user={user} onLogout={handleLogout} />;
  }

  // Show welcome screen
  return (
    <WelcomeScreen 
      onGetStarted={handleGetStarted}
      onAdminAccess={handleAdminAccess}
      onAboutUs={handleAboutUs}
    />
  );
};

export default Index;
