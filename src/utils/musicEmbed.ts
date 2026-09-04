// Turns a favorite's raw share link (YouTube/SoundCloud/Apple Music) into an
// embeddable player URL, so a tap plays it inside the app instead of opening
// the link in an external app/tab. Spotify links are handled separately via
// the Spotify Embed IFrame API (see spotifyIframeApi.ts) since that's the
// only provider we can get real play/pause state and control from.
// No autoplay params here on purpose - every provider should only start
// playing once the user taps that provider's own play button.

export const getMusicEmbedUrl = (link: string): string | null => {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const videoId = url.searchParams.get('v');
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      const shorts = url.pathname.match(/^\/shorts\/([^/]+)/);
      if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
      return null;
    }
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host === 'soundcloud.com') {
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(link)}&color=%23ec4899&visual=false`;
    }

    if (host === 'music.apple.com') {
      return `https://embed.music.apple.com${url.pathname}${url.search}`;
    }

    return null;
  } catch {
    return null;
  }
};
