import React, { useState, useRef, useEffect } from 'react';
import { ExternalLink, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { optimizeImageUrl } from '@/utils/imageOptimizer';

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
}

const AdCard: React.FC<AdCardProps> = ({ ad, onSwipe }) => {
  const [isMuted, setIsMuted] = useState(true);
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
            {/* Mute/Unmute Button */}
            <button
              onClick={toggleMute}
              className="absolute top-6 right-4 md:top-4 bg-black/50 text-white p-1.5 md:p-2 rounded-full z-10"
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
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />
        
        {/* Ad Badge */}
        <div className="absolute top-6 left-4 md:top-4 bg-yellow-400 text-black px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-bold">
          Sponsored
        </div>
      </div>

      {/* Ad Info */}
      <div className="p-4 pb-5 bg-black">
        <h2 className="text-2xl font-bold mb-2 text-white">{ad.name}</h2>
        <p className="text-gray-300 mb-4 line-clamp-2">{ad.about}</p>
        
        {ad.link && (
          <Button 
            onClick={handleLinkClick}
            className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {ad.link_as || 'Click here'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default AdCard;
