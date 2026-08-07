
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
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      // Check if user is authenticated first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      // Use real-time subscription status checker
      const { data, error } = await supabase.rpc('get_current_subscription_status', {
        p_user_id: userId
      });

      if (error) {
        // Fallback to old method silently
        const { data: fallbackData, error: fallbackError } = await supabase.rpc('get_user_subscription', {
          user_id_param: userId
        });
        
        if (fallbackError) {
          // Set default free subscription
          setSubscription({
            plan_name: 'free',
            status: 'active',
            expires_at: null,
            features: {
              daily_swipes: 29,
              reverse_dislikes: 1,
              liked_me_visible: 1
            }
          });
          return;
        }
        
        const subscriptionData = fallbackData as unknown as SubscriptionInfo;
        setSubscription(subscriptionData);
        return;
      }
      
      const statusData = Array.isArray(data) ? data[0] : data;
      
      // Convert real-time status to subscription info format
      const subscriptionInfo: SubscriptionInfo = {
        plan_name: statusData.plan_name || 'free',
        status: statusData.status || 'active',
        expires_at: statusData.expires_at,
        features: statusData.plan_name === 'premium' ? {
          daily_swipes: -1, // Unlimited
          reverse_dislikes: -1, // Unlimited
          liked_me_visible: -1 // Unlimited
        } : {
          daily_swipes: 29, // Free users get 29 swipes per day
          reverse_dislikes: 1,
          liked_me_visible: 1
        }
      };
      
      setSubscription(subscriptionInfo);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      // Fallback to default free subscription
      setSubscription({
        plan_name: 'free',
        status: 'active',
        expires_at: null,
        features: {
          daily_swipes: 29, // Free users get 29 swipes per day
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
      const defaultLimit = usageType === 'swipe' ? 25 : 1;
      return { 
        success: true, 
        message: 'Action allowed (fallback mode)', 
        current_usage: 1, 
        limit: defaultLimit 
      };
    }
  };

  const isPremium = () => {
    const sub = Array.isArray(subscription) ? subscription[0] : subscription;
    if (!sub) return false;

    const entitledByStatus = sub.status === 'active' || sub.status === 'cancelled';
    const notExpired = !sub.expires_at || new Date(sub.expires_at) > new Date();

    // Cancelled subscriptions remain premium until expires_at.
    return sub.plan_name === 'premium' && entitledByStatus && notExpired;
  };

  const canUseFeature = (feature: 'swipe' | 'reverse_dislike' | 'liked_me_full') => {
    if (!subscription) return false;
    
    if (isPremium()) return true;
    
    // For free users, we'll check limits in real-time
    return true; // We'll check the actual limit when they try to use it
  };

  const getLikedMeVisibleCount = () => {
    if (!subscription) return 1;
    return subscription.features.liked_me_visible === -1 ? -1 : subscription.features.liked_me_visible;
  };

  useEffect(() => {
    fetchSubscription();
    
    // Set up real-time subscription monitoring
    if (userId) {
      const channel = supabase
        .channel('subscription-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_subscriptions',
            filter: `user_id=eq.${userId}`
          },
          (payload) => {
            // Refetch subscription when it changes
            fetchSubscription();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
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
