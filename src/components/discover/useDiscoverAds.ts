import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeCountryCode } from '@/utils/countryCode';
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

  useEffect(() => {
    const delay = isAndroidPlatform() ? 800 : 300;
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('ads')
          .select('id, name, about, image_url, video_url, link, link_as, media_type, target_countries')
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
          if (targetCountries.length === 0) return true;
          return Boolean(userCountryCode) && targetCountries.includes(userCountryCode);
        });

        const adsWithMarker: AdData[] = filteredAds.map((ad) => ({
          id: ad.id,
          name: ad.name,
          about: ad.about,
          image_url: ad.image_url,
          video_url: ad.video_url,
          media_type: ad.media_type,
          link: ad.link,
          link_as: ad.link_as,
          isAd: true as const,
        }));

        setAds(adsWithMarker);
        setAdsLoaded(true);
      } catch {
        setAdsLoaded(true);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [userCountryCode]);

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
