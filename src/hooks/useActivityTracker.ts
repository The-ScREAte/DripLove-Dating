import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to track user activity and update last_login_at
 * This ensures accurate "active users" stats by updating when user is actually using the app
 * Also unarchives users when they become active again
 */
export const useActivityTracker = (userId: string | undefined) => {
  const lastUpdateRef = useRef<number>(0);
  const MIN_UPDATE_INTERVAL = 5 * 60 * 1000; // Only update every 5 minutes max to avoid excessive DB writes

  useEffect(() => {
    if (!userId) return;

    const updateActivity = async () => {
      const now = Date.now();
      
      // Don't update more than once every 5 minutes
      if (now - lastUpdateRef.current < MIN_UPDATE_INTERVAL) {
        return;
      }
      
      lastUpdateRef.current = now;
      
      try {
        // Update last_login_at AND unarchive user if they were archived
        await supabase
          .from('profiles')
          .update({ 
            last_login_at: new Date().toISOString(),
            is_archived: false // Unarchive on activity
          })
          .eq('id', userId);
      } catch (error) {
        // Silently fail - activity tracking is not critical
        void 0;
      }
    };

    // Update immediately on mount
    updateActivity();

    // Update on visibility change (when user comes back to the app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateActivity();
      }
    };

    // Update periodically while app is active (every 5 minutes)
    const intervalId = setInterval(updateActivity, MIN_UPDATE_INTERVAL);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [userId]);
};
