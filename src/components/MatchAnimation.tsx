import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, MessageCircleHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import { supabase } from '@/integrations/supabase/client';
import { useBackClose } from '@/utils/backStack';
import './matchAnimation.css';

interface MatchAnimationProps {
  currentUserName: string;
  currentUserImage?: string;
  currentUserId?: string;
  matchedUserName: string;
  matchedUserImage?: string;
  matchedUserId?: string;
  onClose: () => void;
  onStartChat: (userId: string) => void;
}

const EXIT_MS = 260;
// The celebration shows for 4 seconds, then fades out by itself (tap "Keep swiping" / outside / back to leave sooner).
const AUTO_CLOSE_MS = 4000;

const safeImage = (url?: string): string | undefined => {
  if (!url) return undefined;
  try {
    return getDetailImageUrl(url);
  } catch {
    return url;
  }
};

/**
 * The REAL main photo of a person: the one handed in, or - if none was handed in - their first approved
 * photo looked up here. Returns undefined while unknown (the monogram shows meanwhile).
 */
const useMainPhoto = (userId: string | undefined, given: string | undefined): string | undefined => {
  const [found, setFound] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (given || !userId) return undefined;
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase
          .from('user_images')
          .select('image_url')
          .eq('user_id', userId)
          .eq('is_approved', true)
          .neq('image_order', -1)
          .order('image_order', { ascending: true })
          .limit(1);
        const url = data?.[0]?.image_url;
        if (alive && url) setFound(url);
      } catch {
        /* the monogram is a fine fallback */
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, given]);
  return given || found;
};

/** One round photo with a gradient ring: a monogram underneath, the real photo fades in over it. */
const Face: React.FC<{ name: string; src?: string; side: 'left' | 'right' }> = ({ name, src, side }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={`mx-face mx-face-${side}`}>
      <div className="mx-ring">
        <span className="mx-mono" aria-hidden="true">
          {(name || '?').trim().charAt(0).toUpperCase()}
        </span>
        {src && !failed && (
          <img src={src} alt="" className="mx-img" data-loaded={loaded ? 'true' : undefined} decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
        )}
      </div>
    </div>
  );
};

/**
 * "It's a match!" - a full-screen celebration: both photos slide together, a heart pops between
 * them, a script headline, one clear action. Opacity/transform animations only (reduced-motion
 * aware via src/motion.css tiers), safe-area aware, works from 320px up.
 */
const MatchAnimation = ({ currentUserName, currentUserImage, currentUserId, matchedUserName, matchedUserImage, matchedUserId, onClose, onStartChat }: MatchAnimationProps) => {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const chatBtn = useRef<HTMLButtonElement | null>(null);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  };

  // Android back closes the celebration first; Escape on the web.
  useBackClose(true, close);

  useEffect(() => {
    chatBtn.current?.focus({ preventScroll: true });
    try {
      // a tiny double-tap of haptics where supported (Android); iOS ignores it
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.([14, 50, 20]);
    } catch {
      /* haptics are a nicety only */
    }
    const timer = window.setTimeout(close, AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startChat = () => {
    if (matchedUserId) onStartChat(matchedUserId);
  };

  // A few small hearts/sparkles rising from behind the photos into the empty space above them (never across
  // the text). Positions are fixed per mount - no re-randomising on render.
  const confetti = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        left: 12 + ((i * 37) % 72),
        delay: (i % 5) * 0.35,
        dur: 3.6 + ((i * 13) % 17) / 10,
        size: 11 + ((i * 7) % 10),
        glyph: i % 3 === 0 ? '\u2726' : '\u2665',
      })),
    []
  );

  const me = safeImage(useMainPhoto(currentUserId, currentUserImage));
  const them = safeImage(useMainPhoto(matchedUserId, matchedUserImage));

  return (
    <div className={`mx-root ${closing ? 'mx-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="mx-title" aria-live="polite">
      <div className="mx-backdrop" onClick={close} />

      <div className="mx-confetti" aria-hidden="true">
        {confetti.map((c, i) => (
          <span key={i} className="mx-bit" style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, fontSize: c.size }}>
            {c.glyph}
          </span>
        ))}
      </div>

      <div className="mx-stage">
        <div className="mx-faces">
          <Face key={me || 'me'} name={currentUserName} src={me} side="left" />
          <Face key={them || 'them'} name={matchedUserName} src={them} side="right" />
          <div className="mx-heart" aria-hidden="true">
            <span className="mx-pulse" />
            <Heart className="mx-heart-ico" />
          </div>
        </div>

        <div className="mx-head">
          <h1 id="mx-title" className="mx-title">
            {t('match.itsAMatch', "It's a match!")}
          </h1>
        </div>
        <p className="mx-sub" dir="auto">
          {t('match.youAndLikedEachOther', { name: matchedUserName, defaultValue: 'You and {{name}} liked each other!' })}
        </p>

        <div className="mx-actions">
          <Button ref={chatBtn} variant="primary" size="lg" className="w-full mx-cta" onClick={startChat}>
            <MessageCircleHeart className="h-5 w-5" aria-hidden="true" />
            <span>{t('match.startChatting', 'Say hello')}</span>
          </Button>
          <button type="button" className="mx-later dl-focus" onClick={close}>
            {t('match.keepSwiping', 'Keep swiping')}
          </button>
        </div>
      </div>

      {/* a hairline countdown so the 4-second auto-dismiss never feels sudden */}
      <div className="mx-timer" aria-hidden="true">
        <span style={{ animationDuration: `${AUTO_CLOSE_MS}ms` }} />
      </div>
    </div>
  );
};

export default MatchAnimation;
