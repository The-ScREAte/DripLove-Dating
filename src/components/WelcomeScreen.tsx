import React from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import GlobalLanguageSelector from './GlobalLanguageSelector';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useOAuth } from '@/hooks/useOAuth';

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
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = React.useState('/welcome-video.mp4');
  
  // ✅ SINGLE SOURCE OF TRUTH for OAuth - centralized hook
  const { startOAuth, oauthLoading, setOauthLoading } = useOAuth();

  // Check if running on native platform and get platform
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const isIOS = platform === 'ios';

  React.useEffect(() => {
    // Use direct video URL
    setVideoSrc('/welcome-video.mp4');

    // Preload Google Auth on Android in background for instant sign-in
    if (isNative && platform === 'android') {
      import('@/utils/googleNativeAuth').then(({ initializeGoogleAuth }) => {
        // Initialize Google Auth silently in background
        setTimeout(() => {
          try {
            initializeGoogleAuth();
          } catch (err) {
            console.warn('Google Auth preload failed (non-critical):', err);
          }
        }, 500); // Delay 500ms to avoid blocking initial render
      }).catch(() => {});
    }
  }, [isNative, platform]); 

  // Reset any stuck OAuth loading state when app comes back to foreground on iOS
  React.useEffect(() => {
    if (!isNative || !isIOS) return;

    let removeListener: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appStateChange', (state: { isActive: boolean }) => {
          if (state.isActive) {
            setOauthLoading(null);
          }
        });
        removeListener = () => listener.remove();
      } catch (err) {
        // Ignore listener failures
      }
    })();

    return () => {
      if (removeListener) removeListener();
    };
  }, [isNative, isIOS, setOauthLoading]);

  // ✅ Browser cleanup is handled by useMobileOAuth - removed duplicate cleanup

  // ✅ OAuth initiation is now centralized in useOAuth hook
  // Removed 450+ lines of duplicate OAuth logic from this component

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Force faster playback for Hinge-like experience
    video.playbackRate = 1.2;
    
    const attemptPlay = () => {
      // iOS specific: ensure muted attribute is set before playing
      video.muted = true;
      video.setAttribute('playsinline', '');
      
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // Video started playing
          })
          .catch((error) => {
            // On iOS, sometimes we need to try again after a short delay
            if (isIOS) {
              setTimeout(() => {
                video.play().catch(() => undefined);
              }, 100);
            }
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

    // iOS user interaction handler (fallback)
    const handleUserInteraction = () => {
      if (video.paused) {
        attemptPlay();
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    
    // Add interaction listeners as fallback (remove once after first use)
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    document.addEventListener('click', handleUserInteraction, { once: true });

    // Initial play attempt if video is ready
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
  }, [videoSrc, isIOS]);
  
  return (
  <div className="min-h-fill bg-gradient-to-br from-[#3d0320] via-[#7a0a40] to-[#d6136e] flex flex-col items-center justify-start text-center relative overflow-hidden">
      <style>{`
        @keyframes bubbleFloatSlow {
          0% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -12px, 0) scale(1.03); }
          100% { transform: translate3d(0, 0, 0) scale(1); }
        }

        @keyframes bubbleDriftSlow {
          0% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(10px, -6px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }

        .welcome-bubble {
          will-change: transform;
          transform: translate3d(0, 0, 0);
          backface-visibility: hidden;
        }

        .welcome-bubble-a { animation: bubbleFloatSlow 18s ease-in-out infinite; }
        .welcome-bubble-b { animation: bubbleDriftSlow 22s ease-in-out infinite; }
        .welcome-bubble-c { animation: bubbleFloatSlow 20s ease-in-out infinite; }
        .welcome-bubble-d { animation: bubbleDriftSlow 24s ease-in-out infinite; }
        .welcome-bubble-e { animation: bubbleFloatSlow 26s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .welcome-bubble {
            animation: none !important;
          }
        }
      `}</style>
      {/* Video Background - always rendered, loads async */}
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          loop
          preload="auto"
          src={videoSrc}
          className="absolute top-0 left-0 w-full h-full object-cover opacity-40"
          style={{ willChange: 'auto' }}
        />
        {/* Gradient overlay to blend video with dark pink background - smoother transition */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% via-[#7a0a40]/20 via-55% via-[#7a0a40]/50 via-70% to-[#d6136e]"></div>
      </div>

      {/* Background Bubbles */}
      <div className="absolute inset-0">
        <div className="welcome-bubble welcome-bubble-a bg-[#ff2d87] opacity-20 rounded-full w-20 h-20 absolute top-10 left-20"></div>
        <div className="welcome-bubble welcome-bubble-b bg-[#d6136e] opacity-25 rounded-full w-48 h-48 absolute bottom-32 right-20"></div>
        <div className="welcome-bubble welcome-bubble-c bg-[#a3125c] opacity-20 rounded-full w-12 h-12 absolute top-32 right-32"></div>
        <div className="welcome-bubble welcome-bubble-d bg-[#7a0a40] opacity-25 rounded-full w-32 h-32 absolute bottom-40 left-10"></div>
        <div className="welcome-bubble welcome-bubble-e bg-[#ff5fa3] opacity-15 rounded-full w-24 h-24 absolute top-5 right-5"></div>
      </div>

      {/* Logo and Tagline */}
      <div className="flex flex-col items-center relative z-10 mt-24 sm:mt-24 px-4 sm:px-6 w-full max-w-md">
        <img 
          src="/driplove-logo.webp"
          alt="DripLove Logo" 
          className="w-28 h-24 sm:w-40 sm:h-32 mb-3 sm:mb-4" 
          loading="eager"
          decoding="async"
          width="160"
          height="128"
        />
        <p
          className="font-brush font-bold text-white text-center break-words px-2"
          style={{ fontSize: 'clamp(20px, 5.5vw, 30px)' }}
        >
          {t('welcome.tagline')}
        </p>
      </div>

      {/* Auth Buttons - Moved closer to footer */}
      <div className="space-y-1.5 mt-auto mb-3 relative z-10 w-full max-w-[220px] sm:max-w-[280px] md:max-w-[320px] px-4 sm:px-8">
        {/* Google Sign-In Button */}
        <Button
          onClick={() => startOAuth('google')}
          disabled={oauthLoading !== null}
          className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium border border-gray-300 hover:border-gray-400 py-1.5 sm:py-2 md:py-2.5 px-3 sm:px-4 md:px-5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md text-[11px] sm:text-[13px] md:text-[14px]"
        >
          {oauthLoading === 'google' ? (
            <div className="flex items-center justify-center">
              <div className="w-3 h-3 md:w-4 md:h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-1.5"></div>
              <span className="text-[11px] sm:text-[13px] md:text-[14px]">{t('auth.connecting')}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <svg className="w-3 h-3 md:w-4 md:h-4 mr-1.5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="text-[11px] sm:text-[13px] md:text-[14px]">{t('auth.continueWithGoogle')}</span>
            </div>
          )}
        </Button>

        {/* Apple Sign-In Button - Only show on iOS devices */}
        {isIOS && (
          <Button
            onClick={() => startOAuth('apple')}
            disabled={oauthLoading !== null}
            className="w-full bg-black hover:bg-gray-900 text-white font-medium py-1.5 sm:py-2 md:py-2.5 px-3 sm:px-4 md:px-5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md text-[11px] sm:text-[13px] md:text-[14px]"
          >
            {oauthLoading === 'apple' ? (
              <div className="flex items-center justify-center">
                <div className="w-3 h-3 md:w-4 md:h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5"></div>
                <span className="text-[11px] sm:text-[13px] md:text-[14px]">{t('auth.connecting')}</span>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <svg className="w-3 h-3 md:w-4 md:h-4 mr-1.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                <span className="text-[11px] sm:text-[13px] md:text-[14px]">{t('auth.continueWithApple')}</span>
              </div>
            )}
          </Button>
        )}

        {/* Manual Login Button */}
        <Button
          onClick={onManualLogin}
          className="w-full bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-semibold py-1.5 sm:py-2 md:py-2.5 px-3 sm:px-4 md:px-5 rounded-full border-2 border-white/40 hover:border-white/60 transition-all duration-200 shadow-sm hover:shadow-md text-[11px] sm:text-[13px] md:text-[14px]"
        >
          {t('auth.signInWithEmail')}
        </Button>
      </div>

      {/* Footer Section */}
      <div className="flex flex-col items-center space-y-2 z-10 pb-6 sm:pb-8 px-4 sm:px-6">
        {/* Terms acceptance text */}
          <p className="text-xs sm:text-sm text-white/90 text-center max-w-[92%] sm:max-w-3xl [line-height:1.05] sm:[line-height:1.15] m-0 p-0">
            By signing in or creating an account, you agree to our <a
              href="#terms"
              onClick={(e) => {
                e.preventDefault();
                onTerms();
              }}
              className="text-white font-bold hover:text-white/80 active:text-white/60 transition-colors duration-200 bg-transparent border-none cursor-pointer underline decoration-white/40 hover:decoration-white/80 underline-offset-2 inline py-1 px-0 m-0 leading-[inherit] touch-manipulation"
            >
              Terms of Service
            </a>. Learn how we process your data in our <a
              href="#privacy"
              onClick={(e) => {
                e.preventDefault();
                onPrivacy();
              }}
              className="text-white font-bold hover:text-white/80 active:text-white/60 transition-colors duration-200 bg-transparent border-none cursor-pointer underline decoration-white/40 hover:decoration-white/80 underline-offset-2 inline py-1 px-0 m-0 leading-[inherit] touch-manipulation"
            >
              Privacy Policy
            </a>.
        </p>
        
        {/* About and Language selector */}
        <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-4 text-xs sm:text-sm pt-1">
          <button
            onClick={onAbout}
            className="text-white font-bold hover:text-white/80 transition-colors duration-200 bg-transparent border-none cursor-pointer whitespace-nowrap"
          >
            {t('welcome.aboutLink')}
          </button>
          <button
            onClick={() => navigate('/links')}
            className="text-white font-bold hover:text-white/80 transition-colors duration-200 bg-transparent border-none cursor-pointer whitespace-nowrap"
          >
            Connect
          </button>
          <GlobalLanguageSelector variant="welcome" />
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
