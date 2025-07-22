
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SubscriptionInfo {
  plan_name: string;
  status: string;
  expires_at: string | null;
  features: {
    daily_swipes: number;
    reverse_dislikes: number;
    liked_me_visible: number;
  };
}

interface UsageInfo {
  success: boolean;
  message?: string;
  current_usage: number;
  limit: number;
}

export const useSubscription = (userId: string | undefined) => {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSubscription = async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase.rpc('get_user_subscription', {
        user_id_param: userId
      });

      if (error) throw error;
      
      const subscriptionData = data as unknown as SubscriptionInfo;
      setSubscription(subscriptionData);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      // Fallback to default free subscription if function doesn't exist
      setSubscription({
        plan_name: 'free',
        status: 'active',
        expires_at: null,
        features: {
          daily_swipes: 12,
          reverse_dislikes: 1,
          liked_me_visible: 1
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const checkUsageLimit = async (usageType: 'swipe' | 'reverse_dislike'): Promise<UsageInfo> => {
    if (!userId) {
      return { success: false, message: 'User not authenticated', current_usage: 0, limit: 0 };
    }

    try {
      const { data, error } = await supabase.rpc('update_user_usage', {
        user_id_param: userId,
        usage_type: usageType,
        increment_by: 1
      });

      if (error) throw error;
      return data as unknown as UsageInfo;
    } catch (error) {
      console.error('Error checking usage limit:', error);
      // Fallback: allow the action but with basic limits
      const defaultLimit = usageType === 'swipe' ? 12 : 1;
      return { 
        success: true, 
        message: 'Action allowed (fallback mode)', 
        current_usage: 1, 
        limit: defaultLimit 
      };
    }
  };

  const isPremium = () => {
    return subscription?.plan_name === 'premium';
  };

  const canUseFeature = (feature: 'swipe' | 'reverse_dislike' | 'liked_me_full') => {
    if (!subscription) return false;
    
    if (isPremium()) return true;
    
    // For free users, we'll check limits in real-time
    return true; // We'll check the actual limit when they try to use it
  };

  const getLikedMeVisibleCount = () => {
    if (!subscription || !subscription.features) return 1;
    return subscription.features.liked_me_visible === -1 ? -1 : subscription.features.liked_me_visible;
  };

  useEffect(() => {
    fetchSubscription();
  }, [userId]);

  return {
    subscription,
    loading,
    isPremium,
    canUseFeature,
    checkUsageLimit,
    getLikedMeVisibleCount,
    refetchSubscription: fetchSubscription
  };
};
