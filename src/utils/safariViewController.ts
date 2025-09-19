/**
 * Safari View Controller utility for iOS
 * Implements in-app browser functionality to comply with Apple App Store guidelines
 */

import { supabase } from '@/integrations/supabase/client';

import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

interface SafariViewControllerOptions {
  url: string;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  onComplete?: () => void;
}

/**
 * Opens Apple Sign In using Safari View Controller on iOS
 * Falls back to external browser on other platforms
 */
export const openAppleSignInWithSafariViewController = async (
  redirectTo: string,
  options: {
    onSuccess?: (data: any) => void;
    onError?: (error: any) => void;
    onComplete?: () => void;
  } = {}
) => {
  try {
    // Check if we're on iOS native platform
    const platform = Capacitor.getPlatform();
    const isNativePlatform = Capacitor.isNativePlatform();
    const isNativeiOS = isNativePlatform && platform === 'ios';
    
    console.log('Safari View Controller Debug:', {
      platform,
      isNativePlatform,
      isNativeiOS
    });
    
    if (isNativeiOS) {
      console.log('✅ Using Safari View Controller for Apple Sign In on iOS native app');
      
      // Use Safari View Controller for iOS
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo,
          queryParams: {
            prompt: 'select_account',
          }
        }
      });

      if (error) {
        console.error('Apple OAuth error:', error);
        options.onError?.(error);
        return { data: null, error };
      }

      if (data?.url) {
        console.log('Opening Apple OAuth URL in Safari View Controller:', data.url);
        
        // Open the OAuth URL in Safari View Controller
        await Browser.open({
          url: data.url,
          // Safari View Controller configuration for iOS
          toolbarColor: '#000000',
        });

        // Listen for URL changes to catch the callback
        const browserPageLoadedListener = await Browser.addListener('browserPageLoaded', (info) => {
          console.log('Safari View Controller page loaded:', info.url);
          
          // Check if this is our callback URL
          if (info.url && (info.url.includes('capacitor://localhost/auth/callback') || info.url.includes('/auth/callback'))) {
            console.log('✅ Detected callback URL in Safari View Controller, closing browser');
            
            // Clean up listeners first
            browserPageLoadedListener.remove();
            browserFinishedListener.remove();
            
            // Close the Safari View Controller
            Browser.close();
            
            // Handle the success callback after a short delay
            setTimeout(() => {
              console.log('✅ Processing Safari View Controller callback success');
              options.onSuccess?.({ url: info.url });
            }, 300);
          }
        });

        // Listen for the browser to close
        const browserFinishedListener = await Browser.addListener('browserFinished', () => {
          console.log('Safari View Controller closed');
          browserPageLoadedListener.remove();
          options.onComplete?.();
        });

        return { data, error: null };
      } else {
        console.error('No OAuth URL received from Supabase');
        options.onError?.(new Error('No OAuth URL received'));
        return { data: null, error: new Error('No OAuth URL received') };
      }
    } else {
      // Fall back to standard OAuth flow for web and Android
      const fallbackPlatform = Capacitor.getPlatform();
      console.log(`Using standard OAuth flow for ${fallbackPlatform} platform`);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo,
          queryParams: {
            prompt: 'select_account',
          }
        }
      });

      if (error) {
        console.error('Apple OAuth error:', error);
        options.onError?.(error);
      } else if (data) {
        console.log('Apple OAuth success:', data);
        options.onSuccess?.(data);
      }

      return { data, error };
    }
  } catch (error: any) {
    console.error('Safari View Controller error:', error);
    options.onError?.(error);
    return { data: null, error };
  }
};

/**
 * Generic Safari View Controller opener for any OAuth provider
 */
export const openOAuthWithSafariViewController = async (
  provider: 'google' | 'apple',
  redirectTo: string,
  options: {
    onSuccess?: (data: any) => void;
    onError?: (error: any) => void;
    onComplete?: () => void;
  } = {}
) => {
  try {
    // Check if we're on iOS native platform
    const platform = Capacitor.getPlatform();
    const isNativePlatform = Capacitor.isNativePlatform();
    const isNativeiOS = isNativePlatform && platform === 'ios';
    
    // For Apple Sign In on iOS native app only, use Safari View Controller
    if (provider === 'apple' && isNativeiOS) {
      console.log('Routing Apple Sign In to Safari View Controller on iOS');
      return await openAppleSignInWithSafariViewController(redirectTo, options);
    }

    // Standard OAuth flow for all other cases (web, Android, Google everywhere)
    console.log(`Using standard OAuth flow for ${provider} on ${platform}`);
    console.log(`OAuth redirectTo URL: ${redirectTo}`);
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account',
        }
      }
    });

    if (error) {
      console.error(`${provider} OAuth error:`, error);
      options.onError?.(error);
    } else if (data) {
      console.log(`${provider} OAuth success:`, data);
      options.onSuccess?.(data);
    }

    return { data, error };
  } catch (error: any) {
    console.error(`${provider} OAuth error:`, error);
    options.onError?.(error);
    return { data: null, error };
  }
};

/**
 * Cleanup Safari View Controller listeners
 */
export const cleanupSafariViewController = () => {
  try {
    if (Capacitor.isNativePlatform()) {
      Browser.removeAllListeners();
    }
  } catch (error) {
    // Ignore cleanup errors
    console.log('Safari View Controller cleanup error:', error);
  }
};
