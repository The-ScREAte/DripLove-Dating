import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'

interface SubscriptionStatus {
  plan_name: string
  status: string
  expires_at: string | null
  is_active: boolean
}

export function useEnhancedSubscription() {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

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

      // Use the database function for real-time subscription checking
      const { data, error } = await supabase.rpc('get_current_subscription_status', {
        p_user_id: user.id
      })

      if (error) {
        console.error('Subscription check failed:', error)
        // Fallback to free plan on error
        setSubscriptionStatus({
          plan_name: 'free',
          status: 'active',
          expires_at: null,
          is_active: false
        })
      } else if (data && data.length > 0) {
        const status = data[0]
        setSubscriptionStatus(status)
        
        // Show notification if subscription was downgraded due to payment failure
        if (status.status === 'payment_failed' || status.status === 'expired') {
          toast({
            title: 'Subscription Status Changed',
            description: status.status === 'payment_failed' 
              ? 'Your subscription was suspended due to payment failure. Please update your payment method.'
              : 'Your subscription has expired. Please renew to continue using premium features.',
            variant: 'destructive',
          })
        }
      } else {
        // No subscription found, default to free
        setSubscriptionStatus({
          plan_name: 'free',
          status: 'active',
          expires_at: null,
          is_active: false
        })
      }
    } catch (error) {
      console.error('Subscription check failed:', error)
      setSubscriptionStatus({
        plan_name: 'free',
        status: 'active',
        expires_at: null,
        is_active: false
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkSubscription()
    
    // Recheck subscription status every 5 minutes
    const interval = setInterval(checkSubscription, 5 * 60 * 1000)
    
    // Also listen for auth state changes
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        checkSubscription()
      } else if (event === 'SIGNED_OUT') {
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
