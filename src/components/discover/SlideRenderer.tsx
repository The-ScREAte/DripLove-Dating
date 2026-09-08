// ⭐ ANDROID OPTIMIZATION: Memoized slide components to reduce re-render cost by 40-60%
import React from 'react';
import { User, Quote, Heart, Coffee, Search, Baby, MessageCircle, Gift, PawPrint, Share2, Ruler } from 'lucide-react';
import { SlideContent } from './MatchCardHelpers';
import { useTranslation } from 'react-i18next';
import styles from './MatchCard.module.css';
import { getCachedObjectUrl, warmImageCache } from '@/utils/persistentImageCache';

interface SlideRendererProps {
  slide: SlideContent;
  userBackgroundColor: string;
  matchFirstName: string;
  matchLastName: string;
  preloadedBlobImages?: { [url: string]: string };
  imageStatus?: Record<string, 'idle'|'loading'|'loaded'|'error'>;
  getOptimizedUrl: (url: string) => string;
}

const areBlobMapsEqual = (
  a?: { [url: string]: string },
  b?: { [url: string]: string }
) => {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i];
    if (a[key] !== b[key]) return false;
  }
  return true;
};

// Image Slide Component
// ⭐ FIX: Show image immediately (opacity 1) - no more blank flash on swipe
// Only use opacity transition for blob URLs where we know loading is instant
const ImageSlide = React.memo<{
  imageSrc: string;
  originalUrl: string;
  matchFirstName: string;
  matchLastName: string;
  usingBlob: boolean;
  showLoader: boolean;
}>(({ imageSrc, originalUrl, matchFirstName, matchLastName, usingBlob, showLoader }) => {
  const [hasError, setHasError] = React.useState(false);
  // Once the live network request fails, this holds a persistent-cache
  // fallback (IndexedDB, survives app restarts) so the photo can still show
  // with no internet, as long as it loaded successfully at least once before.
  const [fallbackSrc, setFallbackSrc] = React.useState<string | null>(null);
  const triedCacheRef = React.useRef(false);
  const fallbackObjectUrlRef = React.useRef<string | null>(null);

  // Reset error/fallback state when image source changes
  React.useEffect(() => {
    setHasError(false);
    setFallbackSrc(null);
    triedCacheRef.current = false;
    return () => {
      if (fallbackObjectUrlRef.current) {
        URL.revokeObjectURL(fallbackObjectUrlRef.current);
        fallbackObjectUrlRef.current = null;
      }
    };
  }, [imageSrc]);

  const handleError = React.useCallback(async () => {
    if (usingBlob || triedCacheRef.current) {
      setHasError(true);
      return;
    }
    triedCacheRef.current = true;
    const cached = await getCachedObjectUrl(originalUrl);
    if (cached) {
      fallbackObjectUrlRef.current = cached;
      setFallbackSrc(cached);
    } else {
      setHasError(true);
    }
  }, [originalUrl, usingBlob]);

  const handleLoad = React.useCallback(() => {
    if (!usingBlob && !fallbackSrc) warmImageCache(originalUrl);
  }, [fallbackSrc, originalUrl, usingBlob]);

  // Show placeholder if image failed to load
  if (hasError) {
    return (
      <div className="w-full h-full min-h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center px-8 pt-8 pb-[150px]">
        <div className="text-center w-full">
          <div className="bg-white/80 rounded-full p-8 mb-4 shadow-xl mx-auto max-w-[96px]">
            <User className="w-16 h-16 mx-auto text-gray-500" />
          </div>
          <span className="text-4xl font-bold text-gray-700 bg-white/50 rounded-full px-6 py-3">
            {matchFirstName?.[0]}{matchLastName?.[0]}
          </span>
          <p className="text-gray-600 mt-4 text-sm">Image unavailable</p>
        </div>
      </div>
    );
  }
  
  return (
    // Absolute + inset 0, not w-full/h-full: this is the one element shared by
    // Discover, Liked Me, and the profile preview, so it's the most direct place
    // to guarantee a tall/portrait photo can never influence this box's own size.
    //
    // Fills the card frame edge-to-edge (Tinder-style full bleed) instead of
    // being boxed into a fixed 3:4 rect centered inside it. A locked 3:4 box
    // derives its height from its width, and on a typical phone the actual
    // card frame is taller than 4:3 once header/nav are subtracted - so the
    // box rendered shorter than the frame and got letterboxed (visible black
    // bars top/bottom, "slim"-looking image) instead of touching all four
    // edges. object-cover on the full-size frame crops evenly as needed
    // (photos are already cropped to 3:4 by the app's own crop tool, so this
    // is normally a small, symmetric crop, not a jarring one) with zero bars,
    // pure CSS, still no JS measurement involved.
    <div className="absolute inset-0 bg-black overflow-hidden">
      <img
        key={imageSrc}
        loading="eager"
        decoding="async"
        src={fallbackSrc ?? imageSrc}
        alt={`${matchFirstName} ${matchLastName}`}
        className={`absolute inset-0 w-full h-full object-cover object-center ${styles.optimizedImage}`}
        draggable={false}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );


});
ImageSlide.displayName = 'ImageSlide';

