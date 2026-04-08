import { useState, useCallback, useRef } from 'react';
import { optimizeImageUrl as buildOptimizedImageUrl, getRawStorageUrl } from '@/utils/imageOptimizer';

interface ImagePreloaderOptions {
  maxConcurrent?: number;
  quality?: number;
  width?: number;
}

interface PreloadedImageData {
  url: string;
  loaded: boolean;
  loading: boolean;
  error: boolean;
  optimizedUrl: string;
}

type Priority = 'high' | 'medium' | 'low';

interface QueueItem {
  url: string;
  priority: Priority;
}

export const useImagePreloader = (options: ImagePreloaderOptions = {}) => {
  const {
    maxConcurrent = 3,
    quality = 85,
    width = 800,
  } = options;

  const [preloadedImages, setPreloadedImages] = useState<Map<string, PreloadedImageData>>(new Map());
  const preloadedImagesRef = useRef<Map<string, PreloadedImageData>>(new Map());
  const loadingQueue = useRef<QueueItem[]>([]);
  const isProcessing = useRef(false);
  const inFlightLoads = useRef<Map<string, Promise<void>>>(new Map());
  const cancelledUrls = useRef<Set<string>>(new Set());

  const setImageData = useCallback((url: string, data: PreloadedImageData) => {
    setPreloadedImages(prev => {
      const next = new Map(prev);
      next.set(url, data);
      preloadedImagesRef.current = next;
      return next;
    });
  }, []);

  const optimizeImageUrl = useCallback((url: string): string => {
    return buildOptimizedImageUrl(url, { width, quality });
  }, [width, quality]);

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
        // Fallback: always try the raw storage object URL when possible.
        const rawFallbackUrl = getRawStorageUrl(optimizedUrl);
        const fallbackUrl = rawFallbackUrl && rawFallbackUrl !== optimizedUrl
          ? rawFallbackUrl
          : url;

        if (fallbackUrl && fallbackUrl !== optimizedUrl) {
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            setImageData(url, { url, loaded: true, loading: false, error: false, optimizedUrl: fallbackUrl });
            resolve();
          };
          fallbackImg.onerror = () => {
            setImageData(url, { url, loaded: false, loading: false, error: true, optimizedUrl: fallbackUrl });
            reject(new Error('Image failed to load'));
          };
          fallbackImg.src = fallbackUrl;
        } else {
          setImageData(url, { url, loaded: false, loading: false, error: true, optimizedUrl });
          reject(new Error('Image failed to load'));
        }
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

    // Sort queue by priority: high > medium > low
    loadingQueue.current.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Worker pool keeps concurrency saturated (no artificial delays).
    const workerCount = Math.max(1, maxConcurrent);

    await Promise.all(
      Array.from({ length: workerCount }).map(async () => {
        while (loadingQueue.current.length > 0) {
          const nextItem = loadingQueue.current.shift();
          if (!nextItem) return;
          
          // Skip cancelled URLs
          if (cancelledUrls.current.has(nextItem.url)) {
            cancelledUrls.current.delete(nextItem.url);
            continue;
          }
          
          await preloadImage(nextItem.url).catch(() => {
            // ignore individual image failures
          });
        }
      })
    );

    isProcessing.current = false;
  }, [maxConcurrent, preloadImage]);

  const preloadImages = useCallback((urls: string[], priority: Priority = 'medium') => {
    // Add new URLs to queue (avoid duplicates)
    const newItems: QueueItem[] = [];
    const queuedUrls = new Set(loadingQueue.current.map(item => item.url));

    for (const url of urls) {
      const status = preloadedImagesRef.current.get(url);
      if (status?.loaded) continue;
      if (queuedUrls.has(url)) continue;
      if (inFlightLoads.current.has(url)) continue;
      if (cancelledUrls.current.has(url)) continue;
      newItems.push({ url, priority });
    }

    if (newItems.length === 0) return;

    loadingQueue.current.push(...newItems);
    processQueue();
  }, [processQueue]);

  const cancelImages = useCallback((urls: string[]) => {
    // Mark URLs as cancelled and remove from queue
    urls.forEach(url => cancelledUrls.current.add(url));
    loadingQueue.current = loadingQueue.current.filter(item => !cancelledUrls.current.has(item.url));
  }, []);

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
    cancelledUrls.current.clear();
  }, []);

  return {
    preloadImages,
    cancelImages,
    getOptimizedUrl,
    isImageLoaded,
    isImageLoading,
    clearCache
  };
};
