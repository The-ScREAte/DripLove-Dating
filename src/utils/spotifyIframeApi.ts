// Loads Spotify's official Embed IFrame API once and resolves with the
// IFrameAPI object, so we can create a real player controller (play/pause,
// and a playback_update event to know if it's actually playing) instead of
// a dumb <iframe> we have no visibility or control over.
// Docs: https://developer.spotify.com/documentation/embeds/references/iframe-api

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (IFrameAPI: SpotifyIFrameAPI) => void;
    __spotifyIframeApiPromise?: Promise<SpotifyIFrameAPI>;
  }
}

export interface SpotifyEmbedController {
  play: () => void;
  pause: () => void;
  destroy: () => void;
  addListener: (event: 'ready' | 'playback_update', cb: (e: { data: { isPaused: boolean; isBuffering: boolean } }) => void) => void;
}

interface SpotifyIFrameAPI {
  createController: (
    element: HTMLElement,
    options: { uri: string; width?: string | number; height?: string | number },
    callback: (controller: SpotifyEmbedController) => void
  ) => void;
}

export const loadSpotifyIframeApi = (): Promise<SpotifyIFrameAPI> => {
  if (window.__spotifyIframeApiPromise) return window.__spotifyIframeApiPromise;

  window.__spotifyIframeApiPromise = new Promise((resolve) => {
    window.onSpotifyIframeApiReady = (IFrameAPI) => resolve(IFrameAPI);
    const script = document.createElement('script');
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    document.body.appendChild(script);
  });

  return window.__spotifyIframeApiPromise;
};

// Extracts a Spotify URI ("spotify:track:ID") from a share link like
// https://open.spotify.com/track/ID?si=...&utm_source=... - query params
// (si, utm_source, etc.) are ignored since they live after the path.
export const getSpotifyUri = (link: string): string | null => {
  try {
    const url = new URL(link);
    if (url.hostname.replace(/^www\./, '') !== 'open.spotify.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const [type, id] = parts;
    if (!['track', 'album', 'playlist', 'episode', 'show'].includes(type)) return null;
    return `spotify:${type}:${id}`;
  } catch {
    return null;
  }
};
