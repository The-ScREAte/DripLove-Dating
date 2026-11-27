import React, { useState } from 'react';
import './circle.css';

/**
 * The tiny avatar cluster on LOCKED Circle tiles (an advertisement for Premium).
 *
 * Up to 3 bubbles: a real member's moderated main photo where one is available (heavily blurred
 * with CSS so nobody is identifiable, `alt=""`, lazy, async-decoded), otherwise a brand-hue
 * silhouette. When the circle has more than 3 members a 4th bubble shows "+". Photos load lazily
 * and never block the tile: until a photo arrives (or if it fails) the silhouette shows.
 * Nothing here carries a name or id.
 */
export const TeaserAvatars = ({
  hues,
  size = 18,
  photos = [],
  more = false,
  className = '',
}: {
  hues: number[];
  size?: number;
  /** URLs of real members' moderated main photos (at most 3 used). */
  photos?: string[];
  /** Show the "+" bubble (the circle has more than 3 members). */
  more?: boolean;
  className?: string;
}) => {
  const [failed, setFailed] = useState<Record<string, true>>({});
  const bubbles = hues.slice(0, 3);
  return (
    <span className={`ci-avatars ${className}`} aria-hidden="true" style={{ ['--ci-av' as string]: `${size}px` }}>
      {bubbles.map((h, i) => {
        const url = photos[i];
        const showPhoto = !!url && !failed[url];
        return (
          <span
            key={i}
            className={`ci-av${showPhoto ? ' ci-av-photo' : ''}`}
            style={{ ['--h' as string]: h, ['--h2' as string]: (h + 40) % 360, zIndex: bubbles.length + 1 - i }}
          >
            {showPhoto && (
              <img
                src={url}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={() => setFailed((f) => ({ ...f, [url]: true }))}
              />
            )}
          </span>
        );
      })}
      {more && <span className="ci-av ci-av-more" style={{ zIndex: bubbles.length + 2 }}>+</span>}
    </span>
  );
};
