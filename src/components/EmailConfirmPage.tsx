import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

const completeRegistration = async (userId: string, formData: any, images: any[]) => {
  // 1. Save profile data
  const profileData = {
    id: userId,
    email: formData.email,
    first_name: formData.firstName,
    last_name: formData.lastName,
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
    bio: formData.bio || '',
    interests: formData.interests || [],
    latitude: formData.latitude,
    longitude: formData.longitude,
    is_custom_city: formData.isCustomCity || false,
    max_distance: formData.maxDistance || 250,
    country_code: formData.countryCode || ''
  };

  // First check if profile already exists
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single();

  if (existingProfile) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update(profileData)
      .eq('id', userId);
    if (profileError) throw profileError;
  } else {
    const { error: profileError } = await supabase
      .from('profiles')
      .insert(profileData);
    if (profileError) throw profileError;
  }

  // 2. Upload images (skip this for now as files are not preserved in session storage)
};

const EmailConfirmPage = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'already_confirmed'>('loading');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const confirmEmail = async () => {
      try {
        // Extract token from URL params
        const urlParams = new URLSearchParams(location.search);
        const token = urlParams.get('token') || urlParams.get('confirmation_token');
        const type = urlParams.get('type') || 'signup';
        
        if (!token) {
          setStatus('error');
          setMessage('Invalid confirmation link. No token found.');
          return;
        }


        // Try to confirm email with the token
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: type as any
        });

        if (error) {
          console.error('Email verification error:', error);
          
          if (error.message.includes('already confirmed') || error.message.includes('already verified')) {
            setStatus('already_confirmed');
            setMessage('Your email has already been confirmed. You can now log in.');
          } else {
            setStatus('error');
            setMessage(error.message || 'Failed to confirm email. The link may be expired or invalid.');
          }
          return;
        }

        if (data.user) {
          
          // Check if there's pending registration data to complete
          const pendingData = sessionStorage.getItem('pending_registration_data');
          if (pendingData) {
            try {
              const { formData, images, userId } = JSON.parse(pendingData);
              
              // Complete the profile creation
              await completeRegistration(userId, formData, images);
              
              // Clear the pending data
              sessionStorage.removeItem('pending_registration_data');
              
              setStatus('success');
              setMessage('Your email has been confirmed and your profile has been created! Welcome to DripLove!');

              // Redirect to the app after 3 seconds
              setTimeout(() => {
                window.location.href = '/';
              }, 3000);
            } catch (error) {
              console.error('Error completing registration:', error);
              setStatus('success');
              setMessage('Your email has been confirmed! Please sign in to complete your profile.');
              
              setTimeout(() => {
                navigate('/?login=true');
              }, 3000);
            }
          } else {
            setStatus('success');
            setMessage('Your email has been successfully confirmed! You can now log in to your account.');

            // Redirect to login after 3 seconds
            setTimeout(() => {
              navigate('/?login=true');
            }, 3000);
          }
        } else {
          setStatus('error');
          setMessage('Email confirmation failed. Please try again or contact support.');
        }

      } catch (error) {
        console.error('Email confirmation error:', error);
        setStatus('error');
        setMessage('An unexpected error occurred. Please try again.');
      }
    };

    confirmEmail();
  }, [location.search, navigate, toast]);

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />;
      case 'error':
        return <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />;
      case 'already_confirmed':
        return <CheckCircle className="w-16 h-16 text-blue-500 mx-auto mb-4" />;
      default:
        return <Clock className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-pulse" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'text-green-700';
      case 'error':
        return 'text-red-700';
      case 'already_confirmed':
        return 'text-blue-700';
      default:
        return 'text-gray-700';
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'success':
        return 'Email Confirmed!';
      case 'error':
        return 'Confirmation Failed';
      case 'already_confirmed':
        return 'Already Confirmed';
      default:
        return 'Confirming Email...';
    }
  };

  return (
  <div className="min-h-fill bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4">
      <Card className="w-full max-w-md mx-auto backdrop-blur-sm bg-white/95 shadow-2xl border-0">
        <CardHeader className="text-center pb-6">
          {getStatusIcon()}
          <CardTitle className={`text-2xl font-bold ${getStatusColor()}`}>
            {getStatusTitle()}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <p className={`text-lg ${getStatusColor()}`}>
            {message}
          </p>
          
          {status === 'loading' && (
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500"></div>
              <span className="text-gray-600">Please wait...</span>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Redirecting you to login in a few seconds...
              </p>
              <Button 
                onClick={() => navigate('/?login=true')}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
              >
                Continue to Login
              </Button>
            </div>
          )}

          {(status === 'error' || status === 'already_confirmed') && (
            <div className="space-y-4">
              <Button 
                onClick={() => navigate('/?login=true')}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
              >
                Go to Login
              </Button>
              <Button 
                variant="outline"
                onClick={() => navigate('/')}
                className="w-full"
              >
                Back to Home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailConfirmPage;
