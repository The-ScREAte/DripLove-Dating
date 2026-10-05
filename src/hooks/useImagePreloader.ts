import { useCallback, useRef } from 'react';
import { getDetailImageUrl, optimizeImageUrl as buildTransformUrl } from '@/utils/imageOptimizer';

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
    // quality/width are accepted for backward compatibility with existing
    // callers but are no longer used to build a Supabase transform URL below
    // (see getDetailImageUrl) - photos are already resized to <=1024px at
    // upload time, so this hook's job is to serve them directly.
  } = options;

  // Bookkeeping only - a ref, not state. It used to be state too (that copy
  // was never read by anything), so every photo starting and finishing a
  // preload re-rendered the whole Discover page twice; with a deck's worth
  // of photos preloading while swiping, that was a steady source of jank,
  // worst on Android.
  const preloadedImagesRef = useRef<Map<string, PreloadedImageData>>(new Map());
  const loadingQueue = useRef<QueueItem[]>([]);
  const isProcessing = useRef(false);
  const inFlightLoads = useRef<Map<string, Promise<void>>>(new Map());
  const cancelledUrls = useRef<Set<string>>(new Set());

  const setImageData = useCallback((url: string, data: PreloadedImageData) => {
    preloadedImagesRef.current.set(url, data);
  }, []);

  const optimizeImageUrl = useCallback((url: string): string => {
    return getDetailImageUrl(url);
  }, []);

  const preloadImage = useCallback((url: string, decode = false): Promise<void> => {
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
        const done = () => {
          setImageData(url, {
            url,
            loaded: true,
            loading: false,
            error: false,
            optimizedUrl
          });
          resolve();
        };
        // For the next card or two, also decode now, so the photo paints the
        // moment its card appears instead of decoding on the first frame.
        // (Only for 'high' priority - decoded bitmaps are memory-heavy.)
        if (decode && typeof img.decode === 'function') {
          img.decode().catch(() => {}).finally(done);
        } else {
          done();
        }
      };

      img.onerror = () => {
        // We just tried the raw file (already <=1024px for any photo
        // uploaded through the app - see getDetailImageUrl). If that failed,
        // it's most likely a stray oversized legacy photo or a decode issue
        // on a huge bitmap, so retry once through Supabase's on-the-fly
        // transform, which re-encodes/downsizes server-side and can succeed
        // where the raw file didn't.
        const transformedUrl = buildTransformUrl(url, { width: 1024, quality: 80 });
        const fallbackUrl = transformedUrl && transformedUrl !== optimizedUrl
          ? transformedUrl
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
          
          await preloadImage(nextItem.url, nextItem.priority === 'high').catch(() => {
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
