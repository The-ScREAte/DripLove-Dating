
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Crown, Heart, RotateCcw, Users, Check, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const premiumFeatures = [
  { name: 'Unlimited Daily Swipes', icon: Heart },
  { name: 'Reverse Dislikes', icon: RotateCcw },
  { name: 'See All Who Liked You', icon: Users },
  { name: 'Priority Support', icon: Crown },
  { name: 'All future premium features included!', icon: Check },
];

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [redirectTimer, setRedirectTimer] = useState<NodeJS.Timeout | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [redirectTimer]);

  // Check authentication first
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to view payment status.',
          variant: 'destructive',
        });
        navigate('/auth');
        return;
      }
      setIsAuthenticated(true);
      setIsLoading(false);
    };
    
    checkAuth();
  }, [navigate, toast]);

  useEffect(() => {
    // Only proceed if authenticated
    if (!isAuthenticated) return;

    // Check for payment status in query params
    const params = new URLSearchParams(location.search);
    const statusRaw = params.get('status')?.toLowerCase() || '';
    // Normalize status (Paystack may return 'success' or 'successful')
    const status = statusRaw === 'success' ? 'successful' : statusRaw;
    const tx_ref = params.get('tx_ref');
    const transaction_id = params.get('transaction_id');
    const reference = params.get('reference') || params.get('trxref') || params.get('txref') || params.get('tx_ref');
    const txnId = transaction_id || reference || null;
    const payment_type = params.get('payment_type') || 'subscription'; // Default to subscription for backward compatibility
    
    // ...removed console.log...
    
    // If no payment parameters, redirect to discover page
    if (!status && !tx_ref && !transaction_id) {
      // ...removed console.log...
      toast({
        title: 'Invalid Access',
        description: 'Please initiate payment to access this page.',
        variant: 'default',
      });
      navigate('/discover');
      return;
    }
    
    // Handle different payment statuses
    if (status === 'cancelled') {
      toast({
        title: 'Payment Cancelled',
        description: 'Your payment was cancelled. No charges were made.',
        variant: 'default',
      });
      setTimeout(() => navigate('/discover'), 2000); // Redirect after 2 seconds
      return;
    }
    
    if (status === 'failed') {
      toast({
        title: 'Payment Failed',
        description: 'Your payment could not be processed. Please try again.',
        variant: 'destructive',
      });
      setTimeout(() => navigate('/discover'), 2000); // Redirect after 2 seconds
      return;
    }
    
    if (status !== 'successful' || !txnId) {
      // ...removed console.log...
      setError('Payment verification failed. Please contact support if money was deducted.');
      // Auto-redirect after 10 seconds for error cases
      setRedirectCountdown(10);
      const timer = setTimeout(() => {
        navigate('/discover');
      }, 10000);
      setRedirectTimer(timer);
      
      // Countdown timer
      const countdownInterval = setInterval(() => {
        setRedirectCountdown(prev => {
          if (prev && prev > 1) {
            return prev - 1;
          } else {
            clearInterval(countdownInterval);
            return null;
          }
        });
      }, 1000);
      
      return;
    }
    
    // Process successful payment
    if (status === 'successful' && txnId) {
      setUpgrading(true);
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        const user = session?.user;
        if (!user) {
          setError('User session expired. Please log in again.');
          setUpgrading(false);
          setTimeout(() => navigate('/auth'), 3000);
          return;
        }

        try {
          // ...removed console.log...
          // ...removed console.log...
          // ...removed console.log...
          // ...removed console.log...
          
          // Since Paystack confirmed the payment was successful,
          // create the subscription directly
          const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          const subscriptionData = {
            user_id: user.id,
            plan_name: 'premium',
            status: 'active',
            flutterwave_transaction_id: txnId, // Using existing field for Paystack transaction
            starts_at: new Date().toISOString(),
            expires_at: expiryDate.toISOString(),
            next_billing_date: payment_type === 'one-time' ? null : expiryDate.toISOString(), // No next billing for one-time
            auto_renew: payment_type !== 'one-time', // No auto-renewal for one-time payments
            payment_method: 'paystack', // Changed from flutterwave to paystack
            updated_at: new Date().toISOString(),
          };
          
          // ...removed console.log...
          
          // First, check if user already has a subscription
          const { data: existingSubscription } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .single();
          
          let subscriptionResult;
          let subscriptionError;
          
          if (existingSubscription) {
            // Update existing subscription
            // ...removed console.log...
            const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            const { data, error } = await supabase
              .from('user_subscriptions')
              .update({
                plan_name: 'premium',
                status: 'active',
                flutterwave_transaction_id: txnId, // Using existing field for Paystack transaction
                expires_at: expiryDate.toISOString(),
                next_billing_date: payment_type === 'one-time' ? null : expiryDate.toISOString(), // No next billing for one-time
                auto_renew: payment_type !== 'one-time', // No auto-renewal for one-time payments
                payment_method: 'paystack', // Changed from flutterwave to paystack
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', user.id)
              .select();
            subscriptionResult = data;
            subscriptionError = error;
          } else {
            // Create new subscription
            // ...removed console.log...
            const { data, error } = await supabase
              .from('user_subscriptions')
              .insert([subscriptionData])
              .select();
            subscriptionResult = data;
            subscriptionError = error;
          }
          
          // ...removed console.log...
          
          if (subscriptionError) {
            console.error('Subscription error:', subscriptionError);
            const errorDetails = subscriptionError.message || subscriptionError.details || 'Unknown database error';
            setError(`Could not activate premium: ${errorDetails}. Please contact support with transaction ID: ${txnId}`);
          } else {
            // ...removed console.log...
            // ...removed console.log...
            setUpgradeSuccess(true);
            
            // Verify the subscription was created with premium plan
            if (subscriptionResult && subscriptionResult[0] && subscriptionResult[0].plan_name === 'premium') {
              // ...removed console.log...
              
              // Let's also test the subscription fetch immediately
              try {
                // ...removed console.log...
                const { data: testData, error: testError } = await supabase.rpc('get_user_subscription', {
                  user_id_param: user.id
                });
                // ...removed console.log...
                
                const subscriptionTestData = testData as any;
                if (subscriptionTestData && subscriptionTestData.plan_name === 'premium') {
                  // ...removed console.log...
                } else {
                  // ...removed console.log...
                }
              } catch (testErr) {
                console.error('❌ Subscription fetch test ERROR:', testErr);
              }
              
              toast({ 
                title: 'Premium Activated!', 
                description: 'Your account has been upgraded to premium. You now have unlimited access!' 
              });
              
              // Force a small delay to ensure database consistency before redirect
              setTimeout(() => {
                // ...removed console.log...
              }, 1000);
              
              // Don't redirect automatically - let user click the button
              // The button will navigate with ?premium=activated parameter
            } else {
              console.error('⚠️ Subscription created but plan_name is not premium:', subscriptionResult);
              setError('Subscription created but premium access may not be active. Please contact support.');
            }
          }
        } catch (err) {
          console.error('Unexpected error during premium activation:', err);
          setError('An unexpected error occurred. Please contact support with transaction ID: ' + txnId);
        }
        
        setUpgrading(false);
      });
    }
  }, [location.search, toast, navigate, isAuthenticated]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  // Show error state with option to go back
  if (error && !upgrading && !upgradeSuccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-400 via-pink-500 to-purple-600 p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center border-4 border-red-300/60 relative">
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gradient-to-br from-red-400 to-red-600 rounded-full p-3 shadow-lg">
            <AlertCircle className="w-14 h-14 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold mb-3 mt-8 text-gray-900 tracking-tight">Payment Issue</h1>
          <div className="mb-6 text-red-600 font-semibold bg-red-50 p-4 rounded-lg border border-red-200">
            {error}
            {redirectCountdown && (
              <div className="mt-2 text-sm text-gray-600">
                Redirecting in {redirectCountdown} seconds...
              </div>
            )}
          </div>
          <div className="space-y-3">
            <Button
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold py-3 px-8 rounded-full text-lg shadow-lg hover:scale-105 transition-all duration-200"
              onClick={() => navigate('/discover')}
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Try Payment Again
            </Button>
            <Button
              variant="outline"
              className="w-full border-2 border-gray-300 text-gray-700 font-semibold py-3 px-8 rounded-full text-lg hover:bg-gray-50 transition-all duration-200"
              onClick={() => navigate('/')}
            >
              Go to Home
            </Button>
          </div>
          <div className="mt-6 text-xs text-gray-400">
            Need help? Contact support with your transaction details.
          </div>
        </div>
      </div>
    );
  }

  // Show success state
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center border-4 border-yellow-300/60 relative animate-fade-in">
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full p-3 shadow-lg animate-bounce">
          <Crown className="w-14 h-14 text-yellow-600" />
        </div>
        <h1 className="text-4xl font-extrabold mb-3 mt-8 text-gray-900 tracking-tight drop-shadow-lg">Welcome to Premium!</h1>
        <p className="mb-6 text-lg text-gray-700 font-medium">Your payment was successful.<br/>You now have access to:</p>
        <ul className="mb-8 text-left space-y-3">
          {premiumFeatures.map((feature, idx) => (
            <li key={feature.name} className="flex items-center gap-3 bg-gradient-to-r from-pink-100 to-yellow-100 rounded-xl px-4 py-2 shadow-sm">
              <span className="inline-flex items-center justify-center bg-pink-200 rounded-full p-2"><feature.icon className="w-6 h-6 text-pink-500" /></span>
              <span className="text-gray-900 font-semibold text-base">{feature.name}</span>
            </li>
          ))}
        </ul>
        {upgrading && <div className="mb-4 text-pink-600 font-semibold animate-pulse">Activating premium...</div>}
        {error && <div className="mb-4 text-red-600 font-semibold animate-shake">{error}</div>}
        <Button
          className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-extrabold py-3 px-8 rounded-full text-xl shadow-xl hover:scale-105 hover:shadow-2xl transition-all duration-200 mt-2"
          onClick={() => navigate('/?premium=activated')}
          disabled={upgrading}
        >
          Start Discovering Now
        </Button>
        <div className="mt-6 text-xs text-gray-400">Enjoy your premium experience! 🎉</div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
