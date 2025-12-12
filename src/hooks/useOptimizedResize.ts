import { useState, useEffect, useRef, useCallback } from 'react';
import { debounce } from '@/utils/performanceUtils';

interface ResizeState {
  width: number;
  height: number;
  columnsPerRow: number;
}

/**
 * ANDROID OPTIMIZATION: Single debounced ResizeObserver
 * Replaces multiple resize event listeners with one efficient observer
 */
export const useOptimizedResize = (
  containerRef: React.RefObject<HTMLElement>,
  options: {
    debounceMs?: number;
    breakpoints?: { sm: number; md: number; lg: number };
  } = {}
) => {
  const { 
    debounceMs = 100, 
    breakpoints = { sm: 640, md: 768, lg: 1024 } 
  } = options;

  const [resizeState, setResizeState] = useState<ResizeState>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 375,
    height: typeof window !== 'undefined' ? window.innerHeight : 667,
    columnsPerRow: 2
  }));

  const observerRef = useRef<ResizeObserver | null>(null);

  // Calculate columns based on width
  const getColumns = useCallback((width: number) => {
    if (width >= breakpoints.lg) return 4;
    if (width >= breakpoints.md) return 3;
    return 2;
  }, [breakpoints.lg, breakpoints.md]);

  // Debounced update function
  const debouncedUpdate = useRef(
    debounce((width: number, height: number) => {
      setResizeState({
        width,
        height,
        columnsPerRow: getColumns(width)
      });
    }, debounceMs)
  ).current;

  useEffect(() => {
    const element = containerRef.current;
    
    // Fallback to window resize if no container
    if (!element) {
      const handleResize = () => {
        debouncedUpdate(window.innerWidth, window.innerHeight);
      };

      window.addEventListener('resize', handleResize, { passive: true });
      return () => window.removeEventListener('resize', handleResize);
    }

    // Use ResizeObserver for container
    observerRef.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        debouncedUpdate(width, height);
      }
    });

    observerRef.current.observe(element);

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [containerRef, debouncedUpdate]);

  return resizeState;
};

/**
 * ANDROID OPTIMIZATION: Calculate row height efficiently
 * Single calculation instead of multiple useEffects
 */
export const useVirtualRowHeight = (
  containerWidth: number,
  columnsPerRow: number,
  options: {
    aspectRatio?: number;
    contentHeight?: number;
    extraPadding?: number;
  } = {}
) => {
  const {
    aspectRatio = 4 / 3, // width / height
    contentHeight = 56,
    extraPadding = 8
  } = options;

  // Memoize calculation
  const rowConfig = useCallback(() => {
    // Responsive padding based on columns
    const paddingMap: Record<number, number> = { 2: 8, 3: 32, 4: 48 };
    const gapMap: Record<number, number> = { 2: 12, 3: 40, 4: 56 };
    const vGapMap: Record<number, number> = { 2: 100, 3: 175, 4: 220 };

    const rowPadding = paddingMap[columnsPerRow] ?? 8;
    const horizontalGap = gapMap[columnsPerRow] ?? 12;
    const verticalGap = vGapMap[columnsPerRow] ?? 180;

    const maxWidth = 1400;
    const effectiveWidth = Math.min(containerWidth, maxWidth);
    const innerWidth = Math.max(0, effectiveWidth - rowPadding * 2);
    const totalGaps = horizontalGap * (columnsPerRow - 1);
    const cardWidth = (innerWidth - totalGaps) / Math.max(1, columnsPerRow);

    const imageHeight = Math.round(cardWidth / aspectRatio);
    const cardHeight = imageHeight + contentHeight + extraPadding;

    return {
      rowHeight: Math.max(200, cardHeight),
      rowPadding,
      horizontalGap,
      verticalGap
    };
  }, [containerWidth, columnsPerRow, aspectRatio, contentHeight, extraPadding]);

  return rowConfig();
};

export default useOptimizedResize;
