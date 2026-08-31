import { PotentialMatch } from '@/types';

export interface AdData {
  id: string;
  image_url: string;
  video_url?: string | null;
  media_type?: string | null;
  name: string;
  about: string;
  link: string | null;
  link_as: string | null;
  target_countries?: string[];
  placement?: 'standard' | 'featured' | 'premium' | null;
  isAd: true;
}

export type MatchOrAd = PotentialMatch | AdData;

export interface AdsRow {
  id: string;
  name: string;
  about: string;
  image_url: string;
  video_url: string | null;
  link: string | null;
  link_as: string | null;
  media_type: string | null;
  target_countries: unknown;
  placement: 'standard' | 'featured' | 'premium' | null;
  impressions: number | null;
  estimated_impressions_max: number | null;
  campaign_ends_at: string | null;
  target_age_min: number | null;
  target_age_max: number | null;
  target_genders: string[] | null;
}