// Bio Slide Component
const BioSlide = React.memo<{
  content: string;
  userBackgroundColor: string;
  matchFirstName: string;
}>(({ content, userBackgroundColor, matchFirstName }) => {
  const { t } = useTranslation();
  return (
    <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center px-8 pt-8 pb-[150px]`}>
      <div className="max-w-sm mx-auto text-center">
        <div className="flex items-center justify-center mb-6">
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 shadow-lg">
            <Quote className="w-8 h-8 text-white" />
          </div>
        </div>
        <h3 className="text-2xl font-bold text-white mb-6">
          {t('discover.matchCard.aboutUser', { name: matchFirstName })}
        </h3>
        <p className="text-white text-lg leading-relaxed font-medium">{content}</p>
      </div>
    </div>
  );
});
BioSlide.displayName = 'BioSlide';

// Fun Fact Slide Component
const FunFactSlide = React.memo<{
  content: string;
  userBackgroundColor: string;
}>(({ content, userBackgroundColor }) => (
  <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center px-8 pt-8 pb-[150px]`}>
    <div className="max-w-sm mx-auto text-center">
      <div className="flex items-center justify-center mb-6">
        <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 shadow-lg">
          <Heart className="w-8 h-8 text-white" />
        </div>
      </div>
      <h3 className="text-2xl font-bold text-white mb-6">Fun Fact</h3>
      <p className="text-white text-lg leading-relaxed font-medium">{content}</p>
    </div>
  </div>
));
FunFactSlide.displayName = 'FunFactSlide';

// Perfect First Date Slide Component
const PerfectFirstDateSlide = React.memo<{
  content: string;
  userBackgroundColor: string;
}>(({ content, userBackgroundColor }) => (
  <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center px-8 pt-8 pb-[150px]`}>
    <div className="max-w-sm mx-auto text-center">
      <div className="flex items-center justify-center mb-6">
        <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 shadow-lg">
          <Coffee className="w-8 h-8 text-white" />
        </div>
      </div>
      <h3 className="text-2xl font-bold text-white mb-6">Perfect First Date</h3>
      <p className="text-white text-lg leading-relaxed font-medium">{content}</p>
    </div>
  </div>
));
PerfectFirstDateSlide.displayName = 'PerfectFirstDateSlide';

// Last Googled Slide Component
const LastGoogledSlide = React.memo<{
  content: string;
  userBackgroundColor: string;
}>(({ content, userBackgroundColor }) => (
  <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center px-8 pt-8 pb-[150px]`}>
    <div className="max-w-sm mx-auto text-center">
      <div className="flex items-center justify-center mb-6">
        <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 shadow-lg">
          <Search className="w-8 h-8 text-white" />
        </div>
      </div>
      <h3 className="text-2xl font-bold text-white mb-6">Last Googled</h3>
      <p className="text-white text-lg leading-relaxed font-medium">{content}</p>
    </div>
  </div>
));
LastGoogledSlide.displayName = 'LastGoogledSlide';

