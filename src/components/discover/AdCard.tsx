import React, { useState, useRef, useEffect } from 'react';
import { ExternalLink, Volume2, VolumeX, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import { supabase } from '@/integrations/supabase/client';

const ADVERTISE_EMAIL = 'driploveinfo@gmail.com';
// Roughly what fits on 2 lines of the card's "about" text at its normal
// width - same threshold the old line-clamp-2 approach targeted.
const ABOUT_TRUNCATE_LENGTH = 80;

interface AdCardProps {
  ad: {
    id: string;
    image_url: string;
    video_url?: string | null;
    media_type?: string;
    name: string;
    about: string;
    link: string | null;
    link_as: string | null;
  };
  onSwipe?: () => void;
  // Routes into Profile's own "Advertisement" section instead of the mailto
  // fallback. Left undefined in contexts where that navigation makes no
  // sense (e.g. the admin panel's preview dialog), where the mailto link
  // still works as a safe default.
  onAdvertiseClick?: () => void;
  // Only true for the real Discover swipe deck - the admin preview dialog
  // and the advertiser's own "Preview ad" both render this same component,
  // and neither of those should count as a real impression/click.
  trackAnalytics?: boolean;
}

const AdCard: React.FC<AdCardProps> = ({ ad, onSwipe, onAdvertiseClick, trackAnalytics }) => {
  const [isMuted, setIsMuted] = useState(true);
  const [showFullAbout, setShowFullAbout] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = ad.media_type === 'video' && ad.video_url;
  const impressionTrackedRef = useRef<string | null>(null);
  const isAboutLong = Boolean(ad.about && ad.about.length > ABOUT_TRUNCATE_LENGTH);
  // Cut at a word boundary so the truncated text doesn't end mid-word right
  // before the "...".
  const truncatedAbout = isAboutLong
    ? ad.about.slice(0, ABOUT_TRUNCATE_LENGTH).replace(/\s+\S*$/, '')
    : ad.about;

  useEffect(() => {
    // Auto-play video when card is displayed
    if (isVideo && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Ignore autoplay errors
      });
    }
  }, [isVideo]);

  useEffect(() => {
    if (!trackAnalytics || !ad.id) return;
    if (impressionTrackedRef.current === ad.id) return; // don't double-count the same card re-rendering
    impressionTrackedRef.current = ad.id;
    supabase.rpc('increment_ad_impression', { ad_id: ad.id }).then(({ error }) => {
      if (error) console.error('Error tracking ad impression:', error);
    });
  }, [trackAnalytics, ad.id]);

  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (trackAnalytics && ad.id) {
      supabase.rpc('increment_ad_click', { ad_id: ad.id }).then(({ error }) => {
        if (error) console.error('Error tracking ad click:', error);
      });
    }
    if (ad.link) {
      window.open(ad.link, '_blank', 'noopener,noreferrer');
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  const toggleAbout = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowFullAbout((prev) => !prev);
  };

  const handleAdvertiseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAdvertiseClick) {
      onAdvertiseClick();
      return;
    }
    window.open(`mailto:${ADVERTISE_EMAIL}?subject=${encodeURIComponent('Advertising on DripLove')}`, '_blank');
  };

  return (
    <div className="w-full h-full flex flex-col bg-black">
      {/* Full-page Ad Media */}
      <div className="flex-1 relative overflow-hidden">
        {isVideo ? (
          <>
            <video
              ref={videoRef}
              src={ad.video_url!}
              muted={isMuted}
              loop
              playsInline
              autoPlay
              className="w-full h-full object-cover"
            />
            {/* Mute/Unmute Button - sits below the Advertise button (same
                top-right corner) so the two never overlap. */}
            <button
              onClick={toggleMute}
              className="absolute top-14 right-3 bg-black/50 text-white p-1.5 md:p-2 rounded-full z-10"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 md:w-5 md:h-5" /> : <Volume2 className="w-4 h-4 md:w-5 md:h-5" />}
            </button>
          </>
        ) : (
          <img
            // Eager, not lazy: this only ever renders once the ad is
            // already the front card the user is looking at (never
            // off-screen), so "lazy" only added a needless deferral -
            // real preloading now happens ahead of time in
            // useDiscoverAds.ts, well before this card is ever mounted.
            loading="eager"
            decoding="async"
            src={getDetailImageUrl(ad.image_url)}
            alt={ad.name}
            className="w-full h-full object-cover"
            // Without this, the browser's native HTML5 image-drag-and-drop
            // takes over the gesture partway through (a plain <img> is
            // draggable="true" by default) - it hijacks mousemove after the
            // first frame or two, which is exactly why the ad card visually
            // froze a few pixels into a drag and never advanced no matter
            // how far the swipe continued. SlideRenderer's own <img> (real
            // profile cards) already sets this for the same reason.
            draggable={false}
          />
        )}
        {/* Feathers up from fully solid black at the very bottom edge - matching
            the opaque black info panel right below it with no visible seam -
            fading out to transparent higher up in the photo/video. */}
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none" />

        {/* Ad Badge - icon only, normal small inset (no extra top offset). */}
        <div
          className="absolute top-3 left-3 bg-pink-500 text-white w-7 h-7 rounded-full flex items-center justify-center"
          title="Sponsored"
          aria-label="Sponsored"
        >
          <Megaphone className="w-3.5 h-3.5" />
        </div>

        {/* Advertise - far right, same row as the Sponsored badge. */}
        <button
          onClick={handleAdvertiseClick}
          className="absolute top-3 right-3 bg-pink-500 text-white text-[10px] md:text-xs font-semibold px-2.5 py-1 rounded-full"
        >
          Advertise
        </button>
      </div>

      {/* Ad Info - overlaps the media box above by a hair (negative margin,
          not just touching it) as insurance against subpixel rounding
          between flex children, which otherwise shows as a thin gap/line
          right where the feathered gradient above is supposed to already
          be fully solid black - same fix used for this exact seam in
          Discover's and the profile preview's own expanded info panels. */}
      <div className="px-4 pt-2 pb-5 bg-black relative" style={{ marginTop: '-2px' }}>
        <h2 className="text-lg font-bold mb-1.5 text-white">{ad.name}</h2>
        <div className="mb-4">
          {/* "See more"/"See less" render as part of the paragraph's own text
              flow (not absolutely positioned over it) so they always land
              right after the "..." on the same line, wrapping naturally with
              the text instead of relying on a CSS line-clamp height that
              doesn't reliably match where an absolutely-positioned button
              would sit. */}
          {isAboutLong && !showFullAbout ? (
            <p className="text-sm text-gray-300">
              {truncatedAbout}...{' '}
              <button
                onClick={toggleAbout}
                // Global mobile CSS forces every <button> to a 44px
                // touch-target min-height (src/index.css) - fine for real
                // buttons, but this is an inline text link inside a
                // paragraph, and that forced height was blowing out the
                // line box and leaving a big gap below the text. min-h-0
                // (a Tailwind utility, so it beats the plain-CSS base rule
                // regardless of source order) lets it size to its own text.
                className="text-xs font-semibold text-pink-400 whitespace-nowrap min-h-0 inline"
              >
                See more
              </button>
            </p>
          ) : (
            <p className="text-sm text-gray-300">
              {ad.about}
              {isAboutLong && (
                <>
                  {' '}
                  <button
                    onClick={toggleAbout}
                    // Global mobile CSS forces every <button> to a 44px
                // touch-target min-height (src/index.css) - fine for real
                // buttons, but this is an inline text link inside a
                // paragraph, and that forced height was blowing out the
                // line box and leaving a big gap below the text. min-h-0
                // (a Tailwind utility, so it beats the plain-CSS base rule
                // regardless of source order) lets it size to its own text.
                className="text-xs font-semibold text-pink-400 whitespace-nowrap min-h-0 inline"
                  >
                    See less
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        {ad.link && (
          <Button
            onClick={handleLinkClick}
            // No fixed h-* here - letting the smaller py-2 padding set the
            // height (instead of fighting the base Button's own h-10) is
            // what actually shrinks it; rounded-full makes it a proper pill
            // instead of the default rounded-md rectangle.
            className="w-full h-auto py-2 rounded-full text-sm bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold"
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            {ad.link_as || 'Click here'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default AdCard;
