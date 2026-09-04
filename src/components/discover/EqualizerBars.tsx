import React from 'react';

interface EqualizerBarsProps {
  animate?: boolean;
  className?: string;
}

// Three-bar equalizer glyph used everywhere a music badge would otherwise
// show a 🎵 note - bars bounce (via the .eq-bar keyframes in index.css) only
// when `animate` is true (i.e. actually playing); otherwise they sit static
// at resting heights.
const EqualizerBars = ({ animate = false, className = '' }: EqualizerBarsProps) => (
  <span className={`flex items-end gap-[1.5px] h-2.5 ${className}`}>
    <span className={`${animate ? 'eq-bar' : ''} w-[2px] h-full bg-pink-400 rounded-full`} style={!animate ? { transform: 'scaleY(0.4)' } : undefined} />
    <span className={`${animate ? 'eq-bar' : ''} w-[2px] h-full bg-pink-400 rounded-full`} style={!animate ? { transform: 'scaleY(0.9)' } : undefined} />
    <span className={`${animate ? 'eq-bar' : ''} w-[2px] h-full bg-pink-400 rounded-full`} style={!animate ? { transform: 'scaleY(0.6)' } : undefined} />
  </span>
);

export default EqualizerBars;
