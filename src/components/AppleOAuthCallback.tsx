import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { handleCustomAppleCallback } from '@/utils/customAppleOAuth';

/**
 * Apple OAuth Callback Handler
 * Handles the redirect back from Apple's OAuth service for web users
 */
const AppleOAuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isNativeMobile, setIsNativeMobile] = useState(false);

  useEffect(() => {
    // Check if we're on native mobile first
    const checkPlatform = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
          setIsNativeMobile(true);
          // Immediately navigate to Index - useMobileOAuth will handle auth
          navigate('/', { replace: true });
          return true;
        }
      } catch (e) {
        // Capacitor not available -> web flow
      }
      return false;
    };

    const processAppleCallback = async () => {
      // Check platform first and skip if native mobile
      const isNative = await checkPlatform();
      if (isNative) return;

      try {
        // The callback handler might redirect to Supabase callback
        const result = await handleCustomAppleCallback();
        
        if (result.needsProfileCompletion) {
          navigate('/complete-profile');
        } else {
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

  // Don't show any UI for native mobile - just redirect immediately and use main app loading screen
  return null;
};

export default AppleOAuthCallback;