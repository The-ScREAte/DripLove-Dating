import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getCachedObjectUrl, warmImageCache } from '@/utils/persistentImageCache';

type CachedImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  /** Called only once neither the network nor the persistent cache has the image. */
  onLoadError?: () => void;
  /** Tried next if `src` fails (e.g. src is a photo's thumbnail, this is the
   *  full photo), before falling back to the offline cache. */
  fallbackSrc?: string;
  /** Called when `src` failed and `fallbackSrc` is being used instead. */
  onFallback?: () => void;
};

// Drop-in <img> replacement that keeps the normal fast network path (no added
// latency, no waiting on IndexedDB before painting) but falls back to a
// previously-cached copy on error - so a photo that loaded once while online
// still renders with no internet the next time this mounts. Every
// successfully loaded image is opportunistically stored for next time.
const CachedImage = React.forwardRef<HTMLImageElement, CachedImageProps>(
  ({ src, onError, onLoad, onLoadError, fallbackSrc, onFallback, ...rest }, ref) => {
    // Resets effectiveSrc/triedCache the moment `src` changes, computed
    // during render (React's sanctioned "adjust state while rendering"
    // pattern) rather than in a useEffect - setState inside an effect body
    // forces an extra throwaway render on every src change, which adds up
    // across a swipe deck of dozens of photos. Refs can't be written during
    // render either, so this is plain state rather than a ref.
    const [prevSrc, setPrevSrc] = useState(src);
    const [effectiveSrc, setEffectiveSrc] = useState(src);
    const [triedCache, setTriedCache] = useState(false);
    const objectUrlRef = useRef<string | null>(null);
    if (prevSrc !== src) {
      setPrevSrc(src);
      setEffectiveSrc(src);
      setTriedCache(false);
    }

    // Cleanup only - revoking the previous fallback object URL, if any, once
    // `src` moves on or the component unmounts. No setState here.
    useEffect(() => {
      return () => {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      };
    }, [src]);

    const handleLoad = useCallback(
      (e: React.SyntheticEvent<HTMLImageElement>) => {
        onLoad?.(e);
        // Cache whatever actually loaded (the fallback, if src failed).
        if (!triedCache) warmImageCache(effectiveSrc);
      },
      [onLoad, effectiveSrc, triedCache]
    );

    const handleError = useCallback(
      async (e: React.SyntheticEvent<HTMLImageElement>) => {
        onError?.(e);
        if (fallbackSrc && fallbackSrc !== src && effectiveSrc === src && !triedCache) {
          onFallback?.();
          setEffectiveSrc(fallbackSrc);
          return;
        }
        if (triedCache) {
          onLoadError?.();
          return;
        }
        setTriedCache(true);
        const cachedUrl = await getCachedObjectUrl(src) ?? (fallbackSrc ? await getCachedObjectUrl(fallbackSrc) : null);
        if (cachedUrl) {
          objectUrlRef.current = cachedUrl;
          setEffectiveSrc(cachedUrl);
        } else {
          onLoadError?.();
        }
      },
      [onError, onLoadError, src, triedCache, fallbackSrc, onFallback, effectiveSrc]
    );

    return <img ref={ref} src={effectiveSrc} onLoad={handleLoad} onError={handleError} {...rest} />;
  }
);
CachedImage.displayName = 'CachedImage';

export default CachedImage;
