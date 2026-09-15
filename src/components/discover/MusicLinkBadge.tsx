import React, { useState } from 'react';
import MusicPlayerModal from '../MusicPlayerModal';
import EqualizerBars from './EqualizerBars';

interface MusicLinkBadgeProps {
  link: string;
  label?: string;
  // 'circle' = the standalone circular badge in the compact preview row
  // (mirrors the Adinkra symbol badge). 'inline' = the small icon appended
  // inside an existing Favorites chip.
  variant?: 'circle' | 'inline';
}

// A tappable music-link indicator - static until tapped (the actual
// "now playing" pulse only happens inside MusicPlayerModal once playback
// is confirmed, since this badge itself has no way to know if the track
// is actually playing). Opens the in-app player on tap instead of
// navigating away.
const MusicLinkBadge = ({ link, label, variant = 'circle' }: MusicLinkBadgeProps) => {
  const [showPlayer, setShowPlayer] = useState(false);

  if (variant === 'inline') {
    return (
      <>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowPlayer(true); }}
          aria-label="Play shared music in-app"
          className="ml-0.5 inline-flex items-center text-pink-400 hover:text-pink-300 transition-colors"
        >
          <EqualizerBars />
        </button>
        {showPlayer && (
          <MusicPlayerModal link={link} label={label} onClose={() => setShowPlayer(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShowPlayer(true); }}
        title={label}
        aria-label="Play shared music in-app"
        className="flex items-center justify-center bg-pink-400/10 border border-pink-400/60 rounded-full w-6 h-6 shrink-0"
      >
        <EqualizerBars />
      </button>
      {showPlayer && (
        <MusicPlayerModal link={link} label={label} onClose={() => setShowPlayer(false)} />
      )}
    </>
  );
};

export default MusicLinkBadge;
