import React from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import GlobalLanguageSelector from './GlobalLanguageSelector';
import { videoPreloader } from '@/utils/videoPreloader';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { signInWithAppleNativeModal, signInWithAppleFallback, isAppleSignInAvailable } from '@/utils/appleNativeModal';
import { saveLanguageToProfile } from '@/utils/languageSync';
import { getRedirectUri } from '@/config/oauth';
import { Capacitor } from '@capacitor/core';
import { cleanupSafariViewController } from '@/utils/safariViewController';

interface WelcomeScreenProps {
  onLogin: () => void;
  onAbout: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
  onManualLogin: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onLogin, onAbout, onTerms, onPrivacy, onManualLogin }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = React.useState('/welcome-video.mp4');
  const [oauthLoading, setOauthLoading] = React.useState<'google' | 'apple' | null>(null);

  // Check if running on native platform and get platform
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const isIOS = platform === 'ios';

  React.useEffect(() => {
    // Update to blob URL when ready (non-blocking)
    videoPreloader.preloadVideo().then((url) => {
      setVideoSrc(url);
    }).catch((error) => {
      console.error('Video preload failed, using direct URL:', error);
    });
  }, []);

  // Cleanup Safari View Controller listeners on unmount
  React.useEffect(() => {
    return () => {
      cleanupSafariViewController();
    };
  }, []);

  // Check if user has a profile in the database
  const checkProfileExists = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, bio, date_of_birth, city, country')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('[OAuth] Error checking profile:', error);
        return null;
      }

      return profile;
    } catch (err) {
      console.error('[OAuth] checkProfileExists exception:', err);
      return null;
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'apple') => {
    setOauthLoading(provider);
    
    try {
      // Get platform-specific redirect URI for the provider
      const redirectTo = getRedirectUri(provider);
      
      // For Apple provider, use native modal on iOS and fallback to web OAuth on other platforms
      if (provider === 'apple') {
        // Check if native Apple Sign-In is available (iOS native only)
        if (isAppleSignInAvailable()) {
          try {
            const data = await signInWithAppleNativeModal();

            // Handle profile completion flow (same as Google OAuth)
            const user = data?.user;
            if (user) {
              // Save current language to user's profile
              await saveLanguageToProfile(user.id);
              
              if (data.needsProfileCompletion) {
                // User needs to complete profile - redirect to completion
                navigate('/complete-profile');
              } else {
                // User has complete profile - go to main app
                navigate('/');
              }
            }
          } catch (err: any) {
            console.error('[Apple Native OAuth Error]:', err);
            
            // Handle user cancellation gracefully
            if (err.message?.includes('canceled') || err.message?.includes('cancelled')) {
              toast({
                title: t('auth.authenticationCancelled'),
                description: t('auth.googleSignInCancelled'),
                variant: 'default',
              });
            } else {
              toast({
                title: t('auth.authenticationError'),
                description: err?.message || t('auth.errors.appleSignInFailed'),
                variant: 'destructive',
              });
            }
          } finally {
            setOauthLoading(null);
          }
          return;
        } else {
          // Use web OAuth fallback for non-iOS platforms (browser, Android)
          try {
            // This function redirects and never returns
            await signInWithAppleFallback();
          } catch (err: any) {
            console.error('[Apple Web OAuth Error]:', err);
            
            // Check if this is a redirect (not really an error)
            if (err.message?.includes('Redirect should have happened')) {
              return;
            }
            
            // Handle real errors
            if (err.message?.includes('canceled') || err.message?.includes('cancelled') || err.message?.includes('popup')) {
              toast({
                title: 'Sign-in Cancelled',
                description: 'Apple Sign-In was cancelled.',
                variant: 'default',
              });
            } else {
              toast({
                title: 'Authentication Error',
                description: err?.message || 'Failed to sign in with Apple',
                variant: 'destructive',
              });
            }
            setOauthLoading(null);
          }
          return;
        }
      } else {
        // Google OAuth handling
        // For Google OAuth on iOS native: use Safari View Controller (in-app browser)
        if (provider === 'google' && isNative && platform === 'ios') {
          try {
            // Generate the OAuth URL
            const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo,
                queryParams: {
                  prompt: 'select_account',
                  access_type: 'offline',
                },
                skipBrowserRedirect: true,
              }
            });

            if (oauthError || !oauthData?.url) {
              throw new Error(oauthError?.message || 'Failed to generate OAuth URL');
            }

            // Open OAuth URL in Safari View Controller (in-app browser)
            const { Browser } = await import('@capacitor/browser');
            await Browser.open({ 
              url: oauthData.url,
              presentationStyle: 'popover',
              toolbarColor: '#000000',
            });

            const handleBrowserFinish = async () => {
              setOauthLoading(null);
              Browser.removeAllListeners();
              
              toast({
                title: t('auth.authenticationCancelled'),
                description: t('auth.googleSignInCancelled'),
                variant: 'default',
              });
            };
            
            Browser.addListener('browserFinished', handleBrowserFinish);
            return;

          } catch (err: any) {
            console.error('❌ Safari View Controller error:', err);
            toast({
              title: 'Authentication Error',
              description: err?.message || 'Failed to open Google Sign-In',
              variant: 'destructive',
            });
            setOauthLoading(null);
          }
          return;
        }
        
        // For Google OAuth on Android: use native Google Sign-In
        if (provider === 'google' && isNative && platform === 'android') {
          try {
            const { signInWithGoogleNative, isNativeGoogleAuthAvailable } = await import('@/utils/googleNativeAuth');
            const canUseNative = isNativeGoogleAuthAvailable();
            
            if (!canUseNative) {
              throw new Error('Native Google Sign-In is not available on this device');
            }

            const result = await signInWithGoogleNative();

            if (result?.user?.id) {
              await saveLanguageToProfile(result.user.id);
            }

            setOauthLoading(null);
            if (result.needsProfileCompletion) {
              navigate('/complete-profile');
            } else {
              navigate('/');
            }
            return;
            
          } catch (androidErr: any) {
            console.error('❌ Android native Google Sign-In error:', androidErr);
            
            if (androidErr.message?.includes('cancel')) {
              toast({
                title: t('auth.authenticationCancelled'),
                description: t('auth.googleSignInCancelled'),
                variant: 'default',
              });
            } else {
              toast({
                title: 'Authentication Error',
                description: androidErr?.message || 'Failed to sign in with Google.',
                variant: 'destructive',
              });
            }
            setOauthLoading(null);
            return;
          }
        }
        
        // For Web: use popup window
        if (provider === 'google' && !isNative) {
          try {
            const width = 450;
            const height = 550;
            const left = window.screen.width / 2 - width / 2;
            const top = window.screen.height / 2 - height / 2;
            
            const popup = window.open(
              'about:blank',
              'googleauth',
              `width=${width},height=${height},left=${left},top=${top},popup=1,toolbar=0,location=0,status=0,menubar=0,scrollbars=1,resizable=0`
            );

            if (!popup) {
              throw new Error('Popup blocked. Please allow popups for this site and try again.');
            }

            // Create overlay
            const overlay = document.createElement('div');
            overlay.id = 'oauth-overlay';
            overlay.style.cssText = `
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: rgba(0, 0, 0, 0.75);
              z-index: 999998;
              display: flex;
              align-items: center;
              justify-content: center;
              backdrop-filter: blur(4px);
            `;
            
            const overlayMessage = document.createElement('div');
            overlayMessage.style.cssText = `
              background: white;
              padding: 32px;
              border-radius: 16px;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
              text-align: center;
              max-width: 350px;
            `;
            overlayMessage.innerHTML = `
              <div style="font-size: 48px; margin-bottom: 16px;">🔐</div>
              <div style="font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 8px;">
                Sign in with Google
              </div>
              <div style="font-size: 14px; color: #6b7280;">
                Complete sign-in in the popup window
              </div>
            `;
            
            overlay.appendChild(overlayMessage);
            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';

            const removeOverlay = () => {
              if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
              }
              document.body.style.overflow = '';
            };

            // Show loading message in popup
            popup.document.write(`
              <html>
                <head>
                  <style>
                    body {
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      height: 100vh;
                      margin: 0;
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      color: white;
                    }
                    .loader {
                      text-align: center;
                    }
                    .spinner {
                      border: 4px solid rgba(255, 255, 255, 0.3);
                      border-top: 4px solid white;
                      border-radius: 50%;
                      width: 40px;
                      height: 40px;
                      animation: spin 1s linear infinite;
                      margin: 0 auto 20px;
                    }
                    @keyframes spin {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                  </style>
                </head>
                <body>
                  <div class="loader">
                    <div class="spinner"></div>
                    <div>Opening Google Sign In...</div>
                  </div>
                </body>
              </html>
            `);

            // Generate the OAuth URL
            const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo,
                queryParams: {
                  prompt: 'select_account',
                  access_type: 'offline',
                },
                skipBrowserRedirect: true,
              }
            });

            if (oauthError || !oauthData?.url) {
              popup.close();
              throw new Error(oauthError?.message || 'Failed to generate OAuth URL');
            }

            popup.location.href = oauthData.url;

            let sessionCheckInterval: NodeJS.Timeout | null = null;
            let hasProcessedSession = false;

            const checkForSession = async () => {
              if (hasProcessedSession) return;
              
              if (popup.closed) {
                if (sessionCheckInterval) {
                  clearInterval(sessionCheckInterval);
                  sessionCheckInterval = null;
                }
                
                removeOverlay();
                
                if (!hasProcessedSession) {
                  toast({
                    title: t('auth.authenticationCancelled'),
                    description: t('auth.googleSignInCancelled'),
                    variant: 'default',
                  });
                  setOauthLoading(null);
                }
                return;
              }
              
              const { data: { session } } = await supabase.auth.getSession();
              
              if (session) {
                hasProcessedSession = true;
                
                if (sessionCheckInterval) {
                  clearInterval(sessionCheckInterval);
                  sessionCheckInterval = null;
                }
                
                removeOverlay();
                
                try {
                  popup.close();
                } catch (e) {
                  // Popup already closed
                }
                
                try {
                  const profile = await checkProfileExists(session.user.id);
                  await new Promise(resolve => setTimeout(resolve, 300));
                  
                  let needsProfileCompletion = false;
                  if (!profile) {
                    needsProfileCompletion = true;
                  } else {
                    needsProfileCompletion = !profile.first_name || 
                      profile.first_name === 'User' ||
                      !profile.bio || 
                      profile.date_of_birth === '1990-01-01' ||
                      !profile.city || 
                      profile.city === 'Unknown' ||
                      !profile.country;
                  }
                  
                  await saveLanguageToProfile(session.user.id);
                  
                  await new Promise(resolve => setTimeout(resolve, 500));
                  setOauthLoading(null);
                  
                  if (needsProfileCompletion) {
                    navigate('/complete-profile');
                  } else {
                    navigate('/');
                  }
                } catch (error) {
                  console.error('Error during post-login processing:', error);
                  setOauthLoading(null);
                  navigate('/complete-profile');
                }
              }
            };

            sessionCheckInterval = setInterval(checkForSession, 500);
            return;

          } catch (err: any) {
            console.error('❌ Web popup OAuth error:', err);
            toast({
              title: 'Authentication Error',
              description: err?.message || 'Failed to open Google Sign-In popup',
              variant: 'destructive',
            });
            setOauthLoading(null);
          }
          return;
        }
      }

    } catch (error: any) {
      console.error(`${provider} OAuth unexpected error:`, error);
      toast({
        title: "Authentication Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setOauthLoading(null);
    }
  };

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Force faster playback for Hinge-like experience
    video.playbackRate = 1.2;
    
    const attemptPlay = () => {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.log('Autoplay prevented:', error);
        });
      }
    };

    // Seamless looping - loop before video ends to avoid gap
    const handleTimeUpdate = () => {
      if (video.duration && video.currentTime >= video.duration - 0.1) {
        video.currentTime = 0;
      }
    };

    // Handle video ending (backup for timeupdate)
    const handleEnded = () => {
      video.currentTime = 0;
      attemptPlay();
    };

    const handleLoadedData = () => {
      attemptPlay();
    };

    const handleCanPlay = () => {
      attemptPlay();
    };

    // iOS user interaction handler
    const handleUserInteraction = () => {
      if (video.paused) {
        attemptPlay();
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    document.addEventListener('click', handleUserInteraction, { once: true });

    if (video.readyState >= 2) {
      attemptPlay();
    }

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('click', handleUserInteraction);
    };
  }, [videoSrc]);
  
  return (
  <div className="min-h-fill bg-gradient-to-br from-purple-500 to-pink-500 flex flex-col items-center justify-start text-center relative overflow-hidden">
      {/* Video Background - always rendered, loads async */}
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          webkit-playsinline="true"
          x5-playsinline="true"
          preload="auto"
          src={videoSrc}
          className="absolute top-0 left-0 w-full h-full object-cover opacity-40"
          style={{ willChange: 'auto' }}
        />
        {/* Gradient overlay to blend video with pink background - smoother transition */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% via-pink-500/10 via-55% via-pink-500/30 via-70% to-pink-500"></div>
      </div>

      {/* Background Bubbles */}
      <div className="absolute inset-0">
        <div className="bg-purple-400 opacity-30 rounded-full w-20 h-20 absolute top-10 left-20"></div>
        <div className="bg-pink-400 opacity-30 rounded-full w-48 h-48 absolute bottom-32 right-20"></div>
        <div className="bg-purple-300 opacity-20 rounded-full w-12 h-12 absolute top-32 right-32"></div>
        <div className="bg-pink-300 opacity-20 rounded-full w-32 h-32 absolute bottom-40 left-10"></div>
        <div className="bg-purple-200 opacity-25 rounded-full w-24 h-24 absolute top-5 right-5"></div>
      </div>

      {/* Logo and Tagline */}
      <div className="flex flex-col items-center relative z-10 mt-24 sm:mt-24 px-4 sm:px-6 w-full max-w-md">
        <img 
          src="/driplove-logo.png" 
          alt="DripLove Logo" 
          className="w-28 h-24 sm:w-40 sm:h-32 mb-3 sm:mb-4" 
          loading="eager"
          fetchpriority="high"
          decoding="async"
          width="160"
          height="128"
        />
        <p className="text-base sm:text-xl text-white font-semibold text-center break-words px-2">{t('welcome.tagline')}</p>
        <p className="text-lg sm:text-2xl text-white/95 text-center break-words mt-1 font-bold tracking-wide px-2" 
           style={{ 
             fontFamily: 'cursive, serif',
             textShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 20px rgba(255,255,255,0.2)',
             letterSpacing: '0.05em'
           }}>
        </p>
      </div>

      {/* Auth Buttons - Moved closer to footer */}
      <div className="space-y-1.5 mt-auto mb-3 relative z-10 w-full max-w-[220px] sm:max-w-[260px] px-4 sm:px-8">
        {/* Google Sign-In Button */}
        <Button
          onClick={() => handleOAuthSignIn('google')}
          disabled={oauthLoading !== null}
          className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium border border-gray-300 hover:border-gray-400 py-1.5 sm:py-1 px-3 sm:px-3 rounded-full transition-all duration-200 shadow-sm hover:shadow-md text-[11px] sm:text-[12px]"
        >
          {oauthLoading === 'google' ? (
            <div className="flex items-center justify-center">
              <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-1.5"></div>
              <span className="text-[11px] sm:text-[12px]">{t('auth.connecting')}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <svg className="w-3 h-3 sm:w-3 sm:h-3 mr-1.5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="text-[11px] sm:text-[12px]">{t('auth.continueWithGoogle')}</span>
            </div>
          )}
        </Button>

        {/* Apple Sign-In Button */}
        <Button
          onClick={() => handleOAuthSignIn('apple')}
          disabled={oauthLoading !== null}
          className="w-full bg-black hover:bg-gray-900 text-white font-medium py-1.5 sm:py-1 px-3 sm:px-3 rounded-full transition-all duration-200 shadow-sm hover:shadow-md text-[11px] sm:text-[12px]"
        >
          {oauthLoading === 'apple' ? (
            <div className="flex items-center justify-center">
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5"></div>
              <span className="text-[11px] sm:text-[12px]">{t('auth.connecting')}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <svg className="w-3 h-3 sm:w-3 sm:h-3 mr-1.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              <span className="text-[11px] sm:text-[12px]">{t('auth.continueWithApple')}</span>
            </div>
          )}
        </Button>

        {/* Manual Login Button */}
        <Button
          onClick={onManualLogin}
          className="w-full bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-semibold py-1.5 sm:py-1 px-3 sm:px-3 rounded-full border-2 border-white/40 hover:border-white/60 transition-all duration-200 shadow-sm hover:shadow-md text-[11px] sm:text-[12px]"
        >
          {t('auth.signInWithEmail')}
        </Button>
      </div>

      {/* Footer Section */}
      <div className="flex flex-col items-center space-y-2 z-10 pb-6 sm:pb-8 px-4 sm:px-6">
        {/* Terms acceptance text */}
        <p className="text-xs sm:text-sm text-white/90 text-center max-w-[90%] sm:max-w-3xl leading-none">
          By signing in or creating an account, you agree to our{' '}
          <button
            onClick={onTerms}
            className="text-white font-bold hover:text-white/80 transition-colors duration-200 bg-transparent border-none cursor-pointer underline decoration-white/40 hover:decoration-white/80 underline-offset-2 inline"
          >
            Terms of Service
          </button>
          . Learn how we process your data in our{' '}
          <button
            onClick={onPrivacy}
            className="text-white font-bold hover:text-white/80 transition-colors duration-200 bg-transparent border-none cursor-pointer underline decoration-white/40 hover:decoration-white/80 underline-offset-2 inline"
          >
            Privacy Policy
          </button>
          .
        </p>
        
        {/* About and Language selector */}
        <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-4 text-xs sm:text-sm pt-1">
          <button
            onClick={onAbout}
            className="text-white font-bold hover:text-white/80 transition-colors duration-200 bg-transparent border-none cursor-pointer whitespace-nowrap"
          >
            {t('welcome.aboutLink')}
          </button>
          <GlobalLanguageSelector variant="welcome" />
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
