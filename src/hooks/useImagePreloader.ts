import { useState, useCallback, useRef } from 'react';

interface ImagePreloaderOptions {
  maxConcurrent?: number;
  quality?: number;
  width?: number;
  format?: string;
}

interface PreloadedImageData {
  url: string;
  loaded: boolean;
  loading: boolean;
  error: boolean;
  optimizedUrl: string;
}

export const useImagePreloader = (options: ImagePreloaderOptions = {}) => {
  const {
    maxConcurrent = 4,
    quality = 85,
    width = 800,
    format = 'webp'
  } = options;

  // imageStatus stores simple status for each URL: 'idle' | 'loading' | 'loaded' | 'error'
  const [imageStatus, setImageStatus] = useState<Record<string, 'idle'|'loading'|'loaded'|'error'>>({});
  const loadingQueue = useRef<string[]>([]);
  const inFlight = useRef(0);

  const optimizeImageUrl = useCallback((url: string): string => {
    if (url.includes('supabase')) {
      return `${url}?width=${width}&quality=${quality}&format=${format}&resize=contain`;
    }
    return url;
  }, [width, quality, format]);

  const preloadImage = useCallback((url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const optimizedUrl = optimizeImageUrl(url);

      const status = imageStatus[url];
      if (status === 'loaded') {
        resolve();
        return;
      }
      if (status === 'loading') {
        // Poll until loaded or error
        const check = () => {
          const s = (imageStatus as any)[url];
          if (s === 'loaded') return resolve();
          if (s === 'error') return reject(new Error('Image failed to load'));
          setTimeout(check, 50);
        };
        check();
        return;
      }

      // Mark loading
      setImageStatus(prev => ({ ...prev, [url]: 'loading' }));
      inFlight.current++;

      const img = new Image();
      img.loading = 'eager';
      img.src = optimizedUrl;

      img.onload = () => {
        setImageStatus(prev => ({ ...prev, [url]: 'loaded' }));
        inFlight.current = Math.max(0, inFlight.current - 1);
        resolve();
      };

      img.onerror = () => {
        setImageStatus(prev => ({ ...prev, [url]: 'error' }));
        inFlight.current = Math.max(0, inFlight.current - 1);
        reject(new Error('Image failed to load'));
      };
    });
  }, [optimizeImageUrl, imageStatus]);

  const processQueue = useCallback(async () => {
    // Process queue respecting maxConcurrent and current inFlight
    while (loadingQueue.current.length > 0 && inFlight.current < maxConcurrent) {
      const next = loadingQueue.current.shift();
      if (!next) break;
      // Start preload but don't await serially here
      preloadImage(next).catch(() => {});
    }
  }, [maxConcurrent, preloadImage]);

  const preloadImages = useCallback((urls: string[]) => {
    const newUrls = urls.filter(url => !loadingQueue.current.includes(url) && (imageStatus[url] !== 'loaded' && imageStatus[url] !== 'loading'));
    loadingQueue.current.push(...newUrls);
    processQueue();
  }, [processQueue, imageStatus]);

  const getOptimizedUrl = useCallback((url: string): string => {
    return optimizeImageUrl(url);
  }, [optimizeImageUrl]);

  const isImageLoaded = useCallback((url: string): boolean => imageStatus[url] === 'loaded', [imageStatus]);
  const isImageLoading = useCallback((url: string): boolean => imageStatus[url] === 'loading', [imageStatus]);

  const clearCache = useCallback(() => {
    setImageStatus({});
    loadingQueue.current = [];
    inFlight.current = 0;
  }, []);

  return {
    preloadImages,
    preloadImage,
    getOptimizedUrl,
    isImageLoaded,
    isImageLoading,
    imageStatus,
    clearCache
  };
};
