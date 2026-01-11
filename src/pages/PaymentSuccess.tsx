
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Crown, Heart, RotateCcw, Users, Check, AlertCircle, ArrowLeft, Globe } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const premiumFeatures = [
  { name: 'Unlimited Daily Swipes', icon: Heart },
  { name: 'Reverse Dislikes', icon: RotateCcw },
  { name: 'See All Who Liked You', icon: Users },
  { name: 'Unlock Global Matches', icon: Globe },
  { name: 'Priority Support', icon: Crown },
  { name: 'All future premium features included!', icon: Check },
];

function isPremiumActive(row: { plan_name?: string; status?: string; expires_at?: string | null } | null) {
  if (!row) return false;
  if (row.plan_name !== 'premium' || row.status !== 'active') return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at) > new Date();
}

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [redirectTimer, setRedirectTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  const getErrorMessage = (err: unknown): string | undefined => {
    if (err instanceof Error) return err.message
    if (typeof err !== 'object' || !err) return undefined
    if (!('message' in err)) return undefined
    const msg = (err as { message?: unknown }).message
    return typeof msg === 'string' ? msg : undefined
  }

  const waitForPremiumActivation = useCallback(async (userId: string, timeoutMs = 25000, intervalMs = 1500) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('plan_name, status, expires_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && isPremiumActive(data)) {
        return true;
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }, []);

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
        // NOTE: There is no dedicated /auth route in this app (auth runs on '/').
        // If the user completes payment while their session expires, the webhook should still
        // activate premium server-side. We just need the user to log back in to see it.
        setIsAuthenticated(false);
        setIsLoading(false);
        setError('Your session expired while you were paying. Please go back home and log in again to confirm your premium status. If you already paid, premium should activate automatically within a few minutes.');
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
    // Note: Some Paystack callback implementations may not append params with '&' when callback_url already
    // contains a query string. To be resilient, we also regex-scan the raw query.
    const params = new URLSearchParams(location.search);
    const rawQuery = location.search || '';
    const findFromRaw = (key: string): string | null => {
      const match = rawQuery.match(new RegExp(`[?&]${key}=([^&]+)`, 'i'));
      return match?.[1] ? decodeURIComponent(match[1]) : null;
    };

    const statusRaw = (params.get('status') || findFromRaw('status') || '').toLowerCase();
    // Normalize status (Paystack may return 'success' or 'successful')
    const status = statusRaw === 'success' ? 'successful' : statusRaw;
    const tx_ref = params.get('tx_ref') || findFromRaw('tx_ref');
    const transaction_id = params.get('transaction_id') || findFromRaw('transaction_id');
    const reference =
      params.get('reference') ||
      params.get('trxref') ||
      params.get('txref') ||
      params.get('tx_ref') ||
      findFromRaw('reference') ||
      findFromRaw('trxref') ||
      findFromRaw('txref');
    // Use transaction_id first, then reference - Paystack redirect uses reference
    const txnId = transaction_id || reference || null;

    // payment_type may be missing on web callback; fall back to localStorage from payment initiation.
    let payment_type = params.get('payment_type') || findFromRaw('payment_type') || '';
    if (!payment_type) {
      try {
        payment_type = window.localStorage.getItem('driplove_last_payment_type') || '';
      } catch {
        // ignore
      }
    }
    if (!payment_type) payment_type = 'subscription';

    // If Paystack returns without query params (common production issue), fall back to the reference
    // we stored during initialization. Only trust it if it's recent.
    let fallbackReference: string | null = null;
    try {
      const storedRef = window.localStorage.getItem('driplove_last_paystack_reference');
      const storedTsRaw = window.localStorage.getItem('driplove_last_payment_ts');
      const storedTs = storedTsRaw ? Number(storedTsRaw) : 0;
      const isRecent = Number.isFinite(storedTs) && storedTs > 0 && Date.now() - storedTs < 30 * 60 * 1000;
      if (storedRef && isRecent) fallbackReference = storedRef;
    } catch {
      // ignore
    }

    // If IAP (Apple or Google), edge function has already validated and activated.
    if (payment_type === 'iap' && status === 'successful') {
      setError(null);
      setUpgradeSuccess(true);
      setUpgrading(false);
      return;
    }

    // If no payment parameters, but we have a recent stored reference, try verifying anyway.
    // Otherwise, redirect home.
    if (!status && !tx_ref && !transaction_id && !txnId && !fallbackReference) {
      toast({
        title: 'Invalid Access',
        description: 'Please initiate payment to access this page.',
        variant: 'default',
      });
      navigate('/');
      return;
    }

    // Handle different payment statuses
    if (status === 'cancelled') {
      toast({
        title: 'Payment Cancelled',
        description: 'Your payment was cancelled. No charges were made.',
        variant: 'default',
      });
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    if (status === 'failed') {
      toast({
        title: 'Payment Failed',
        description: 'Your payment could not be processed. Please try again.',
        variant: 'destructive',
      });
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    // If status is missing but we have a reference, treat as "pending" and attempt verification.
    const effectiveTxnId = txnId || fallbackReference;
    const effectiveStatus = status || (effectiveTxnId ? 'successful' : '');

    if (effectiveStatus !== 'successful' || !effectiveTxnId) {
      setError('Payment verification failed. Please contact support if money was deducted.');
      setRedirectCountdown(10);
      const timer = setTimeout(() => {
        navigate('/');
      }, 10000);
      setRedirectTimer(timer);

      const countdownInterval = setInterval(() => {
        setRedirectCountdown((prev) => {
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

    // Paystack success path: verify server-side before granting premium.
    setUpgrading(true);
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setError('Your session expired while processing this payment. Please go back home and log in again to confirm your premium status.');
        setUpgrading(false);
        setTimeout(() => navigate('/'), 2000);
        return;
      }

      try {
        const referenceToVerify = reference || txnId || fallbackReference;
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke('paystack-verify', {
          body: {
            reference: referenceToVerify,
            payment_type: payment_type === 'one-time' ? 'one-time' : 'subscription',
          },
        });

        if (verifyError || !verifyData?.ok || !verifyData?.verified) {
          const details = getErrorMessage(verifyError) || verifyData?.error || 'Verification failed';
          setError(
            `Payment verification failed: ${details}. If money was deducted, contact support with reference: ${referenceToVerify}`
          );
          return;
        }

        // Wait for DB to reflect premium before showing activation as complete.
        const activated = await waitForPremiumActivation(user.id);
        if (!activated) {
          setError(
            `Payment verified, but premium activation is taking longer than expected. If it doesn't activate soon, contact support with reference: ${referenceToVerify}`
          );
          return;
        }

        setUpgradeSuccess(true);

        // Clear stored reference on success to avoid stale replays.
        try {
          window.localStorage.removeItem('driplove_last_paystack_reference');
        } catch {
          // ignore
        }
      } catch (err: unknown) {
        console.error('Payment processing error:', err);
        setError(`Payment processing failed: ${getErrorMessage(err) || 'Unknown error'}`);
      } finally {
        setUpgrading(false);
      }
    })();
  }, [location.search, toast, navigate, isAuthenticated, waitForPremiumActivation]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
  <div className="min-h-fill flex flex-col items-center justify-center bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!isAuthenticated) {
    return (
      <div className="min-h-fill flex flex-col items-center justify-center bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center border-4 border-yellow-300/60 relative">
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full p-3 shadow-lg">
            <AlertCircle className="w-14 h-14 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold mb-3 mt-8 text-gray-900 tracking-tight">Login Required</h1>
          <div className="mb-6 text-gray-700 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            {error || 'Please log in to view and confirm your payment status.'}
          </div>
          <Button
            className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-extrabold py-3 px-8 rounded-full text-lg shadow-xl hover:scale-105 hover:shadow-2xl transition-all duration-200"
            onClick={() => navigate('/')}
          >
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  // Show error state with option to go back
  if (error && !upgrading && !upgradeSuccess) {
    return (
  <div className="min-h-fill flex flex-col items-center justify-center bg-gradient-to-br from-red-400 via-pink-500 to-purple-600 p-4">
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
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Try Payment Again
            </Button>
            <Button
              variant="outline"
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
  <div className="min-h-fill flex flex-col items-center justify-center bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-3">
      <div className="bg-white rounded-3xl shadow-2xl p-4 max-w-md w-full text-center border-4 border-yellow-300/60 relative animate-fade-in">
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full p-1.5 shadow-lg animate-bounce">
          <Crown className="w-8 h-8 text-yellow-600" />
        </div>
        <h1 className="text-xl font-extrabold mb-1 mt-4 text-gray-900 tracking-tight drop-shadow-lg">Welcome to Premium!</h1>
        <p className="mb-3 text-xs text-gray-700 font-medium">Your payment was successful.<br/>You now have access to:</p>
        <ul className="mb-3 text-left space-y-1.5">
          {premiumFeatures.map((feature, idx) => (
            <li key={feature.name} className="flex items-center gap-1.5 bg-gradient-to-r from-pink-100 to-yellow-100 rounded-lg px-2.5 py-1 shadow-sm">
              <span className="inline-flex items-center justify-center bg-pink-200 rounded-full p-1"><feature.icon className="w-3.5 h-3.5 text-pink-500" /></span>
              <span className="text-gray-900 font-semibold text-xs">{feature.name}</span>
            </li>
          ))}
        </ul>
        {upgrading && <div className="mb-2 text-xs text-pink-600 font-semibold animate-pulse">Activating premium...</div>}
        {error && <div className="mb-2 text-xs text-red-600 font-semibold animate-shake">{error}</div>}
        <Button
          className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-extrabold py-2 px-4 rounded-full text-sm shadow-xl hover:scale-105 hover:shadow-2xl transition-all duration-200 mt-1"
          onClick={() => navigate('/?premium=activated')}
          disabled={upgrading || !upgradeSuccess}
        >
          Start Dripcheck Now
        </Button>
        <div className="mt-3 text-[10px] text-gray-400">Enjoy your premium experience! 🎉</div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
