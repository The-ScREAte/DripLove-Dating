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
}
