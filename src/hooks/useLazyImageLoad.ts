import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * ANDROID OPTIMIZATION: Lazy load images using IntersectionObserver
 * Only loads images when they enter the viewport
 */
export const useLazyImageLoad = (
  imageUrl: string | undefined,
  options: {
    rootMargin?: string;
    threshold?: number;
    enabled?: boolean;
  } = {}
) => {
  const { rootMargin = '100px', threshold = 0.1, enabled = true } = options;
  const [isLoaded, setIsLoaded] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [error, setError] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setRef = useCallback((element: HTMLElement | null) => {
    // Cleanup previous observer
    if (observerRef.current && elementRef.current) {
      observerRef.current.unobserve(elementRef.current);
    }

    elementRef.current = element;

    if (!element || !enabled || !imageUrl) return;

    // Create observer if it doesn't exist
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setShouldLoad(true);
              // Stop observing once we start loading
              observerRef.current?.unobserve(entry.target);
            }
          });
        },
        { rootMargin, threshold }
      );
    }

    observerRef.current.observe(element);
  }, [enabled, imageUrl, rootMargin, threshold]);

  // Load image when shouldLoad is true
  useEffect(() => {
    if (!shouldLoad || !imageUrl) return;

    const img = new Image();
    
    img.onload = () => {
      setIsLoaded(true);
      setError(false);
    };
    
    img.onerror = () => {
      setError(true);
      setIsLoaded(false);
    };
    
    img.src = imageUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [shouldLoad, imageUrl]);

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  return {
    ref: setRef,
    isLoaded,
    shouldLoad,
    error,
    src: shouldLoad ? imageUrl : undefined
  };
};

/**
 * ANDROID OPTIMIZATION: Batch preload multiple images with priority
 * Loads critical images first, then background loads the rest
 */
export const useBatchImagePreload = (
  imageUrls: string[],
  options: {
    priorityCount?: number;
    enabled?: boolean;
  } = {}
) => {
  const { priorityCount = 3, enabled = true } = options;
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || imageUrls.length === 0) return;

    // Cancel previous loads
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const loadImage = (url: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        if (controller.signal.aborted) {
          reject(new Error('Aborted'));
          return;
        }

        const img = new Image();
        
        const cleanup = () => {
          img.onload = null;
          img.onerror = null;
        };

        controller.signal.addEventListener('abort', () => {
          cleanup();
          reject(new Error('Aborted'));
        });

        img.onload = () => {
          cleanup();
          resolve(url);
        };
        
        img.onerror = () => {
          cleanup();
          reject(new Error(`Failed to load: ${url}`));
        };
        
        img.src = url;
      });
    };

    const loadImages = async () => {
      setIsLoading(true);

      // Load priority images first (await)
      const priorityUrls = imageUrls.slice(0, priorityCount);
      
      for (const url of priorityUrls) {
        if (controller.signal.aborted) break;
        
        try {
          await loadImage(url);
          setLoadedImages(prev => new Set([...prev, url]));
        } catch {
          // Silent fail for individual images
        }
      }

      // Load remaining images in background (no await)
      const remainingUrls = imageUrls.slice(priorityCount);
      
      remainingUrls.forEach(url => {
        if (controller.signal.aborted) return;
        
        loadImage(url)
          .then(() => {
            if (!controller.signal.aborted) {
              setLoadedImages(prev => new Set([...prev, url]));
            }
          })
          .catch(() => {
            // Silent fail
          });
      });

      setIsLoading(false);
    };

    loadImages();

    return () => {
      controller.abort();
    };
  }, [imageUrls.join(','), priorityCount, enabled]);

  return {
    loadedImages,
    isLoading,
    isImageLoaded: (url: string) => loadedImages.has(url)
  };
};

export default useLazyImageLoad;
