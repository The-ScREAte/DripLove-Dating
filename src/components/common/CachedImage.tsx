import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getCachedObjectUrl, warmImageCache } from '@/utils/persistentImageCache';

type CachedImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  /** Called only once neither the network nor the persistent cache has the image. */
  onLoadError?: () => void;
};

// Drop-in <img> replacement that keeps the normal fast network path (no added
// latency, no waiting on IndexedDB before painting) but falls back to a
// previously-cached copy on error - so a photo that loaded once while online
// still renders with no internet the next time this mounts. Every
// successfully loaded image is opportunistically stored for next time.
const CachedImage = React.forwardRef<HTMLImageElement, CachedImageProps>(
  ({ src, onError, onLoad, onLoadError, ...rest }, ref) => {
    const [effectiveSrc, setEffectiveSrc] = useState(src);
    const triedCacheRef = useRef(false);
    const objectUrlRef = useRef<string | null>(null);

    useEffect(() => {
      setEffectiveSrc(src);
      triedCacheRef.current = false;
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
        if (!triedCacheRef.current) warmImageCache(src);
      },
      [onLoad, src]
    );

    const handleError = useCallback(
      async (e: React.SyntheticEvent<HTMLImageElement>) => {
        onError?.(e);
        if (triedCacheRef.current) {
          onLoadError?.();
          return;
        }
        triedCacheRef.current = true;
        const cachedUrl = await getCachedObjectUrl(src);
        if (cachedUrl) {
          objectUrlRef.current = cachedUrl;
          setEffectiveSrc(cachedUrl);
        } else {
          onLoadError?.();
        }
      },
      [onError, onLoadError, src]
    );

    return <img ref={ref} src={effectiveSrc} onLoad={handleLoad} onError={handleError} {...rest} />;
  }
);
CachedImage.displayName = 'CachedImage';

export default CachedImage;
