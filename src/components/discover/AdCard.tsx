import React, { useState, useRef, useEffect } from 'react';
import { ExternalLink, Volume2, VolumeX, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { optimizeImageUrl } from '@/utils/imageOptimizer';

const ADVERTISE_EMAIL = 'driploveinfo@gmail.com';

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
}

const AdCard: React.FC<AdCardProps> = ({ ad, onSwipe, onAdvertiseClick }) => {
  const [isMuted, setIsMuted] = useState(true);
  const [showFullAbout, setShowFullAbout] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = ad.media_type === 'video' && ad.video_url;

  useEffect(() => {
    // Auto-play video when card is displayed
    if (isVideo && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Ignore autoplay errors
      });
    }
  }, [isVideo]);

  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
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
            loading="lazy" 
            decoding="async"
            src={optimizeImageUrl(ad.image_url, { width: 500, quality: 60 })}
            alt={ad.name}
            className="w-full h-full object-cover"
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
        <h2 className="text-2xl font-bold mb-2 text-white">{ad.name}</h2>
        <div className="mb-4 relative">
          <p className={`text-gray-300 ${showFullAbout ? '' : 'line-clamp-2 pr-14'}`}>{ad.about}</p>
          {!showFullAbout && ad.about && ad.about.length > 80 && (
            // Sits on top of the clamped paragraph's last line instead of
            // its own line below - the pr-14 above reserves room for it on
            // both lines, and the solid black backdrop masks any text tail
            // that would otherwise show through underneath the button.
            <button
              onClick={toggleAbout}
              className="absolute right-0 bottom-0 bg-black pl-2 text-xs font-semibold text-pink-400"
            >
              See more
            </button>
          )}
          {showFullAbout && ad.about && ad.about.length > 80 && (
            <button
              onClick={toggleAbout}
              className="block text-xs font-semibold text-pink-400 mt-0.5"
            >
              See less
            </button>
          )}
        </div>

        {ad.link && (
          <Button
            onClick={handleLinkClick}
            className="w-full h-9 text-sm bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold"
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
