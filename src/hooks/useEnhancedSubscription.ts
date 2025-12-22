import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Capacitor } from '@capacitor/core'

interface SubscriptionStatus {
  plan_name: string
  status: string
  expires_at: string | null
  is_active: boolean
}

// Check if we should verify with the native store
const shouldVerifyWithStore = () => {
  return Capacitor.isNativePlatform() && 
         typeof window.CdvPurchase !== 'undefined' && 
         window.CdvPurchase?.store;
}

// Get payment method for current platform
const getExpectedPaymentMethod = (): string | null => {
  if (!Capacitor.isNativePlatform()) return null;
  return Capacitor.getPlatform() === 'android' ? 'google' : 'apple';
}

export function useEnhancedSubscription() {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasShownExpiredNotification, setHasShownExpiredNotification] = useState(false)
  const hasVerifiedWithStore = useRef(false)
  const { toast } = useToast()

  // Verify subscription with native store (Apple/Google)
  const verifyWithNativeStore = async (userId: string, dbSubscription: any): Promise<boolean> => {
    if (!shouldVerifyWithStore() || hasVerifiedWithStore.current) return true;
    
    try {
      // @ts-ignore
      const { store } = window.CdvPurchase;
      if (!store) return true;
      
      const paymentMethod = getExpectedPaymentMethod();
      if (!paymentMethod) return true;
      
      // Only verify if this subscription was purchased via this platform
      if (dbSubscription?.payment_method !== paymentMethod) {
        return true;
      }

      hasVerifiedWithStore.current = true;
      
      // Check for owned products
      const PRODUCT_IDS = [
        'com.driplove.dating.premium.monthlysub3',
        'com.driplove.dating.premium.monthlysub2',
        'premium_monthly',
        'com.driplove.dating.premium.monthly'
      ];
      
      let hasActiveStoreSubscription = false;
      
      for (const productId of PRODUCT_IDS) {
        try {
          const product = store.get?.(productId);
          if (product && product.owned) {
            hasActiveStoreSubscription = true;
            break;
          }
        } catch (err) {
          console.warn('[Subscription] Error checking product:', productId, err);
        }
      }
      
      // If DB says premium but store says not owned - subscription may have expired/been cancelled
      if (dbSubscription?.plan_name === 'premium' && dbSubscription?.status === 'active' && !hasActiveStoreSubscription) {
        // Check expiry date as final confirmation
        if (dbSubscription.expires_at && new Date(dbSubscription.expires_at) <= new Date()) {
          await supabase
            .from('user_subscriptions')
            .update({
              status: 'expired',
              plan_name: 'free',
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);
          
          return false; // Subscription is no longer valid
        }
      }
      
      return hasActiveStoreSubscription || !dbSubscription || dbSubscription.plan_name !== 'premium';
    } catch (error) {
      console.error('[Subscription] Store verification error:', error);
      return true; // Don't block on verification errors
    }
  }

  const checkSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setSubscriptionStatus({
          plan_name: 'free',
          status: 'active',
          expires_at: null,
          is_active: false
        })
        setLoading(false)
        return
      }

      // First, quickly check user_subscriptions table for immediate feedback
      const { data: quickCheck } = await supabase
        .from('user_subscriptions')
        .select('plan_name, status, expires_at, payment_method')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Set loading to false immediately to show UI faster
      setLoading(false)

      if (quickCheck && quickCheck.plan_name === 'premium' && quickCheck.status === 'active') {
        // Check if subscription has actually expired
        const isExpired = quickCheck.expires_at && new Date(quickCheck.expires_at) <= new Date()
        
        if (isExpired) {
          // Subscription has expired - update the database and set to free
          // Update the subscription status in the database
          await supabase
            .from('user_subscriptions')
            .update({
              status: 'expired',
              plan_name: 'free',
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
          
          setSubscriptionStatus({
            plan_name: 'free',
            status: 'expired',
            expires_at: quickCheck.expires_at,
            is_active: false
          })
        } else {
          // Verify with native store if on mobile
          const storeValid = await verifyWithNativeStore(user.id, quickCheck);
          
          if (!storeValid) {
            // Store says subscription is not valid
            setSubscriptionStatus({
              plan_name: 'free',
              status: 'expired',
              expires_at: quickCheck.expires_at,
              is_active: false
            })
          } else {
            // Active premium subscription
            setSubscriptionStatus({
              plan_name: quickCheck.plan_name,
              status: quickCheck.status,
              expires_at: quickCheck.expires_at,
              is_active: true
            })
          }
        }
      } else {
        // Set to free immediately if no active premium found
        setSubscriptionStatus({
          plan_name: 'free',
          status: 'active',
          expires_at: null,
          is_active: false
        })
      }

      // Now do the comprehensive check with the database function for accuracy
      const { data, error } = await supabase.rpc('get_current_subscription_status', {
        p_user_id: user.id
      })

      if (error) {
        console.error('Subscription check failed:', error)
        // Keep the quick check result if comprehensive check fails
      } else if (data && data.length > 0) {
        const status = data[0]
        // Update with the comprehensive result
        setSubscriptionStatus(status)
      } else {
        // Comprehensive check found no subscription, confirm free status
        // (but don't change if quick check already set premium - avoid flicker)
        if (subscriptionStatus?.plan_name !== 'premium' || !subscriptionStatus?.is_active) {
          setSubscriptionStatus({
            plan_name: 'free',
            status: 'active',
            expires_at: null,
            is_active: false
          })
        }
      }
    } catch (error) {
      console.error('Subscription check failed:', error)
      // Keep existing status or set to free if none exists
      if (!subscriptionStatus) {
        setSubscriptionStatus({
          plan_name: 'free',
          status: 'active',
          expires_at: null,
          is_active: false
        })
      }
    }
  }

  useEffect(() => {
    checkSubscription()
    
    // Recheck subscription status every 5 minutes
    const interval = setInterval(checkSubscription, 5 * 60 * 1000)
    
    // Also listen for auth state changes
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        hasVerifiedWithStore.current = false; // Reset store verification flag on login
        checkSubscription()
      } else if (event === 'SIGNED_OUT') {
        hasVerifiedWithStore.current = false;
        setSubscriptionStatus({
          plan_name: 'free',
          status: 'active',
          expires_at: null,
          is_active: false
        })
        setLoading(false)
      }
    })

    return () => {
      clearInterval(interval)
      authSubscription.unsubscribe()
    }
  }, [toast])

  return {
    subscriptionStatus,
    isActive: subscriptionStatus?.is_active || false,
    isPremium: subscriptionStatus?.plan_name === 'premium' && subscriptionStatus?.is_active,
    loading,
    refetch: checkSubscription
  }
}
