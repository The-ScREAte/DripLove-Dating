import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import ProfileCompletionForm from './ProfileCompletionForm';
import TermsAcceptance from './TermsAcceptance';

const ProfileCompletionPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showTermsAcceptance, setShowTermsAcceptance] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
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
        setLoading(false);
      } catch (error) {
        console.error('Error in profile completion page:', error);
        navigate('/');
      }
    };

    getUser();
  }, [navigate]);

  const handleProfileComplete = () => {
    // Show terms acceptance after profile completion
    setShowTermsAcceptance(true);
  };

  const handleTermsAccept = () => {
    toast({
      title: "Welcome to DripLove!",
      description: "Your profile has been completed and terms accepted. Welcome to the community!",
    });
    navigate('/');
  };

  const handleCancel = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Profile completion cancelled",
      description: "You have been signed out.",
    });
    navigate('/');
  };

  if (loading) {
    return (
      <div className="h-fill bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  // Show terms acceptance after profile completion
  if (showTermsAcceptance) {
    return (
      <TermsAcceptance
        user={user}
        onAccept={handleTermsAccept}
      />
    );
  }

  return (
    <div className="h-fill bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-start justify-center px-4 py-8 overflow-y-auto"
         style={{ 
           minHeight: '100vh',
           touchAction: 'pan-x pan-y',
           userSelect: 'none',
           WebkitUserSelect: 'none',
           WebkitTouchCallout: 'none'
         }}>
      <div className="w-full max-w-md">
        <ProfileCompletionForm
          user={user}
          onComplete={handleProfileComplete}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
};

export default ProfileCompletionPage;
