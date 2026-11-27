import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import AuthStatusScreen from '@/components/auth/AuthStatusScreen';

const OAuthCallback = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  // One calm failure state instead of a toast + silent redirect.
  const [failure, setFailure] = useState<{ message: string; actionLabel?: string } | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      // ✅ CRITICAL: Check if mobile FIRST, before ANY imports or processing
      // This ensures handleOAuthRedirect is NEVER loaded on native platforms
      let isNativePlatform = false;
      try {
        const { Capacitor } = await import('@capacitor/core');
        isNativePlatform = Capacitor?.isNativePlatform?.() || false;
      } catch (e) {
        // Not mobile
        isNativePlatform = false;
      }

      if (isNativePlatform) {
        setLoading(false);
        // Do NOT import handleOAuthRedirect
        // Do NOT call setSession
        // Do NOT do anything - useMobileOAuth is the single source of truth
        return null;
      }

      // ═══════════════════════════════════════════════════════════
      // WEB ONLY - Everything below this line runs ONLY on web
      // ═══════════════════════════════════════════════════════════
      
      try {
        // WEB ONLY: Check if this is a popup window (opened by parent for OAuth)
        const isPopup = window.opener && window.opener !== window;

        // Check for OAuth errors first
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
        const error = urlParams.get('error') || hashParams.get('error');
        const errorDescription = urlParams.get('error_description') || hashParams.get('error_description');

        if (error) {
          console.error('[OAuthCallback] OAuth error:', error, errorDescription);
          throw new Error(errorDescription || error);
        }

        // Import the shared OAuth handler
        const { handleOAuthRedirect } = await import('@/utils/oauthCallbackHandler');
        
        // Process the OAuth callback with the current URL
        const result = await handleOAuthRedirect(window.location.href);

        if (!result?.session) {
          throw new Error('No session created after OAuth callback');
        }

        const { user, profile, needsProfileCompletion } = result;

        // If this is a popup, notify parent window and close
        if (isPopup && window.opener) {
          try {
            // Post message to parent window
            window.opener.postMessage({ 
              type: 'oauth_complete', 
              success: true,
              userId: user.id,
              needsProfileCompletion
            }, window.location.origin);
            
            // Close the popup after a small delay
            setTimeout(() => {
              window.close();
            }, 100);
            return;
          } catch (e) {
            console.warn('[OAuthCallback] Failed to communicate with parent:', e);
            // Fall through to regular navigation
          }
        }

        // Check account status (only if profile exists)
        if (profile?.account_status === 'blocked') {
          await supabase.auth.signOut();
          setFailure({ message: t('auth.accountBlockedDesc'), actionLabel: t('auth.backToSignIn') });
          return;
        }

        if (profile?.account_status === 'on_hold') {
          await supabase.auth.signOut();
          setFailure({ message: t('auth.accountOnHoldDesc'), actionLabel: t('auth.backToSignIn') });
          return;
        }

        // Store profile ID if exists
        if (profile?.id) {
          sessionStorage.setItem('profile_id', profile.id);
        }

        // Use needsProfileCompletion flag - same logic as Apple/Android native
        if (needsProfileCompletion) {
          navigate('/complete-profile', { replace: true });
          return;
        }

        // Success - redirect to home
        navigate('/', { replace: true });

      } catch (error: any) {
        console.error('[OAuthCallback] OAuth callback error:', error);
        
        // If popup, notify parent of failure
        if (window.opener && window.opener !== window) {
          try {
            window.opener.postMessage({ 
              type: 'oauth_complete', 
              success: false,
              error: error.message
            }, window.location.origin);
            setTimeout(() => window.close(), 100);
            return;
          } catch (e) {
            // Fall through
          }
        }
        
        // Plain-language reason only - never the raw provider/technical message.
        const raw = String(error?.message || '').toLowerCase();
        const cancelled = raw.includes('cancel') || raw.includes('access_denied');
        setFailure({ message: cancelled ? t('auth.signInCancelled') : t('auth.signInFailedBody') });
      } finally {
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [navigate, t]);

  if (failure) {
    return (
      <AuthStatusScreen
        state="error"
        message={failure.message}
        actionLabel={failure.actionLabel}
        onRetry={() => navigate('/', { replace: true })}
      />
    );
  }

  // Show loading state during callback processing
  if (loading) {
    return <AuthStatusScreen state="loading" />;
  }

  return null;
};

export default OAuthCallback;
