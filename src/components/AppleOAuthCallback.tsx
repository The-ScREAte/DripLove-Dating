import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Heart } from 'lucide-react';
import { handleCustomAppleCallback } from '@/utils/customAppleOAuth';

/**
 * Apple OAuth Callback Handler
 * Handles the redirect back from Apple's OAuth service for web users
 */
const AppleOAuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<string>('Processing Apple Sign-In...');

  useEffect(() => {
    const processAppleCallback = async () => {
      try {
        setStatus('Processing Apple authorization...');
        
        // The callback handler might redirect to Supabase callback
        const result = await handleCustomAppleCallback();
        
        if (result.needsProfileCompletion) {
          setStatus('Redirecting to profile completion...');
          toast({ 
            title: 'Welcome!', 
            description: "Please complete your profile to continue." 
          });
          navigate('/complete-profile');
        } else {
          setStatus('Welcome back! Redirecting...');
          toast({ 
            title: 'Welcome back!', 
            description: "You've been successfully signed in with Apple." 
          });
          navigate('/');
        }
        
      } catch (error: any) {
        console.error('Apple OAuth callback error:', error);
        
        // Handle specific error cases
        let errorMessage = 'Failed to complete Apple Sign-In';
        let errorDescription = error.message || 'Please try again.';
        
        if (error.message?.includes('blocked')) {
          errorMessage = 'Account Blocked';
          errorDescription = 'Your account has been blocked. Please contact support.';
        } else if (error.message?.includes('on hold')) {
          errorMessage = 'Account On Hold';
          errorDescription = 'Your account is on hold. Please contact support.';
        } else if (error.message?.includes('CSRF')) {
          errorMessage = 'Security Error';
          errorDescription = 'Invalid request state. Please try signing in again.';
        } else if (error.message?.includes('cancelled')) {
          errorMessage = 'Sign-In Cancelled';
          errorDescription = 'Apple Sign-In was cancelled.';
        }
        
        toast({
          title: errorMessage,
          description: errorDescription,
          variant: 'destructive',
        });
        
        // Redirect back to login after a short delay
        setTimeout(() => {
          navigate('/');
        }, 3000);
      }
    };

    processAppleCallback();
  }, [navigate, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50 px-4">
      <Card className="w-full max-w-md shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full">
              <Heart className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
            Apple Sign-In
          </CardTitle>
          <CardDescription className="text-gray-600">
            {status}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <div className="flex items-center space-x-3 text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin text-pink-500" />
            <span className="text-sm font-medium">Processing...</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AppleOAuthCallback;