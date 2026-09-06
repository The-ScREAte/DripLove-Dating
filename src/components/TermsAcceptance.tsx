import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Heart, Shield, Users, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import HoppingLogo from '@/components/HoppingLogo';
import { preloadPricingConfig } from '@/hooks/usePricingConfig';
import { discoverCache, calculateAge, createDeterministicShuffle } from '@/utils/discoverCache';
import { normalizeCountryCode } from '@/utils/countryCode';
import { getStratifiedBatches } from '@/utils/stratifiedSampling';
import { locationService } from '@/services/locationService';

const TermsOfService = lazy(() => import('./TermsOfService'));
const PrivacyPolicy = lazy(() => import('./PrivacyPolicy'));

interface TermsAcceptanceProps {
  user: any;
  onAccept: () => void;
}

const TermsAcceptance = ({ user, onAccept }: TermsAcceptanceProps) => {
  const { t } = useTranslation();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const { toast } = useToast();

  // Preload app data AND profiles in background while user views terms
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    const preloadInBackground = () => {
      if (cancelled) return;
    
      // Mark user as authenticated for instant app load
      try {
        sessionStorage.setItem('driplove_user_session', 'authenticated');
      } catch {}

      // Preload app data without blocking first paint
      preloadPricingConfig(user.id);
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(() => {});

      // CRITICAL: Preload discover profiles in background for instant app load
      preloadDiscoverProfiles(user.id);
    };

    // Defer heavy background preloading to idle time to keep this page snappy.
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as Window & { requestIdleCallback: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback(
        preloadInBackground,
        { timeout: 1200 }
      );
    } else {
      timeoutId = globalThis.setTimeout(preloadInBackground, 150) as unknown as number;
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
    };
  }, [user?.id]);

  // Background profile preloading - runs while user reads terms
  const preloadDiscoverProfiles = async (userId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Fetch user preferences and subscription together
      const [{ data: currentUserData }, { data: subscriptionData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('max_distance, distance_preference, country, country_code, min_age, max_age, preference, unlocked_countries, latitude, longitude')
          .eq('id', userId)
          .single(),
        supabase
          .from('user_subscriptions')
          .select('plan_name, status, expires_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      if (!currentUserData) return;

      // Check premium entitlement from subscription (cancelled stays premium until expires_at)
      const entitledByStatus = subscriptionData?.status === 'active' || subscriptionData?.status === 'cancelled';
      const notExpired = !subscriptionData?.expires_at || new Date(subscriptionData.expires_at) > new Date();
      const isPremium = subscriptionData?.plan_name === 'premium' && entitledByStatus && notExpired;

      // CRITICAL: Include premium status in cache key for proper isolation
      const cacheKey = `${userId}_${today}_${isPremium ? 'premium' : 'free'}`;
      
      if (discoverCache.has(cacheKey)) {
        return;
      }

      // Get exclusion lists
      const [
        { data: likedUsers },
        { data: blockedUsers },
        { data: recentPasses }
      ] = await Promise.all([
        supabase.from('likes').select('liked_id').eq('liker_id', userId),
        supabase.from('blocks').select('blocked_id, blocker_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
        supabase.from('passes').select('passed_id').match({ passer_id: userId }).gte('passed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // 30 days
      ]);

      const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
      const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
      const passedUserIds = recentPasses?.map(p => p.passed_id) || [];
      const excludedIds = [...likedUserIds, ...blockedUserIds, ...passedUserIds, userId];

      const userMaxDistanceRaw = currentUserData?.max_distance || currentUserData?.distance_preference || 50;
      const userMaxDistanceUncapped = Number(userMaxDistanceRaw);
      const safeUserMaxDistanceUncapped = Number.isFinite(userMaxDistanceUncapped) && userMaxDistanceUncapped > 0 ? userMaxDistanceUncapped : 50;

      // Free users capped at 500km
      const FREE_USER_MAX_DISTANCE = 500;
      const safeUserMaxDistance = isPremium
        ? safeUserMaxDistanceUncapped
        : Math.min(safeUserMaxDistanceUncapped, FREE_USER_MAX_DISTANCE);

      const allowedGenders = currentUserData?.preference === 'male' ? ['male'] : 
                            currentUserData?.preference === 'female' ? ['female'] : 
                            ['male', 'female', 'other'];

      const baseCountryCode = (() => {
        const cc = normalizeCountryCode(String(currentUserData?.country_code || ''));
        const cn = normalizeCountryCode(String(currentUserData?.country || ''));
        if (cc && cn && cc !== cn) return cn;
        return cc || cn;
      })();

      const unlockedCountries = Array.isArray(currentUserData?.unlocked_countries) ? currentUserData.unlocked_countries : [];

      const allowedCountryCodes = Array.from(
        new Set([
          ...(baseCountryCode ? [baseCountryCode] : []),
          ...(isPremium ? unlockedCountries.filter(Boolean) : []),
        ])
      );

      // Get location-based matches
      const locationMatches = await locationService.getLocationBasedMatches(userId, safeUserMaxDistance);

      const distanceMap: { [key: string]: number } = {};
      const locationProfileIds = locationMatches
        .filter((m) => {
          // FREE users must have a local country (fail closed)
          if (!baseCountryCode) return isPremium;
          // FREE users: local country only; PREMIUM: allow local + unlocked
          const matchCC = normalizeCountryCode(String(m.country_code || ''));
          if (!matchCC) return false;
          if (!isPremium) return matchCC === baseCountryCode;
          return allowedCountryCodes.includes(matchCC);
        })
        .map((match) => {
          distanceMap[match.profile_id] = match.distance_km;
          return match.profile_id;
        });

      // Fetch profiles
      let filteredProfiles: any[] = [];
      if (locationProfileIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols, created_at')
          .in('id', locationProfileIds)
          .in('country_code', allowedCountryCodes)
          .not('id', 'in', `(${excludedIds.join(',')})`)
          .in('gender', allowedGenders)
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .limit(100);

        filteredProfiles = profiles || [];
      }

      // Apply age filtering
      const userMinAge = currentUserData?.min_age || 18;
      const userMaxAge = currentUserData?.max_age || 99;
      
      filteredProfiles = filteredProfiles.filter(profile => {
        if (!profile.date_of_birth) return false;
        const age = calculateAge(profile.date_of_birth);
        return age >= userMinAge && age <= userMaxAge;
      });

      // Add distance to profiles
      const profilesWithImages = filteredProfiles.map(profile => ({
        ...profile,
        images: [],
        distance: distanceMap[profile.id]
      }));

      // Apply stratified sampling for fair distribution
      const shuffleSeed = `${userId}_${today}`;
      const shuffled = getStratifiedBatches(profilesWithImages, 15, 4, shuffleSeed);

      // Preload first 6 profile images
      const firstSix = shuffled.slice(0, 6);
      const firstSixIds = firstSix.map(p => p.id);
      
      const imageMap: { [key: string]: string[] } = {};
      
      if (firstSixIds.length > 0) {
        const { data: imageRows } = await supabase
          .from('user_images')
          .select('user_id, image_url, image_order')
          .in('user_id', firstSixIds)
          .eq('is_approved', true)
          .order('user_id', { ascending: true })
          .order('image_order', { ascending: true });

        if (imageRows) {
          const byUser: Record<string, string[]> = {};
          for (const row of imageRows) {
            if (!byUser[row.user_id]) byUser[row.user_id] = [];
            byUser[row.user_id].push(row.image_url);
          }

          firstSix.forEach((profile, index) => {
            const imgs = byUser[profile.id] || [];
            if (imgs.length === 0) return;

            let maxCount = 1;
            if (index === 0) maxCount = 3;
            else if (index === 1) maxCount = 2;

            imageMap[profile.id] = imgs.slice(0, maxCount);
          });
        }
      }

      // Cache the results
      discoverCache.set(cacheKey, {
        potentialMatches: shuffled,
        userImages: imageMap,
        userDistances: distanceMap,
        currentIndex: 0,
        timestamp: Date.now()
      });

      // Preloaded profiles successfully
    } catch (error) {
      console.error('❌ Profile preload error:', error);
      // Don't block the flow if preloading fails
    }
  };

  const handleAccept = async () => {
    if (!termsAccepted) {
      toast({
        title: "Please accept terms",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    // Update DB and navigate immediately - don't wait for toast
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      // Schedule the 20-minute delayed love notification (fire-and-forget)
      // This notification says: "You will find love—no matter how long it takes. Stay assured. 💕💕"
      try {
        supabase.functions.invoke('send-signup-welcome', {
          body: { userId: user.id, delayMinutes: 20 }
        }).catch(err => console.error('Failed to schedule delayed notification:', err));
      } catch (error) {
        console.error('Failed to invoke signup welcome function:', error);
      }

      // ANDROID FIX: Force session update to trigger proper state refresh
      sessionStorage.setItem('driplove_user_session', 'authenticated');
      sessionStorage.removeItem('driplove_current_view');
      
      // Call onAccept to update parent state
      onAccept();
      
      // ANDROID FIX: Force a hard navigation after brief delay to ensure state propagates
      // This fixes the issue where Android doesn't reload after terms acceptance
      setTimeout(() => {
        // Double-check if we're still on terms page (not already navigated)
        const currentPath = window.location.pathname;
        if (currentPath === '/' || currentPath.includes('terms')) {
          // Force reload to main app - this ensures Android properly loads the app
          window.location.reload();
        }
      }, 300);
    } catch (error: any) {
      console.error('Terms acceptance error:', error);
      setLoading(false);
      toast({
        title: "Error",
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className="terms-container fixed inset-0 z-[10000] bg-gradient-to-br from-pink-300 via-pink-200 to-fuchsia-300 overflow-y-auto overscroll-y-contain pointer-events-auto"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 12px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 12px)',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      <div
        className="w-full max-w-md mx-auto flex items-center justify-center py-2"
        style={{
          minHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)'
        }}
      >
      <Card className="relative w-full bg-white/95 backdrop-blur-sm shadow-2xl border border-rose-100 rounded-2xl pointer-events-auto">
        <CardHeader className="text-center pb-2 pt-5">
          <div className="mx-auto w-12 h-12 mb-2">
            <img 
              src="/driplove-logo.webp"
              loading="lazy"
              decoding="async" 
              alt="DripLove" 
              className="w-full h-full object-contain"
            />
          </div>
          <CardTitle className="text-lg font-bold text-gray-900 mb-0.5">
            Welcome to DripLove! 💕
          </CardTitle>
          <CardDescription className="text-sm text-gray-600">
            Let's keep things safe and fun for everyone
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 px-4 pb-4">
          {/* Key Points */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 bg-pink-50 rounded-lg border border-pink-100">
              <div className="w-5 h-5 bg-pink-200 rounded-full flex items-center justify-center flex-shrink-0">
                <Heart className="w-2.5 h-2.5 text-pink-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 text-xs">Be Respectful</h4>
                <p className="text-[10px] text-gray-600">Treat everyone with kindness</p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg border border-purple-100">
              <div className="w-5 h-5 bg-purple-200 rounded-full flex items-center justify-center flex-shrink-0">
                <Shield className="w-2.5 h-2.5 text-purple-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 text-xs">Stay Safe</h4>
                <p className="text-[10px] text-gray-600">Meet in public, protect your privacy</p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
              <div className="w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0">
                <Users className="w-2.5 h-2.5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 text-xs">Be Authentic</h4>
                <p className="text-[10px] text-gray-600">Use real photos and honest info</p>
              </div>
            </div>
          </div>

          {/* Document Links */}
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              onClick={() => setShowTerms(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-pink-100 hover:bg-pink-200 text-pink-700 rounded-full text-[11px] font-medium transition-colors border border-pink-200"
            >
              <FileText className="w-2.5 h-2.5" />
              Terms
              <ExternalLink className="w-2 h-2" />
            </button>
            <button
              onClick={() => setShowPrivacy(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-full text-[11px] font-medium transition-colors border border-purple-200"
            >
              <Shield className="w-2.5 h-2.5" />
              Privacy
              <ExternalLink className="w-2 h-2" />
            </button>
          </div>

          {/* Acceptance Checkbox */}
          <div className="rounded-lg p-3 border border-pink-200 bg-white/80">
            <label
              htmlFor="terms-acceptance"
              className="mx-auto max-w-sm flex items-center justify-center gap-2 text-center cursor-pointer"
            >
              <Checkbox
                id="terms-acceptance"
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                className="h-3.5 w-3.5 min-h-3.5 min-w-3.5 p-0 shrink-0 rounded-full border-gray-400 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500"
              />
              <span className="text-sm text-gray-900 leading-snug">
                I agree to the Terms & Privacy Policy, and I'm 18+
              </span>
            </label>
          </div>

          {/* Action Button */}
          <Button
            onClick={handleAccept}
            disabled={loading || !termsAccepted}
            className="w-full h-10 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold text-sm rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {loading ? "Processing..." : "Let's Go! 🚀"}
          </Button>
        </CardContent>
      </Card>
      </div>

      {/* Terms of Service Dialog */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogTitle className="sr-only">Terms of Service</DialogTitle>
          <ScrollArea className="h-[80vh] pr-4">
            <Suspense
              fallback={
                <div className="h-[60vh] flex items-center justify-center">
                  <HoppingLogo size={56} />
                </div>
              }
            >
              <div className="pb-6">
                <TermsOfService onBack={() => setShowTerms(false)} />
              </div>
            </Suspense>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Privacy Policy Dialog */}
      <Dialog open={showPrivacy} onOpenChange={setShowPrivacy}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogTitle className="sr-only">Privacy Policy</DialogTitle>
          <ScrollArea className="h-[80vh] pr-4">
            <Suspense
              fallback={
                <div className="h-[60vh] flex items-center justify-center">
                  <HoppingLogo size={56} />
                </div>
              }
            >
              <div className="pb-6">
                <PrivacyPolicy onBack={() => setShowPrivacy(false)} />
              </div>
            </Suspense>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TermsAcceptance;
