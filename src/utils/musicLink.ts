import { getMusicEmbedUrl } from '@/utils/musicEmbed';
import { getSpotifyUri } from '@/utils/spotifyIframeApi';

/** True when the in-app player can play this share link (Spotify, Apple Music, YouTube, SoundCloud), https only. */
export const isPlayableMusicLink = (link: string): boolean => {
  const trimmed = link.trim();
  if (!/^https:\/\//i.test(trimmed)) return false;
  return !!getSpotifyUri(trimmed) || !!getMusicEmbedUrl(trimmed);
};
