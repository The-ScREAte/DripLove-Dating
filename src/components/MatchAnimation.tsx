
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getDetailImageUrl } from '@/utils/imageOptimizer';

interface MatchAnimationProps {
  currentUserName: string;
  matchedUserName: string;
  matchedUserImage?: string;
  matchedUserId?: string;
  onClose: () => void;
  onStartChat: (userId: string) => void;
}

const ENTER_DURATION = 400; // ms
const EXIT_DURATION = 300; // ms

const MatchAnimation = ({
  currentUserName,
  matchedUserName,
  matchedUserImage,
  matchedUserId,
  onClose,
  onStartChat,
}: MatchAnimationProps) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Trigger enter animation on mount
    const t = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const safeOptimizeImage = (url?: string) => {
    if (!url) return url;
    try {
      // If the image is served from Supabase, request a reasonably small optimized size
      return getDetailImageUrl(url);
    } catch (e) {
      return url;
    }
  };

  const handleStartChat = () => {
    if (matchedUserId) onStartChat(matchedUserId);
  };

  // Close with exit animation, then call onClose
  const handleClose = () => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, EXIT_DURATION);
  };

  // If user never interacts, auto-close after a reasonable time to free DOM (optional)
  useEffect(() => {
    const AUTO_CLOSE_MS = 10_000; // 10s
    const timer = setTimeout(() => {
      if (!isClosing) handleClose();
    }, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [isClosing]);

  const imgSrc = safeOptimizeImage(matchedUserImage);

  return (
    <div
      aria-live="polite"
      className={`fixed inset-0 flex items-center justify-center z-50 p-4 ${
        isVisible ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className={`absolute inset-0 bg-black/75 transition-opacity ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ willChange: 'opacity' }}
      />

      <Card
        role="dialog"
        aria-modal
        className={`max-w-md w-full relative z-10 transform bg-black border border-pink-500/50 ${
          isVisible ? 'animate-enter' : 'animate-exit'
        }`}
        style={{
          // Hint browser to promote to its own layer for smoother transforms
          willChange: 'transform, opacity',
        }}
      >
        <CardContent className="p-6 text-center">
          <div className="mb-3">
            <div className="flex justify-center items-center gap-1.5">
              {/* Central hearts - lightweight and only transform/opacity */}
              <Heart className="w-[34px] h-[34px] text-pink-400" style={{ transformOrigin: 'center', willChange: 'transform, opacity' }} />
              <Heart className="w-14 h-14 text-red-500 animate-pulse-slow" style={{ transformOrigin: 'center', willChange: 'transform, opacity' }} />
              <Heart className="w-[34px] h-[34px] text-pink-400" style={{ transformOrigin: 'center', willChange: 'transform, opacity' }} />
            </div>

            {/* Floating hearts (reduced count) - CSS keyframes only animate transform & opacity */}
            <div className="relative mt-3 h-0 pointer-events-none">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className={`absolute top-[-6px] w-4 h-4 text-pink-300 animate-float-up-${i}`}
                  style={{ left: `${30 + i * 18}%`, willChange: 'transform, opacity' as any }}
                >
                  <Heart className="w-full h-full fill-current" />
                </div>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <h1 className="text-2xl font-bold text-pink-400 mb-1">{t('match.itsAMatch')}</h1>
            <p className="text-gray-300 text-base leading-snug px-1">
              {t('match.youAndLikedEachOther', { name: matchedUserName })}
            </p>
          </div>

          {imgSrc && (
            <div className="mb-4 flex justify-center">
              <div className="w-[88px] h-[88px] rounded-full overflow-hidden border-4 border-pink-500/40 shadow-sm" style={{ willChange: 'transform, opacity' }}>
                <img src={getDetailImageUrl(imgSrc)} alt={matchedUserName} className="w-full h-full object-cover" loading="lazy" decoding="async" />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Button
              onClick={handleStartChat}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-base py-3"
            >
              <span className="flex items-center justify-center gap-2">
                <MessageCircle className="w-5 h-5" />
                {t('match.startChatting')}
              </span>
            </Button>
            <Button onClick={handleClose} variant="outline" className="w-full bg-transparent border border-pink-500/25 text-gray-300 text-sm font-normal hover:bg-neutral-800 hover:text-white">
              {t('match.keepSwiping')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inline CSS keyframes and utility animations kept minimal and GPU-friendly */}
      <style>{`
        @keyframes match-enter {
          0% { transform: translateY(16px) scale(.98); opacity: 0 }
          100% { transform: translateY(0) scale(1); opacity: 1 }
        }
        @keyframes match-exit {
          0% { transform: translateY(0) scale(1); opacity: 1 }
          100% { transform: translateY(8px) scale(.995); opacity: 0 }
        }
        .animate-enter { animation: match-enter ${ENTER_DURATION}ms ease-out both; }
        .animate-exit { animation: match-exit ${EXIT_DURATION}ms ease-in both; }

        @keyframes float-up-0 { 0% { transform: translateY(0) scale(1); opacity: .0 } 40% { opacity: .9 } 100% { transform: translateY(-40px) scale(.7); opacity: 0 } }
        @keyframes float-up-1 { 0% { transform: translateY(0) scale(1); opacity: .0 } 30% { opacity: .95 } 100% { transform: translateY(-48px) scale(.65); opacity: 0 } }
        @keyframes float-up-2 { 0% { transform: translateY(0) scale(1); opacity: .0 } 35% { opacity: .9 } 100% { transform: translateY(-44px) scale(.68); opacity: 0 } }

        .animate-float-up-0 { animation: float-up-0 1200ms cubic-bezier(.2,.8,.2,1) both; }
        .animate-float-up-1 { animation: float-up-1 1400ms cubic-bezier(.2,.8,.2,1) 120ms both; }
        .animate-float-up-2 { animation: float-up-2 1300ms cubic-bezier(.2,.8,.2,1) 60ms both; }

        /* slow pulse for central heart (scale + opacity) */
        @keyframes pulse-slow { 0% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.06); opacity: .95 } 100% { transform: scale(1); opacity: 1 } }
        .animate-pulse-slow { animation: pulse-slow 1100ms ease-in-out infinite both; }
      `}</style>
    </div>
  );
};

export default MatchAnimation;
