import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeCountryCode } from '@/utils/countryCode';
import { calculateAge } from '@/utils/dateUtils';
import { createDeterministicShuffle } from '@/utils/discoverCache';
import { isAndroidPlatform } from '@/utils/platformUtils';
import { CurrentUser, PotentialMatch } from '@/types';
import { normalizeCountryCodeList } from './discoverFeedUtils';
import { AdData, AdsRow, MatchOrAd } from './discoverTypes';

const isAd = (match: MatchOrAd): match is AdData => (match as AdData).isAd === true;

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
  currentIndex,
  setPotentialMatches,
  setCurrentIndex,
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

  const stableShuffledAds = useMemo(() => {
    if (ads.length === 0) return [];
    const today = new Date().toISOString().split('T')[0];
    const adSeed = `${currentUser?.id}_ads_${today}`;
    return createDeterministicShuffle(ads, adSeed);
  }, [ads, currentUser?.id]);

  const injectAds = useCallback((matches: PotentialMatch[]): MatchOrAd[] => {
    if (stableShuffledAds.length === 0) {
      return matches;
    }

    const result: MatchOrAd[] = [];
    let adIndex = 0;
    const adFrequency = premiumActive ? 15 : 7;

    for (let i = 0; i < matches.length; i++) {
      result.push(matches[i]);

      if ((i + 1) % adFrequency === 0) {
        let selectedAd = stableShuffledAds[adIndex % stableShuffledAds.length];
        const last = result[result.length - 1];
        if (last && isAd(last) && selectedAd?.id && last.id === selectedAd.id) {
          adIndex++;
          selectedAd = stableShuffledAds[adIndex % stableShuffledAds.length];
        }
        result.push(selectedAd);
        adIndex++;
      }
    }

    return result;
  }, [stableShuffledAds, premiumActive]);

  useEffect(() => {
    if (!adsLoaded) return;
    if (stableShuffledAds.length === 0) return;
    if (potentialMatches.length === 0) return;
    if (potentialMatches.some((m) => isAd(m))) return;

    const current = potentialMatches[currentIndex];
    if (!current || isAd(current)) return;

    const profilesOnly = potentialMatches.filter((m): m is PotentialMatch => !isAd(m));
    const withAds = injectAds(profilesOnly);

    if (withAds.length === profilesOnly.length) return;

    const nextIndex = withAds.findIndex((m) => !isAd(m) && m.id === current.id);
    if (nextIndex < 0) return;

    const trimmed = withAds.slice(nextIndex);

    if (trimmed.length === potentialMatches.length) {
      let same = true;
      for (let i = 0; i < trimmed.length; i++) {
        const a = trimmed[i];
        const b = potentialMatches[i];
        const aKey = isAd(a) ? `ad:${a.id}` : a.id;
        const bKey = isAd(b) ? `ad:${b.id}` : b.id;
        if (aKey !== bKey) {
          same = false;
          break;
        }
      }
      if (same) return;
    }

    setPotentialMatches(trimmed);
    setCurrentIndex(0);
  }, [adsLoaded, stableShuffledAds, potentialMatches, currentIndex, injectAds, setPotentialMatches, setCurrentIndex]);

  return { adsLoaded, injectAds };
};
