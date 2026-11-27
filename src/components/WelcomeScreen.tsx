import React from 'react';
import { Button } from '@/components/ui/button';
import { Trans, useTranslation } from 'react-i18next';
import GlobalLanguageSelector from './GlobalLanguageSelector';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useOAuth } from '@/hooks/useOAuth';
import { shouldSkipDecorativeVideo } from '@/utils/lowBandwidth';
import '@/components/auth/auth.css';

interface WelcomeScreenProps {
  onAbout: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
  onManualLogin: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onAbout, onTerms, onPrivacy, onManualLogin }) => {
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
  // Web on a slow/metered/weak device: skip the ~1.8MB decorative video.
  const [skipVideo] = React.useState(() => !Capacitor.isNativePlatform() && shouldSkipDecorativeVideo());
  // Web: start the decorative video only after the page has finished loading, so its
  // download never competes with the JS/fonts needed for first paint. Native apps ship
  // the file locally, so they start it immediately as before.
  const [videoStarted, setVideoStarted] = React.useState(() => Capacitor.isNativePlatform());
  React.useEffect(() => {
    if (videoStarted || skipVideo) return;
    let timer: number | undefined;
    const start = () => {
      timer = window.setTimeout(() => setVideoStarted(true), 400);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      window.removeEventListener('load', start);
      if (timer) window.clearTimeout(timer);
    };
  }, [videoStarted, skipVideo]);

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
    if (!video || skipVideo) return;

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
  }, [videoSrc, isIOS, skipVideo]);
  
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
          /* Feathered edge: a radial gradient (no blur filter, so it stays
             cheap on weak GPUs) instead of a flat disc with a hard rim. */
          background-color: transparent !important;
          background-image: radial-gradient(circle at center, var(--bubble) 0%, var(--bubble) 55%, transparent 100%);
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
        {!skipVideo && (
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            loop
            preload="auto"
            src={videoStarted ? videoSrc : undefined}
            onLoadedData={(e) => { void e.currentTarget.play().catch(() => {}); }}
            className="absolute top-0 left-0 w-full h-full object-cover opacity-40"
            style={{ willChange: 'auto' }}
          />
        )}
        {/* Gradient overlay to blend video with dark pink background - smoother transition */}
        {/* Eased multi-stop fade (Tailwind only honours one `via-*`, which left
            a hard band). A soft dark top scrim also tames the video's bright
            top edge and keeps the status-bar area legible. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(61,3,32,0.55) 0%, rgba(61,3,32,0.28) 10%, rgba(61,3,32,0) 24%, rgba(122,10,64,0) 40%, rgba(122,10,64,0.12) 47%, rgba(122,10,64,0.28) 56%, rgba(122,10,64,0.5) 68%, rgba(160,12,86,0.74) 82%, #d6136e 100%)',
          }}
        ></div>
      </div>

      {/* Background Bubbles */}
      <div className="absolute inset-0">
        <div className="welcome-bubble welcome-bubble-a [--bubble:#ff2d87] opacity-20 rounded-full w-20 h-20 absolute top-10 left-20"></div>
        <div className="welcome-bubble welcome-bubble-b [--bubble:#d6136e] opacity-25 rounded-full w-48 h-48 absolute bottom-32 right-20"></div>
        <div className="welcome-bubble welcome-bubble-c [--bubble:#a3125c] opacity-20 rounded-full w-12 h-12 absolute top-32 right-32"></div>
        <div className="welcome-bubble welcome-bubble-d [--bubble:#7a0a40] opacity-25 rounded-full w-32 h-32 absolute bottom-40 left-10"></div>
        <div className="welcome-bubble welcome-bubble-e [--bubble:#ff5fa3] opacity-15 rounded-full w-24 h-24 absolute top-5 right-5"></div>
      </div>

      {/* Logo and tagline: the only things competing for attention above the buttons */}
      <div
        className="flex flex-col items-center relative z-10 px-6 w-full max-w-md dl-rise"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + clamp(36px, 11vh, 104px))' }}
      >
        <img
          src="/driplove-logo.webp"
          data-fade=""
          alt="DripLove Logo"
          className="w-24 h-20 sm:w-36 sm:h-28 mb-3 sm:mb-4"
          loading="eager"
          decoding="async"
          width="160"
          height="128"
        />
        <h1
          className="font-brush font-bold text-white text-center break-words px-2 leading-tight"
          style={{ fontSize: 'clamp(22px, 6.2vw, 30px)' }}
        >
          {t('welcome.tagline')}
        </h1>
      </div>

      {/* Sign-in options: equal size and weight (Apple HIG / Google branding), no extra copy */}
      <div
        className="mt-auto relative z-10 w-full max-w-[360px] px-6 pt-6 space-y-3 dl-rise"
        style={{ animationDelay: '90ms' }}
      >
        {/* Apple first on iOS: Apple's guidance asks for it to sit at least as prominently as other providers */}
        {isIOS && (
          <Button
            variant="socialDark"
            size="lg"
            className="w-full text-[15px]"
            onClick={() => startOAuth('apple')}
            disabled={oauthLoading !== null}
            loading={oauthLoading === 'apple'}
          >
            {oauthLoading === 'apple' ? (
              t('auth.connecting')
            ) : (
              <>
                <svg className="!size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                {t('auth.continueWithApple')}
              </>
            )}
          </Button>
        )}

        <Button
          variant="social"
          size="lg"
          className="dl-google-btn w-full border-[#747775] text-[15px] text-[#1F1F1F]"
          onClick={() => startOAuth('google')}
          disabled={oauthLoading !== null}
          loading={oauthLoading === 'google'}
        >
          {oauthLoading === 'google' ? (
            t('auth.connecting')
          ) : (
            <>
              <svg className="!size-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {t('auth.continueWithGoogle')}
            </>
          )}
        </Button>

        {/* Email: a quieter secondary - same size, lighter weight */}
        <Button
          variant="line"
          size="lg"
          className="w-full border-white/35 bg-white/[0.06] text-[15px] text-white"
          onClick={onManualLogin}
          disabled={oauthLoading !== null}
        >
          {t('auth.signInWithEmail')}
        </Button>
      </div>

      {/* Footer: one legal line, then quiet links */}
      <div
        className="relative z-10 flex flex-col items-center gap-3 px-6 pt-5 dl-rise"
        style={{
          animationDelay: '160ms',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        }}
      >
        <p className="m-0 max-w-[320px] text-center text-xs leading-relaxed text-white/80">
          <Trans
            i18nKey="welcome.legal"
            components={{
              terms: (
                <button
                  type="button"
                  onClick={onTerms}
                  className="dl-inline-link touch-manipulation font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
                />
              ),
              privacy: (
                <button
                  type="button"
                  onClick={onPrivacy}
                  className="dl-inline-link touch-manipulation font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
                />
              ),
            }}
          />
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-white/75">
          <button
            type="button"
            onClick={onAbout}
            className="min-h-9 whitespace-nowrap transition-colors hover:text-white"
          >
            {t('welcome.aboutLink')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/links')}
            className="min-h-9 whitespace-nowrap transition-colors hover:text-white"
          >
            {t('welcome.connectLink')}
          </button>
          <GlobalLanguageSelector variant="welcome" />
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
