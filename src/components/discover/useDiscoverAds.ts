import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeCountryCode } from '@/utils/countryCode';
import { calculateAge } from '@/utils/dateUtils';
import { createDeterministicShuffle } from '@/utils/discoverCache';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import { isAndroidPlatform } from '@/utils/platformUtils';
import { CurrentUser, PotentialMatch } from '@/types';
import { normalizeCountryCodeList } from './discoverFeedUtils';
import { AdData, AdsRow, MatchOrAd } from './discoverTypes';

const isAd = (match: MatchOrAd): match is AdData => (match as AdData).isAd === true;

interface AdCadenceState {
  totalSwipes: number;
  nextAdAt: number;
  adSpinIndex: number;
}

// Persists the swipe-cadence counters across app closes/reopens - without
// this, a cold start would reset the countdown to the next ad every time,
// even mid-way through it. Scoped per user per day so it naturally rolls
// over daily, same as the ad shuffle seed below.
const getCadenceStorageKey = (userId: string) => `discoverAdCadence_v1_${userId}_${new Date().toISOString().split('T')[0]}`;

const readCadenceFromStorage = (userId: string): AdCadenceState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getCadenceStorageKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as AdCadenceState;
  } catch {
    return null;
  }
};

const writeCadenceToStorage = (userId: string, state: AdCadenceState) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getCadenceStorageKey(userId), JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
};

interface UseDiscoverAdsParams {
  currentUser: CurrentUser;
  premiumActive: boolean;
  potentialMatches: MatchOrAd[];
  currentIndex: number;
  setPotentialMatches: Dispatch<SetStateAction<MatchOrAd[]>>;
  setCurrentIndex: Dispatch<SetStateAction<number>>;
}

