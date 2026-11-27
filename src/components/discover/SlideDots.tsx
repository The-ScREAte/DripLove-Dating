import React from 'react';
import './slideDots.css';

/**
 * The slide indicator on a profile card: a small centred pill of dots. The current slide stretches
 * into a brand-gradient capsule; the rest are quiet dots. With many slides only a window of 7 is
 * drawn and the dots at the edges shrink, so the pill stays tidy at any length (Instagram-style).
 */
const WINDOW = 7;

export const SlideDots: React.FC<{ total: number; current: number; className?: string; style?: React.CSSProperties }> = ({ total, current, className = '', style }) => {
  if (total <= 1) return null;
  const cur = Math.min(Math.max(current, 0), total - 1);
  const size = Math.min(total, WINDOW);
  const start = total <= WINDOW ? 0 : Math.min(Math.max(cur - Math.floor(WINDOW / 2), 0), total - WINDOW);
  const items = Array.from({ length: size }, (_, i) => start + i);
  return (
    <div className={`sd-pill ${className}`.trim()} style={style} role="img" aria-label={`Slide ${cur + 1} of ${total}`}>
      {items.map((idx, i) => {
        // dots at the window edges shrink when more slides exist beyond them
        const edge = (i === 0 && start > 0) || (i === size - 1 && start + size < total);
        return <span key={idx} className="sd-dot" data-active={idx === cur ? 'true' : undefined} data-edge={edge ? 'true' : undefined} />;
      })}
    </div>
  );
};

export default SlideDots;
