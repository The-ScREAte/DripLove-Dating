import { useState, useEffect, useRef, useCallback } from 'react';
import { isAndroidPlatform } from '@/utils/platformUtils';
import { preloadImageToBlob } from '@/utils/imageCache';

interface UseOptimizedImageLoadingProps {
  maxConcurrent?: number;
  preloadAhead?: number;
}

export const useOptimizedImageLoading = ({
  maxConcurrent = 4,
  preloadAhead = 3,
}: UseOptimizedImageLoadingProps = {}) => {
  const [loadedImages, setLoadedImages] = useState<{ [key: string]: string[] }>({});
  const [blobUrls, setBlobUrls] = useState<{ [key: string]: { [url: string]: string } }>({});
  const [loadingStatus, setLoadingStatus] = useState<{ [key: string]: boolean }>({});
  
  const loadingQueue = useRef<Set<string>>(new Set());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const isAndroid = isAndroidPlatform();

  const preloadImages = useCallback(async (
    userId: string,
    imageUrls: string[]
  ) => {
    if (!userId || !imageUrls.length || loadingQueue.current.has(userId)) {
      return;
    }

    loadingQueue.current.add(userId);
    setLoadingStatus(prev => ({ ...prev, [userId]: true }));

    const controller = new AbortController();
    abortControllers.current.set(userId, controller);

    try {
      // For Android: skip blob preloading, just cache URLs
      if (isAndroid) {
        setLoadedImages(prev => ({
          ...prev,
          [userId]: imageUrls,
        }));
      } else {
        // For iOS/Web: preload to blob for instant rendering
        const blobMap: { [url: string]: string } = {};
        
        // Load first image immediately, others in background
        const [firstUrl, ...restUrls] = imageUrls;
        
        if (firstUrl) {
          try {
            const blobUrl = await preloadImageToBlob(firstUrl);
            blobMap[firstUrl] = blobUrl;
          } catch {
            blobMap[firstUrl] = firstUrl;
          }
        }
        
        // Load remaining images concurrently (limited)
        const concurrentLimit = Math.min(maxConcurrent, restUrls.length);
        const batches = [];
        
        for (let i = 0; i < restUrls.length; i += concurrentLimit) {
          batches.push(restUrls.slice(i, i + concurrentLimit));
        }
        
        for (const batch of batches) {
          if (controller.signal.aborted) break;
          
          await Promise.allSettled(
            batch.map(async (url) => {
              try {
                const blobUrl = await preloadImageToBlob(url);
                blobMap[url] = blobUrl;
              } catch {
                blobMap[url] = url;
              }
            })
          );
        }
        
        setLoadedImages(prev => ({
          ...prev,
          [userId]: imageUrls,
        }));
        
        setBlobUrls(prev => ({
          ...prev,
          [userId]: blobMap,
        }));
      }
    } catch (error) {
      console.error(`Failed to preload images for ${userId}:`, error);
    } finally {
      loadingQueue.current.delete(userId);
      abortControllers.current.delete(userId);
      setLoadingStatus(prev => ({ ...prev, [userId]: false }));
    }
  }, [isAndroid, maxConcurrent]);

  const cancelPreload = useCallback((userId: string) => {
    if (abortControllers.current.has(userId)) {
      abortControllers.current.get(userId)?.abort();
      abortControllers.current.delete(userId);
    }
    loadingQueue.current.delete(userId);
  }, []);

  const getImageUrl = useCallback((userId: string, imageUrl: string) => {
    // Return blob URL if available, otherwise optimized URL
    if (blobUrls[userId]?.[imageUrl]?.startsWith('blob:')) {
      return blobUrls[userId][imageUrl];
    }
    return imageUrl;
  }, [blobUrls]);

  const clearCache = useCallback(() => {
    // Clean up blob URLs to prevent memory leaks
    Object.values(blobUrls).forEach(userBlobs => {
      Object.values(userBlobs).forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    });
    
    setLoadedImages({});
    setBlobUrls({});
    setLoadingStatus({});
    loadingQueue.current.clear();
    
    abortControllers.current.forEach(controller => controller.abort());
    abortControllers.current.clear();
  }, [blobUrls]);

  useEffect(() => {
    return () => {
      clearCache();
    };
  }, [clearCache]);

  return {
    loadedImages,
    blobUrls,
    loadingStatus,
    preloadImages,
    cancelPreload,
    getImageUrl,
    clearCache,
  };
};
