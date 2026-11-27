import React from 'react';

/**
 * Shared loading states. Every one of these is wrapped in `dl-delayed`, so it only becomes
 * visible if loading takes longer than ~150ms - fast loads never flash a spinner, and the
 * background is already the app's dark surface so nothing flashes white either.
 */

const LogoMark: React.FC<{ className?: string }> = ({ className = 'w-14 h-14' }) => (
  <img
    src="/driplove-logo.webp"
    alt=""
    aria-hidden="true"
    className={`${className} mx-auto object-contain dl-pop`}
    onError={(e) => {
      const img = e.currentTarget;
      if (!img.src.endsWith('.png')) img.src = '/driplove-logo.png';
    }}
  />
);

/** Branded centered loader for a whole screen/route (fills its parent). */
export const BrandLoader: React.FC<{ fullScreen?: boolean; transparent?: boolean }> = ({ fullScreen = false, transparent = false }) => (
  <div
    className={`${fullScreen ? 'min-h-screen' : 'h-full min-h-[240px]'} w-full flex items-center justify-center ${transparent ? '' : 'bg-black'}`}
    role="status"
    aria-live="polite"
    aria-label="Loading"
  >
    <div className="dl-delayed flex flex-col items-center gap-4">
      <LogoMark />
      <div className="w-24 h-1 rounded-full dl-skeleton" />
    </div>
  </div>
);

/** Skeleton for a vertical list of rows (chats, notifications, matches). */
export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div className="w-full px-4 pt-4 space-y-3 dl-delayed" role="status" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <div className="dl-skeleton w-14 h-14 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="dl-skeleton h-3.5 w-2/5 rounded-md" />
          <div className="dl-skeleton h-3 w-4/5 rounded-md" />
        </div>
      </div>
    ))}
  </div>
);

/** Skeleton for a 2-column grid of photo cards (Liked Me, Circle). */
export const CardGridSkeleton: React.FC<{ cards?: number }> = ({ cards = 6 }) => (
  <div className="w-full px-3 pt-4 grid grid-cols-2 gap-3 dl-delayed" role="status" aria-label="Loading">
    {Array.from({ length: cards }).map((_, i) => (
      <div key={i} className="dl-skeleton aspect-[3/4] rounded-2xl" />
    ))}
  </div>
);
