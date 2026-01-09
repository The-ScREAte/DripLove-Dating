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
    maxConcurrent = 3,
    quality = 85,
    width = 800,
    format = 'webp'
  } = options;

  const [preloadedImages, setPreloadedImages] = useState<Map<string, PreloadedImageData>>(new Map());
  const preloadedImagesRef = useRef<Map<string, PreloadedImageData>>(new Map());
  const loadingQueue = useRef<string[]>([]);
  const isProcessing = useRef(false);
  const inFlightLoads = useRef<Map<string, Promise<void>>>(new Map());

  const setImageData = useCallback((url: string, data: PreloadedImageData) => {
    setPreloadedImages(prev => {
      const next = new Map(prev);
      next.set(url, data);
      preloadedImagesRef.current = next;
      return next;
    });
  }, []);

  const optimizeImageUrl = useCallback((url: string): string => {
    if (url.includes('supabase')) {
      return `${url}?width=${width}&quality=${quality}&format=${format}`;
    }
    return url;
  }, [width, quality, format]);

  const preloadImage = useCallback((url: string): Promise<void> => {
    const existing = preloadedImagesRef.current.get(url);
    if (existing?.loaded) return Promise.resolve();

    const inFlight = inFlightLoads.current.get(url);
    if (inFlight) return inFlight;

    const optimizedUrl = optimizeImageUrl(url);

    // Mark as loading (once per URL)
    setImageData(url, {
      url,
      loaded: false,
      loading: true,
      error: false,
      optimizedUrl
    });

    const promise = new Promise<void>((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        setImageData(url, {
          url,
          loaded: true,
          loading: false,
          error: false,
          optimizedUrl
        });
        resolve();
      };

      img.onerror = () => {
        setImageData(url, {
          url,
          loaded: false,
          loading: false,
          error: true,
          optimizedUrl
        });
        reject(new Error('Image failed to load'));
      };

      img.src = optimizedUrl;
    }).finally(() => {
      inFlightLoads.current.delete(url);
    });

    inFlightLoads.current.set(url, promise);
    return promise;
  }, [optimizeImageUrl, setImageData]);

  const processQueue = useCallback(async () => {
    if (isProcessing.current || loadingQueue.current.length === 0) return;

    isProcessing.current = true;

    // Worker pool keeps concurrency saturated (no artificial delays).
    const workerCount = Math.max(1, maxConcurrent);

    await Promise.all(
      Array.from({ length: workerCount }).map(async () => {
        while (loadingQueue.current.length > 0) {
          const nextUrl = loadingQueue.current.shift();
          if (!nextUrl) return;
          await preloadImage(nextUrl).catch(() => {
            // ignore individual image failures
          });
        }
      })
    );

    isProcessing.current = false;
  }, [maxConcurrent, preloadImage]);

  const preloadImages = useCallback((urls: string[]) => {
    // Add new URLs to queue (avoid duplicates)
    const newUrls: string[] = [];
    const queued = new Set(loadingQueue.current);

    for (const url of urls) {
      const status = preloadedImagesRef.current.get(url);
      if (status?.loaded) continue;
      if (queued.has(url)) continue;
      if (inFlightLoads.current.has(url)) continue;
      newUrls.push(url);
    }

    if (newUrls.length === 0) return;

    loadingQueue.current.push(...newUrls);
    processQueue();
  }, [processQueue]);

  const getOptimizedUrl = useCallback((url: string): string => {
    const imageData = preloadedImagesRef.current.get(url);
    return imageData?.optimizedUrl || optimizeImageUrl(url);
  }, [optimizeImageUrl]);

  const isImageLoaded = useCallback((url: string): boolean => {
    return preloadedImagesRef.current.get(url)?.loaded || false;
  }, []);

  const isImageLoading = useCallback((url: string): boolean => {
    return preloadedImagesRef.current.get(url)?.loading || false;
  }, []);

  const clearCache = useCallback(() => {
    setPreloadedImages(new Map());
    preloadedImagesRef.current = new Map();
    inFlightLoads.current.clear();
    loadingQueue.current = [];
  }, []);

  return {
    preloadImages,
    getOptimizedUrl,
    isImageLoaded,
    isImageLoading,
    clearCache
  };
};