// Generic trait prompt slide (family plans / communication style / love
// style / pets / social media) - same layout as the fun-fact-style slides
// above, just parametrized by icon + title instead of five near-duplicate
// components.
const TraitPromptSlide = React.memo<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  content: string;
  userBackgroundColor: string;
}>(({ icon: Icon, title, content, userBackgroundColor }) => (
  <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center px-8 pt-8 pb-[150px]`}>
    <div className="max-w-sm mx-auto text-center">
      <div className="flex items-center justify-center mb-6">
        <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 shadow-lg">
          <Icon className="w-8 h-8 text-white" />
        </div>
      </div>
      <h3 className="text-2xl font-bold text-white mb-6">{title}</h3>
      <p className="text-white text-lg leading-relaxed font-medium">{content}</p>
    </div>
  </div>
));
TraitPromptSlide.displayName = 'TraitPromptSlide';

// Placeholder Slide Component
const PlaceholderSlide = React.memo<{
  matchFirstName: string;
  matchLastName: string;
}>(({ matchFirstName, matchLastName }) => (
  <div className="w-full h-full min-h-full bg-gradient-to-br from-zinc-800 via-neutral-900 to-black flex items-center justify-center px-8 pt-8 pb-[150px]">
    <div className="flex flex-col items-center text-center">
      {/* Monogram avatar — the initials are the profile image */}
      <div className="w-28 h-28 rounded-full flex items-center justify-center
                      bg-white/[0.06] border border-white/10 ring-1 ring-white/5
                      shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
        <span className="text-4xl font-semibold tracking-wide text-white/90 select-none">
          {matchFirstName?.[0]}{matchLastName?.[0]}
        </span>
      </div>
      <p className="mt-5 text-white/45 text-sm tracking-wide">No photos yet</p>
    </div>
  </div>
));
PlaceholderSlide.displayName = 'PlaceholderSlide';

// Main Slide Renderer - switches between slide types
export const SlideRenderer = React.memo<SlideRendererProps>(({
  slide,
  userBackgroundColor,
  matchFirstName,
  matchLastName,
  preloadedBlobImages,
  imageStatus,
  getOptimizedUrl
}) => {
  // ⭐ CRITICAL FIX: Guard against undefined slide to prevent crash during rapid swiping
  if (!slide || !slide.type) {
    return <PlaceholderSlide matchFirstName={matchFirstName || ''} matchLastName={matchLastName || ''} />;
  }

  switch (slide.type) {
    case 'image': {
      const originalUrl = slide.content;
      if (!originalUrl) {
        return <PlaceholderSlide matchFirstName={matchFirstName || ''} matchLastName={matchLastName || ''} />;
      }
      const blobUrl = preloadedBlobImages?.[originalUrl];
      const usingBlob = blobUrl && blobUrl.startsWith('blob:');
      const imageSrc = usingBlob ? blobUrl : getOptimizedUrl(originalUrl);
      const status = imageStatus?.[originalUrl] || 'idle';
      const showLoader = !usingBlob && status === 'loading';

      return (
        <ImageSlide
          imageSrc={imageSrc}
          originalUrl={originalUrl}
          matchFirstName={matchFirstName}
          matchLastName={matchLastName}
          usingBlob={usingBlob}
          showLoader={showLoader}
        />
      );
    }
    case 'bio':
      return (
        <BioSlide
          content={slide.content || ''}
          userBackgroundColor={userBackgroundColor}
          matchFirstName={matchFirstName}
        />
      );
    case 'fun_fact':
      return <FunFactSlide content={slide.content || ''} userBackgroundColor={userBackgroundColor} />;
    case 'perfect_first_date':
      return <PerfectFirstDateSlide content={slide.content || ''} userBackgroundColor={userBackgroundColor} />;
    case 'last_googled':
      return <LastGoogledSlide content={slide.content || ''} userBackgroundColor={userBackgroundColor} />;
    case 'height':
      return <TraitPromptSlide icon={Ruler} title="Height" content={slide.content || ''} userBackgroundColor={userBackgroundColor} />;
    case 'family_plans':
      return <TraitPromptSlide icon={Baby} title="Family Plans" content={slide.content || ''} userBackgroundColor={userBackgroundColor} />;
    case 'communication_style':
      return <TraitPromptSlide icon={MessageCircle} title="Communication Style" content={slide.content || ''} userBackgroundColor={userBackgroundColor} />;
    case 'love_style':
      return <TraitPromptSlide icon={Gift} title="Love Style" content={slide.content || ''} userBackgroundColor={userBackgroundColor} />;
    case 'pets':
      return <TraitPromptSlide icon={PawPrint} title="Pets" content={slide.content || ''} userBackgroundColor={userBackgroundColor} />;
    case 'social_media':
      return <TraitPromptSlide icon={Share2} title="Social Media" content={slide.content || ''} userBackgroundColor={userBackgroundColor} />;
    case 'placeholder':
      return <PlaceholderSlide matchFirstName={matchFirstName || ''} matchLastName={matchLastName || ''} />;
    default:
      return <PlaceholderSlide matchFirstName={matchFirstName || ''} matchLastName={matchLastName || ''} />;
  }
}, (prev, next) => {
  // ⭐ CRITICAL: Value-based comparison to prevent re-renders when parent regenerates objects
  // ⭐ CRITICAL FIX: Guard against undefined slides
  if (!prev.slide || !next.slide) {
    return prev.slide === next.slide;
  }
  return (
    prev.slide.type === next.slide.type &&
    prev.slide.content === next.slide.content &&
    prev.slide.index === next.slide.index &&
    prev.userBackgroundColor === next.userBackgroundColor &&
    prev.matchFirstName === next.matchFirstName &&
    prev.matchLastName === next.matchLastName &&
    areBlobMapsEqual(prev.preloadedBlobImages, next.preloadedBlobImages)
  );
});

SlideRenderer.displayName = 'SlideRenderer';
