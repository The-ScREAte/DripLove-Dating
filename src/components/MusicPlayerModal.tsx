import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';
import { getMusicEmbedUrl } from '@/utils/musicEmbed';
import { getSpotifyUri, loadSpotifyIframeApi, type SpotifyEmbedController } from '@/utils/spotifyIframeApi';
import EqualizerBars from './discover/EqualizerBars';

interface MusicPlayerModalProps {
  link: string;
  label?: string;
  onClose: () => void;
}

// In-app music playback: Spotify links get the real Spotify Embed IFrame API
// (spotifyIframeApi.ts) so we know the true play/pause state - the pink
// "now playing" pulse only lights up once the user has actually pressed
// Spotify's own play button, and goes dark again on pause. Other providers
// (YouTube/SoundCloud/Apple Music) fall back to a plain embed with no
// autoplay - still click-to-play, just without state feedback.
const MusicPlayerModal = ({ link, label, onClose }: MusicPlayerModalProps) => {
  const spotifyUri = getSpotifyUri(link);
  const embedUrl = spotifyUri ? null : getMusicEmbedUrl(link);
  const spotifyHostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!spotifyUri || !spotifyHostRef.current) return;
    let cancelled = false;

    loadSpotifyIframeApi().then((IFrameAPI) => {
      if (cancelled || !spotifyHostRef.current) return;
      IFrameAPI.createController(
        spotifyHostRef.current,
        { uri: spotifyUri, width: '100%', height: 152 },
        (controller) => {
          if (cancelled) { controller.destroy(); return; }
          controllerRef.current = controller;
          controller.addListener('playback_update', (e) => {
            setIsPlaying(!e.data.isPaused);
          });
        }
      );
    });

    return () => {
      cancelled = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [spotifyUri]);

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-black border border-pink-500/40 rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-pink-500/20">
          <span className="text-xs font-medium text-white/85 truncate flex items-center gap-1.5">
            <EqualizerBars animate={isPlaying} />
            {label || 'Now Playing'}
          </span>
          <button
            onClick={onClose}
            aria-label="Close player"
            className="text-white/70 hover:text-white p-1 rounded-full hover:bg-white/10 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {spotifyUri ? (
          <div ref={spotifyHostRef} className="w-full" style={{ minHeight: 152 }} />
        ) : embedUrl ? (
          <iframe
            src={embedUrl}
            title="Music player"
            className="w-full border-0"
            style={{ height: 152 }}
            allow="encrypted-media; clipboard-write"
            loading="lazy"
          />
        ) : (
          <div className="p-4 text-center space-y-2">
            <p className="text-xs text-gray-400">This link can't be embedded for in-app playback.</p>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-pink-400 hover:text-pink-300"
            >
              Open link <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default MusicPlayerModal;
