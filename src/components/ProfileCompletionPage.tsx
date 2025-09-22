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
  <div className="min-h-fill flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-500"></div>
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
  <div className="min-h-fill bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center p-4"
         style={{ 
           touchAction: 'pan-x pan-y',
           userSelect: 'none',
           WebkitUserSelect: 'none',
           WebkitTouchCallout: 'none'
         }}>
      <ProfileCompletionForm
        user={user}
        onComplete={handleProfileComplete}
        onCancel={handleCancel}
      />
    </div>
  );
};

export default ProfileCompletionPage;