export const useDiscoverAds = ({
  currentUser,
  premiumActive,
  potentialMatches,
  // Deck position is always potentialMatches[0] (moveToNext removes the
  // swiped item), so this hook doesn't need currentIndex - kept in the
  // params for API stability with callers.
  currentIndex: _currentIndex,
  setPotentialMatches,
  setCurrentIndex: _setCurrentIndex,
}: UseDiscoverAdsParams) => {
  const [ads, setAds] = useState<AdData[]>([]);
  const [adsLoaded, setAdsLoaded] = useState(false);

  const userCountryCode = useMemo(() => {
    return normalizeCountryCode(currentUser?.country_code || currentUser?.country || '');
  }, [currentUser?.country_code, currentUser?.country]);

  const userGender = (currentUser?.gender || '').toLowerCase();
  const userAge = currentUser?.date_of_birth ? calculateAge(currentUser.date_of_birth) : null;

  useEffect(() => {
    const delay = isAndroidPlatform() ? 800 : 300;
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('ads')
          .select('id, name, about, image_url, video_url, link, link_as, media_type, target_countries, placement, impressions, estimated_impressions_max, campaign_ends_at, target_age_min, target_age_max, target_genders')
          // Without this, a newly-submitted advertiser ad (which starts
          // is_active:false specifically to wait for admin approval) would
          // show up on Discover immediately, bypassing the approval step
          // entirely. Previously harmless since only admins created ads
          // directly (already trusted, always active); no longer true now
          // that advertisers can submit their own.
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const rows: AdsRow[] = Array.isArray(data) ? (data as unknown as AdsRow[]) : [];
        const filteredAds = rows.filter((ad) => {
          const targetCountries = normalizeCountryCodeList(ad.target_countries);
          if (targetCountries.length > 0 && !(Boolean(userCountryCode) && targetCountries.includes(userCountryCode))) {
            return false;
          }
          // Gender targeting - empty means "everyone", same convention as
          // target_countries. Genders are stored capitalized ("Male") from
          // the advertiser's picker; the viewer's own profile stores
          // lowercase ("male"), so this compares case-insensitively.
          const targetGenders = (ad.target_genders || []).map((g) => g.toLowerCase());
          if (targetGenders.length > 0 && !(userGender && targetGenders.includes(userGender))) {
            return false;
          }
          // Age targeting - only enforced on whichever bound was actually set.
          if (ad.target_age_min != null && (userAge == null || userAge < ad.target_age_min)) {
            return false;
          }
          if (ad.target_age_max != null && (userAge == null || userAge > ad.target_age_max)) {
            return false;
          }
          // Campaign pacing: the ONLY thing that stops a campaign is having
          // delivered the impressions its budget actually paid for - the
          // advertiser's chosen day count is a soft target, not a hard
          // cutoff. If their audience is narrow, the campaign just keeps
          // running past that many days until it delivers (or, deliberately,
          // never checks campaign_ends_at here at all) - they already paid
          // for the impressions, not for a calendar window.
          if (ad.estimated_impressions_max != null && (ad.impressions ?? 0) >= ad.estimated_impressions_max) {
            return false;
          }
          return true;
        });

        const adsWithMarker: AdData[] = filteredAds.map((ad) => ({
          id: ad.id,
          name: ad.name,
          about: ad.about,
          image_url: ad.image_url,
          video_url: ad.video_url,
          placement: ad.placement,
          media_type: ad.media_type,
          link: ad.link,
          link_as: ad.link_as,
          isAd: true as const,
        }));

        // Placement weighting: a featured/premium campaign is meant to show
        // up more often than a standard one. Simplest way to express that
        // without restructuring the existing rotation logic below - repeat
        // the ad's entry proportionally so it naturally gets picked more
        // often by the same round-robin index math.
        const PLACEMENT_WEIGHT: Record<string, number> = { standard: 1, featured: 2, premium: 3 };
        const weightedAds = adsWithMarker.flatMap((ad) =>
          Array(PLACEMENT_WEIGHT[ad.placement || 'standard'] || 1).fill(ad)
        );

        setAds(weightedAds);
        setAdsLoaded(true);
      } catch {
        setAdsLoaded(true);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [userCountryCode, userGender, userAge]);

  // Warm the browser's cache for every active ad's image as soon as the ads
  // list itself loads - well before any of them are actually due to be
  // inserted into the swipe deck (which the cadence logic below can delay
  // for many real swipes). Without this, an ad's photo only started
  // fetching the moment its card was mounted, which is what showed up as
  // "the ad's image visibly loads in" right when it appeared. Same raw URL
  // AdCard itself requests (getDetailImageUrl), so the URL - and thus the
  // browser's cache entry - matches exactly; a handful of ads means this is
  // a handful of cheap image fetches, not a real background-loading burden.
  useEffect(() => {
    if (ads.length === 0) return;
    const uniqueImageUrls = Array.from(new Set(
      ads
        .filter((ad) => ad.media_type !== 'video' && ad.image_url)
        .map((ad) => getDetailImageUrl(ad.image_url))
    ));
    const preloadImages = uniqueImageUrls.map((url) => {
      const img = new Image();
      img.src = url;
      return img;
    });
    return () => {
      // Let any still-in-flight request finish naturally (aborting would
      // just make the browser refetch it later); this only drops our JS
      // reference so it can be garbage-collected once the request settles.
      preloadImages.length = 0;
    };
  }, [ads]);

  const stableShuffledAds = useMemo(() => {
    if (ads.length === 0) return [];
    const today = new Date().toISOString().split('T')[0];
    const adSeed = `${currentUser?.id}_ads_${today}`;
    return createDeterministicShuffle(ads, adSeed);
  }, [ads, currentUser?.id]);

  // Ads are no longer pre-mixed into a batch at fetch time - the reactive
  // swipe-cadence effect below owns all insertion, including the very first
  // ad of a session. Kept as an identity passthrough so existing callers
  // that wrap their initial deck in injectAds(...) don't need to change.
  const injectAds = useCallback((matches: PotentialMatch[]): MatchOrAd[] => matches, []);

  // How many genuinely distinct ad creatives are in rotation (the weighted
  // array repeats featured/premium placements, so dedupe by id first).
  const uniqueAdCount = useMemo(
    () => new Set(stableShuffledAds.map((ad) => ad.id)).size,
    [stableShuffledAds]
  );

  // ⭐ Smart, randomized, swipe-anchored ad cadence.
  //
  // The deck's invariant is "the card currently on screen is always
  // potentialMatches[0]" (moveToNext removes the swiped item by id). Free
  // users see their first ad after 5 real swipes, premium users after 8 -
  // then every ad after that rolls a fresh random gap instead of a fixed
  // repeating interval, so it doesn't feel mechanical (e.g. 5, then +4 = 9,
  // then +5 = 14, ...). Premium's gap range sits above free's so premium
  // consistently sees ads less often, matching what they're paying for.
  // The random gap is also "smart" about how many distinct ads are actually
  // available: with only 1-2 creatives in rotation the gap is padded wider
  // so the same ad doesn't resurface too soon; with a healthy pool of ads
  // the gap can run tighter.
  const swipeCadence = useMemo(
    () => (premiumActive
      ? { first: 8, min: 6, max: 12 }
      : { first: 5, min: 4, max: 8 }),
    [premiumActive]
  );

  const rollNextGap = useCallback(() => {
    const scarcityPadding = Math.max(0, 3 - uniqueAdCount) * (premiumActive ? 2 : 1);
    const span = swipeCadence.max - swipeCadence.min;
    return swipeCadence.min + Math.floor(Math.random() * (span + 1)) + scarcityPadding;
  }, [swipeCadence, uniqueAdCount, premiumActive]);

  // Cumulative real (non-ad) swipes this session, and the cumulative count
  // at which the next ad is due. Only genuine swipes at the front of the
  // deck ever move either of these - a background fetch appending profiles
  // to the tail can't touch them, so the cadence can't drift the way the
  // old array-position-based approach could.
  const totalSwipesRef = useRef(0);
  const nextAdAtRef = useRef(swipeCadence.first);
  const prevFrontKeyRef = useRef<string | null>(null);
  const prevFrontWasAdRef = useRef(false);
  const adSpinIndexRef = useRef(0);

  // Restore the cadence counters for this user/day from storage on mount
  // (survives an app close/reopen instead of restarting the countdown), or
  // start fresh at swipeCadence.first if there's nothing saved yet / it's a
  // new day. prevFrontKeyRef intentionally always starts null - it's just
  // "have we seen a front card yet in this component lifetime", not part of
  // the persisted cadence itself.
  useEffect(() => {
    const saved = currentUser?.id ? readCadenceFromStorage(currentUser.id) : null;
    totalSwipesRef.current = saved?.totalSwipes ?? 0;
    nextAdAtRef.current = saved?.nextAdAt ?? swipeCadence.first;
    adSpinIndexRef.current = saved?.adSpinIndex ?? 0;
    prevFrontKeyRef.current = null;
    prevFrontWasAdRef.current = false;
  }, [currentUser?.id, swipeCadence.first]);

  useEffect(() => {
    if (!adsLoaded || stableShuffledAds.length === 0) return;
    if (potentialMatches.length === 0) {
      prevFrontKeyRef.current = null;
      prevFrontWasAdRef.current = false;
      return;
    }

    const front = potentialMatches[0];
    const frontKey = isAd(front) ? `ad:${front.id}` : front.id;
    const persistCadence = () => {
      if (!currentUser?.id) return;
      writeCadenceToStorage(currentUser.id, {
        totalSwipes: totalSwipesRef.current,
        nextAdAt: nextAdAtRef.current,
        adSpinIndex: adSpinIndexRef.current,
      });
    };

    let cadenceChanged = false;
    if (prevFrontKeyRef.current !== null && prevFrontKeyRef.current !== frontKey) {
      // The previous front card is gone - it was swiped.
      if (prevFrontWasAdRef.current) {
        // An ad was just shown and swiped away - roll a fresh random gap
        // for the next one, anchored to the total swipes so far.
        nextAdAtRef.current = totalSwipesRef.current + rollNextGap();
      } else {
        totalSwipesRef.current += 1;
      }
      cadenceChanged = true;
    }
    prevFrontKeyRef.current = frontKey;
    prevFrontWasAdRef.current = isAd(front);

    if (cadenceChanged) persistCadence();

    if (isAd(front)) return; // an ad is already up next/current, nothing to insert
    if (totalSwipesRef.current < nextAdAtRef.current) return;
    if (potentialMatches.length > 1 && isAd(potentialMatches[1])) return; // already queued

    let selectedAd = stableShuffledAds[adSpinIndexRef.current % stableShuffledAds.length];
    adSpinIndexRef.current += 1;
    persistCadence();

    setPotentialMatches(prev => {
      if (prev.length === 0 || isAd(prev[0])) return prev;
      if (prev[0].id !== frontKey) return prev; // stale - deck moved on already
      if (prev.length > 1 && isAd(prev[1])) return prev;
      const next = prev.slice();
      next.splice(1, 0, selectedAd);
      return next;
    });
  }, [adsLoaded, stableShuffledAds, potentialMatches, rollNextGap, setPotentialMatches]);

  return { adsLoaded, injectAds };
};
