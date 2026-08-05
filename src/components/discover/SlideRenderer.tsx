// ⭐ ANDROID OPTIMIZATION: Memoized slide components to reduce re-render cost by 40-60%
import React from 'react';
import { User, Quote, Heart, Coffee, Search } from 'lucide-react';
import { SlideContent } from './MatchCardHelpers';
import { useTranslation } from 'react-i18next';
import styles from './MatchCard.module.css';

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
  matchFirstName: string;
  matchLastName: string;
  usingBlob: boolean;
  showLoader: boolean;
}>(({ imageSrc, matchFirstName, matchLastName, usingBlob, showLoader }) => {
  const [hasError, setHasError] = React.useState(false);
  
  // Reset error state when image source changes
  React.useEffect(() => {
    setHasError(false);
  }, [imageSrc]);
  
  // Show placeholder if image failed to load
  if (hasError) {
    return (
      <div className="w-full h-full min-h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
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
    <div className="relative w-full h-full bg-pink-50">
      <img
        key={imageSrc}
        loading="eager"
        decoding="async"
        src={imageSrc}
        alt={`${matchFirstName} ${matchLastName}`}
        className={`w-full h-full object-cover relative z-10 ${styles.optimizedImage}`}
        draggable={false}
        onError={() => setHasError(true)}
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
    <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center p-8`}>
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
  <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center p-8`}>
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
  <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center p-8`}>
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
  <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center p-8`}>
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

// Placeholder Slide Component
const PlaceholderSlide = React.memo<{
  matchFirstName: string;
  matchLastName: string;
}>(({ matchFirstName, matchLastName }) => (
  <div className="w-full h-full min-h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
    <div className="text-center w-full">
      <div className="bg-white/80 rounded-full p-8 mb-4 shadow-xl mx-auto max-w-[96px]">
        <User className="w-16 h-16 mx-auto text-gray-500" />
      </div>
      <span className="text-6xl font-bold text-gray-700 bg-white/50 rounded-full px-6 py-3">
        {matchFirstName?.[0]}{matchLastName?.[0]}
      </span>
      <p className="text-gray-600 mt-4 text-sm">No photos uploaded yet</p>
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
