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
  const [hasShownExpiredNotification, setHasShownExpiredNotification] = useState(false)
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

      // First, quickly check user_subscriptions table for immediate feedback
      const { data: quickCheck } = await supabase
        .from('user_subscriptions')
        .select('plan_name, status, expires_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Set loading to false immediately to show UI faster
      setLoading(false)

      if (quickCheck && quickCheck.plan_name === 'premium' && quickCheck.status === 'active') {
        // Quick check shows active premium, set it immediately
        const isActive = !quickCheck.expires_at || new Date(quickCheck.expires_at) > new Date()
        setSubscriptionStatus({
          plan_name: quickCheck.plan_name,
          status: quickCheck.status,
          expires_at: quickCheck.expires_at,
          is_active: isActive
        })
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
        
        // Disabled: Flash notification removed - subscription status is already visible on profile page
        // if (!hasShownExpiredNotification && (status.status === 'payment_failed' || status.status === 'expired')) {
        //   setHasShownExpiredNotification(true)
        //   toast({
        //     title: 'Subscription Status',
        //     description: status.status === 'payment_failed' 
        //       ? 'Your subscription payment failed. Please update your payment method to continue enjoying premium features.'
        //       : 'Your subscription has expired. Renew now to continue enjoying premium features.',
        //     variant: 'destructive',
        //   })
        // }
      } else {
        // Comprehensive check found no subscription, confirm free status
        // (but don't change if quick check already set premium - avoid flicker)
        if (subscriptionStatus?.plan_name !== 'premium') {
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
