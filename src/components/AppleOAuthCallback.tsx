import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthStatusScreen from '@/components/auth/AuthStatusScreen';
import { handleCustomAppleCallback } from '@/utils/customAppleOAuth';

/**
 * Apple OAuth Callback Handler
 * Handles the redirect back from Apple's OAuth service for web users
 */
const AppleOAuthCallback = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isNativeMobile, setIsNativeMobile] = useState(false);
  const [failure, setFailure] = useState<{ message: string; actionLabel?: string } | null>(null);

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
        
        // Plain-language reason only - never the raw provider/technical message.
        const raw = String(error?.message || '').toLowerCase();
        if (raw.includes('blocked')) {
          setFailure({ message: t('auth.accountBlockedDesc'), actionLabel: t('auth.backToSignIn') });
        } else if (raw.includes('on hold')) {
          setFailure({ message: t('auth.accountOnHoldDesc'), actionLabel: t('auth.backToSignIn') });
        } else if (raw.includes('cancel')) {
          setFailure({ message: t('auth.signInCancelled') });
        } else {
          setFailure({ message: t('auth.signInFailedBody') });
        }
      }
    };

    processAppleCallback();
  }, [navigate, t]);

  // Native: redirect immediately and let the main app's own loading screen take over.
  if (isNativeMobile) return null;

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

  return <AuthStatusScreen state="loading" />;
};

export default AppleOAuthCallback;