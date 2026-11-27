import { useEffect, useRef } from 'react';

// Custom hook for cleanup and memory management
// Custom hook for managing Supabase subscriptions
// Memory monitoring utility for development
export const useMemoryMonitor = () => {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const checkMemory = () => {
        if ('memory' in performance) {
          const memInfo = (performance as any).memory;
          // Memory info available but not logged in production
        }
      };

      const interval = setInterval(checkMemory, 30000); // Check every 30 seconds
      return () => clearInterval(interval);
    }
  }, []);
};
