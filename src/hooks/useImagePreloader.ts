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
  const loadingQueue = useRef<string[]>([]);
  const isProcessing = useRef(false);

  const optimizeImageUrl = useCallback((url: string): string => {
    if (url.includes('supabase')) {
      return `${url}?width=${width}&quality=${quality}&format=${format}`;
    }
    return url;
  }, [width, quality, format]);

  const preloadImage = useCallback((url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const optimizedUrl = optimizeImageUrl(url);
      
      // Check if already loaded or loading
      const existing = preloadedImages.get(url);
      if (existing?.loaded) {
        resolve();
        return;
      }
      if (existing?.loading) {
        // Wait for existing load to complete
        const checkLoaded = () => {
          const current = preloadedImages.get(url);
          if (current?.loaded) {
            resolve();
          } else if (current?.error) {
            reject(new Error('Image failed to load'));
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
        return;
      }

      // Mark as loading
      setPreloadedImages(prev => new Map(prev.set(url, {
        url,
        loaded: false,
        loading: true,
        error: false,
        optimizedUrl
      })));

      const img = new Image();
      
      img.onload = () => {
        setPreloadedImages(prev => new Map(prev.set(url, {
          url,
          loaded: true,
          loading: false,
          error: false,
          optimizedUrl
        })));
        resolve();
      };
      
      img.onerror = () => {
        setPreloadedImages(prev => new Map(prev.set(url, {
          url,
          loaded: false,
          loading: false,
          error: true,
          optimizedUrl
        })));
        reject(new Error('Image failed to load'));
      };
      
      img.src = optimizedUrl;
    });
  }, [optimizeImageUrl, preloadedImages]);

  const processQueue = useCallback(async () => {
    if (isProcessing.current || loadingQueue.current.length === 0) return;
    
    isProcessing.current = true;
    
    while (loadingQueue.current.length > 0) {
      const batch = loadingQueue.current.splice(0, maxConcurrent);
      const promises = batch.map(url => preloadImage(url).catch(error => {
      }));
      
      await Promise.all(promises);
      
      // Small delay between batches to prevent overwhelming the browser
      if (loadingQueue.current.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    isProcessing.current = false;
  }, [maxConcurrent, preloadImage]);

  const preloadImages = useCallback((urls: string[]) => {
    // Add new URLs to queue (avoid duplicates)
    const newUrls = urls.filter(url => 
      !loadingQueue.current.includes(url) && 
      !preloadedImages.get(url)?.loaded
    );
    
    loadingQueue.current.push(...newUrls);
    processQueue();
  }, [processQueue, preloadedImages]);

  const getOptimizedUrl = useCallback((url: string): string => {
    const imageData = preloadedImages.get(url);
    return imageData?.optimizedUrl || optimizeImageUrl(url);
  }, [preloadedImages, optimizeImageUrl]);

  const isImageLoaded = useCallback((url: string): boolean => {
    return preloadedImages.get(url)?.loaded || false;
  }, [preloadedImages]);

  const isImageLoading = useCallback((url: string): boolean => {
    return preloadedImages.get(url)?.loading || false;
  }, [preloadedImages]);

  const clearCache = useCallback(() => {
    setPreloadedImages(new Map());
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
