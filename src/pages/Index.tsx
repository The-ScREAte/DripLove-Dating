
import React, { useState, useEffect } from 'react';
import { Toaster } from '@/components/ui/toaster';
import WelcomeScreen from '@/components/WelcomeScreen';
import AuthForm from '@/components/AuthForm';
import MainApp from '@/components/MainApp';
import AdminPage from '@/components/AdminPage';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Check if user is admin
          setTimeout(async () => {
            try {
              const { data, error } = await supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', session.user.id)
                .single();
              
              if (!error && data?.is_admin) {
                setIsAdmin(true);
                setShowAdmin(true);
                setShowAuth(false);
              } else {
                setIsAdmin(false);
                setShowAdmin(false);
                setShowAuth(false);
              }
            } catch (error) {
              console.error('Error checking admin status:', error);
              setIsAdmin(false);
            }
          }, 0);
        } else {
          setIsAdmin(false);
          setShowAdmin(false);
        }
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGetStarted = () => {
    setShowAuth(true);
  };

  const handleAdminAccess = () => {
    setShowAuth(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setShowAuth(false);
    setShowAdmin(false);
    setIsAdmin(false);
  };

  const handleUnauthorized = () => {
    setShowAdmin(false);
    setShowAuth(false);
    setIsAdmin(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  // Show admin page for authenticated admin users
  if (user && isAdmin && showAdmin) {
    return (
      <>
        <AdminPage currentUser={user} onUnauthorized={handleUnauthorized} />
        <Toaster />
      </>
    );
  }

  // Show main app for authenticated regular users
  if (user && !showAuth && !isAdmin) {
    return (
      <>
        <MainApp user={user} onLogout={handleLogout} />
        <Toaster />
      </>
    );
  }

  // Show auth form
  if (showAuth) {
    return (
      <>
        <AuthForm onBack={() => setShowAuth(false)} />
        <Toaster />
      </>
    );
  }

  // Show welcome screen
  return (
    <>
      <WelcomeScreen 
        onGetStarted={handleGetStarted} 
        onAdminAccess={handleAdminAccess}
      />
      <Toaster />
    </>
  );
};

export default Index;
