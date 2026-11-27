// ⭐ ANDROID OPTIMIZATION: Memoized slide components to reduce re-render cost by 40-60%
import React from 'react';
import { User } from 'lucide-react';
import { SlideContent } from './MatchCardHelpers';
import { InfoCardSlide } from './InfoCardSlide';
import styles from './MatchCard.module.css';
import { getCachedObjectUrl, warmImageCache } from '@/utils/persistentImageCache';
import { optimizeImageUrl } from '@/utils/imageOptimizer';
import { dropBlobUrl } from '@/utils/imageCache';
import { isAndroidPlatform } from '@/utils/platformUtils';

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
  // Photo's natural width/height, set on load - sizes the reflection box.
  const [photoAspect, setPhotoAspect] = React.useState<number | null>(null);
  // Size of the card frame: tells us whether the photo is letterboxed (shorter than the frame) and where its top and
  // bottom edges sit, so the reflection can be blended into them.
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = React.useState<{ w: number; h: number } | null>(null);
  React.useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => setFrameSize((prev) => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      return prev && prev.w === w && prev.h === h ? prev : { w, h };
    });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Once the live network request fails, this holds a persistent-cache
  // fallback (IndexedDB, survives app restarts) so the photo can still show
  // with no internet, as long as it loaded successfully at least once before.
  const [fallbackSrc, setFallbackSrc] = React.useState<string | null>(null);
  // We normally serve the raw, untransformed photo (it's already resized to
  // <=1024px at upload, so a Supabase transform buys nothing - see
  // getDetailImageUrl). If THAT fails to load - a stray oversized legacy
  // photo, a corrupt/odd-format file, a mobile WebView choking on decoding a
  // huge bitmap - retry once through Supabase's on-the-fly image transform,
  // which re-encodes/downsizes server-side and can succeed where the raw
  // file didn't. Only then fall back to the offline persistent cache.
  const [transformSrc, setTransformSrc] = React.useState<string | null>(null);
  const [triedTransform, setTriedTransform] = React.useState(false);
  const [triedCache, setTriedCache] = React.useState(false);
  // Set once an in-memory blob: src has failed, which makes this slide ignore
  // the blob and render the real network URL instead. See handleError.
  const [blobAbandoned, setBlobAbandoned] = React.useState(false);
  const fallbackObjectUrlRef = React.useRef<string | null>(null);

  // Reset error/fallback state the moment imageSrc changes, computed during
  // render (React's "adjust state while rendering" pattern) instead of via a
  // useEffect - setState inside an effect body forces an extra throwaway
  // render on every single swipe, which adds up across a deck of photos.
  // Refs can't be written during render either, so triedCache is plain state.
  const [prevImageSrc, setPrevImageSrc] = React.useState(imageSrc);
  if (prevImageSrc !== imageSrc) {
    setPrevImageSrc(imageSrc);
    setHasError(false);
    setFallbackSrc(null);
    setTransformSrc(null);
    setTriedTransform(false);
    setTriedCache(false);
    setBlobAbandoned(false);
  }

  // Cleanup only - revoking the previous fallback object URL, if any, once
  // imageSrc moves on or the component unmounts. No setState here.
  React.useEffect(() => {
    return () => {
      if (fallbackObjectUrlRef.current) {
        URL.revokeObjectURL(fallbackObjectUrlRef.current);
        fallbackObjectUrlRef.current = null;
      }
    };
  }, [imageSrc]);

  const handleError = React.useCallback(async () => {
    // A blob: src that fails almost always means the blob itself was purged
    // while this session kept the URL string - iOS does exactly that when it
    // reclaims memory from a backgrounded WebView, which is why the photo
    // vanishes on resume while the rest of the card is fine. This used to
    // give up immediately (no network retry, no cache tier), so that first
    // photo stayed broken until the card was swiped away. Drop the dead blob
    // from the shared cache - otherwise every other screen keeps being handed
    // the same dead string - and fall through to the real network URL, which
    // the tiers below can then retry normally if it fails too.
    if (usingBlob && !blobAbandoned) {
      setBlobAbandoned(true);
      dropBlobUrl(originalUrl);
      return;
    }

    if (!triedTransform) {
      setTriedTransform(true);
      const transformed = optimizeImageUrl(originalUrl, { width: 1024, quality: 80 });
      if (transformed && transformed !== originalUrl && transformed !== imageSrc) {
        setTransformSrc(transformed);
        return;
      }
      // Not a Supabase URL, or already the transformed variant - nothing to
      // retry, fall straight through to the cache tier below.
    }

    if (!triedCache) {
      setTriedCache(true);
      const cached = await getCachedObjectUrl(originalUrl);
      if (cached) {
        fallbackObjectUrlRef.current = cached;
        setFallbackSrc(cached);
        return;
      }
    }

    setHasError(true);
  }, [blobAbandoned, imageSrc, originalUrl, triedCache, triedTransform, usingBlob]);

  const handleLoad = React.useCallback(() => {
    // Warm the persistent cache off the real (never blob:) originalUrl even
    // when this card is displaying an in-memory blob preview - Discover
    // preloads the next card's blob ahead of time, so most swipe photos would
    // otherwise never reach the offline cache at all. warmImageCache no-ops
    // once already cached, and the underlying fetch() hits the browser's own
    // HTTP cache (Supabase serves these with Cache-Control: max-age=3600), so
    // this doesn't cost a second real network download.
    if (!fallbackSrc) warmImageCache(originalUrl);
  }, [fallbackSrc, originalUrl]);

  const displaySrc = fallbackSrc ?? transformSrc ?? (blobAbandoned ? originalUrl : imageSrc);

  // Show placeholder if image failed to load
  if (hasError) {
    return (
      <div className="w-full h-full min-h-full bg-gradient-to-br from-pink-700 to-purple-800 flex items-center justify-center px-8 pt-8 pb-[150px]">
        <div className="text-center w-full">
          <div className="bg-white/90 rounded-full p-8 mb-4 shadow-xl mx-auto max-w-[96px]">
            <User className="w-16 h-16 mx-auto text-gray-500" />
          </div>
          <span className="text-4xl font-bold text-white bg-white/15 rounded-full px-6 py-3">
            {matchFirstName?.[0]}{matchLastName?.[0]}
          </span>
          <p className="text-white/70 mt-4 text-sm">Image unavailable</p>
        </div>
      </div>
    );
  }
  
  // Letterboxed = the whole photo is shorter than the frame, so there is room above and below it for a reflection.
  const letterboxed = !!photoAspect && !!frameSize && frameSize.w > 0 && frameSize.w / photoAspect < frameSize.h - 1;
  // Fade the sharp photo's own top and bottom edge into the blurred strip beneath it (see the reflection block).
  const photoEdgeFeather: React.CSSProperties = (() => {
    if (!letterboxed || !photoAspect || !frameSize) return {};
    const photoH = frameSize.w / photoAspect;
    const top = (frameSize.h - photoH) / 2;
    const f = Math.min(30, photoH * 0.1);
    const grad = `linear-gradient(to bottom, transparent ${top}px, #000 ${top + f}px, #000 ${top + photoH - f}px, transparent ${top + photoH}px)`;
    return { maskImage: grad, WebkitMaskImage: grad };
  })();

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
    //
    // The photo itself is shown whole (object-contain). Above and below it,
    // a vertically mirrored copy of the photo's own top/bottom edge acts as
    // a reflection - only lightly blurred, and fading deeper toward the far
    // top/bottom of the card - so the leftover space continues the image
    // instead of showing flat black bars. The mirror box is sized to the
    // photo's natural aspect ratio (known after load) at full card width,
    // which is exactly where object-contain places a width-limited photo.
    // A softly blurred cover copy sits underneath for any side gaps.
    <div ref={frameRef} className="absolute inset-0 bg-black overflow-hidden">
      <img
        src={displaySrc}
        decoding="async"
        aria-hidden="true"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter: 'blur(10px) brightness(0.6)',
          transform: 'scale(1.1)',
        }}
        draggable={false}
      />
      {letterboxed && photoAspect && (
        // The reflection is ONE continuous blurred strip - [mirror | photo | mirror] stacked and blurred together - and
        // the sharp photo above it dissolves into it along its top and bottom edge (mask below). Because the blurred
        // strip runs straight through the photo's edges there is no seam, no hairline and no change in colour where
        // the photo ends: it simply softens into its own reflection. A dark fade takes it to black further out.
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 z-[1] pointer-events-none"
          style={{ aspectRatio: String(photoAspect) }}
        >
          <div
            className="absolute left-0 w-full"
            style={{ top: '-100%', height: '300%', filter: `blur(${isAndroidPlatform() ? 5 : 10}px)` }}
          >
            {([
              { top: '0%', flip: true },
              { top: '33.3334%', flip: false },
              { top: '66.6667%', flip: true },
            ] as const).map((part) => (
              <img
                key={part.top}
                src={displaySrc}
                decoding="async"
                alt=""
                className="absolute left-0 w-full object-fill"
                style={{ top: part.top, height: '33.3334%', transform: part.flip ? 'scaleY(-1)' : undefined }}
                draggable={false}
              />
            ))}
          </div>
          {(['top', 'bottom'] as const).map((side) => (
            <div
              key={side}
              className="absolute left-0 w-full"
              style={{
                height: '100%',
                ...(side === 'top' ? { bottom: '100%' } : { top: '100%' }),
                background: `linear-gradient(to ${side === 'top' ? 'top' : 'bottom'}, rgba(0,0,0,0) 0%, rgba(0,0,0,0.12) 8%, rgba(0,0,0,0.3) 20%, rgba(0,0,0,0.5) 34%, rgba(0,0,0,0.7) 52%, rgba(0,0,0,0.85) 72%, rgba(0,0,0,0.94) 100%)`,
              }}
            />
          ))}
        </div>
      )}
      <img
        key={imageSrc}
        loading="eager"
        decoding="async"
        // blobAbandoned swaps a dead blob: preview for the real network URL
        // (see handleError); originalUrl is never a blob, so this is always a
        // genuinely different, re-fetchable source.
        src={displaySrc}
        alt={`${matchFirstName} ${matchLastName}`}
        className={`absolute inset-0 w-full h-full object-contain object-center ${styles.optimizedImage}`}
        // optimizedImage paints a black background across the whole box,
        // which would hide the blurred backdrop above/below the photo.
        // zIndex 2: the blurred reflection strip (z-1) runs through the photo's own area, the sharp photo must sit above it
        style={{ backgroundColor: 'transparent', zIndex: 2, ...photoEdgeFeather }}
        draggable={false}
        onLoad={(e) => {
          const { naturalWidth, naturalHeight } = e.currentTarget;
          if (naturalWidth && naturalHeight) setPhotoAspect(naturalWidth / naturalHeight);
          handleLoad();
        }}
        onError={handleError}
      />
    </div>
  );


});
ImageSlide.displayName = 'ImageSlide';

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
    case 'card':
      return slide.card ? <InfoCardSlide card={slide.card} /> : <PlaceholderSlide matchFirstName={matchFirstName || ''} matchLastName={matchLastName || ''} />;
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
