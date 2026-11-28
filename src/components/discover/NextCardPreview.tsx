import React from 'react';
import { SlideRenderer } from './SlideRenderer';

/**
 * The card waiting behind the one being swiped.
 *
 * It draws the photo with the SAME composition as the front card (SlideRenderer's ImageSlide: whole photo plus the
 * soft mirrored reflection), so when the front card flies away and the next one takes its place the photo does not
 * change size or shape - the old preview was a plain full-bleed crop, which made the next card visibly "pop" into
 * a different layout. While the card in front is held or dragged this one rests slightly smaller, blurred and
 * dimmed (nobody sees who's next before committing to the swipe); the moment a swipe goes through it grows to full
 * size and sharpens in step with the fly-off, so the hand-over is seamless.
 *
 * Only transform / filter / opacity change, all on their own layers.
 */
const REST_SCALE = 0.94;
const REST_RADIUS_PX = 26;

interface NextCardPreviewProps {
  name: { first: string; last: string };
  imageUrl: string | undefined;
  /** For profiles with no photos: the designed card they open on, drawn instead of a plain placeholder. */
  heroSlide?: unknown;
  blobUrls?: Record<string, string>;
  getOptimizedUrl: (url: string) => string;
  userBackgroundColor: string;
  /** The front card is flying away / waiting to be replaced: reveal this one. */
  revealed: boolean;
  /** Finger is down: no transitions, the card just stays put. */
  dragging: boolean;
  blurPx: number;
  darkOpacity: number;
  durationMs: number;
  /** Corner radius while resting behind the front card / once revealed (CSS border-radius values). */
  restRadius?: string;
  revealedRadius?: string;
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export const NextCardPreview: React.FC<NextCardPreviewProps> = React.memo(({
  name,
  imageUrl,
  heroSlide,
  blobUrls,
  getOptimizedUrl,
  userBackgroundColor,
  revealed,
  dragging,
  blurPx,
  darkOpacity,
  durationMs,
  restRadius = `${REST_RADIUS_PX}px`,
  revealedRadius = '0px',
}) => {
  const slide = React.useMemo(
    () => (heroSlide && !imageUrl ? heroSlide : { type: imageUrl ? ('image' as const) : ('placeholder' as const), content: imageUrl ?? '', index: 0 }),
    [imageUrl, heroSlide]
  );
  return (
    <div
      data-next-card-preview
      className="absolute inset-0 overflow-hidden bg-black"
      style={{
        transform: `scale(${revealed ? 1 : REST_SCALE})`,
        borderRadius: revealed ? revealedRadius : restRadius,
        // No transition: the card in front is replaced within a few frames now (the falling copy is separate), so the
        // preview has to already be at full size when the live card takes its place, not still growing.
        transition: 'none',
        transformOrigin: 'center center',
        willChange: 'transform',
      }}
    >
      <div
        className="absolute inset-0"
        // The blur clears in one step (not animated): animating a blur over a full-screen photo re-draws it every frame,
        // the most expensive thing in a swipe on mid-range Android. The falling card covers the change anyway.
        style={{ filter: blurPx > 0 ? `blur(${blurPx}px)` : 'none' }}
      >
        <SlideRenderer
          slide={slide as never}
          userBackgroundColor={userBackgroundColor}
          matchFirstName={name.first}
          matchLastName={name.last}
          preloadedBlobImages={blobUrls}
          getOptimizedUrl={getOptimizedUrl}
        />
      </div>
      {/* dark tint over the blur, fading out in step with it */}
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: darkOpacity }}
      />
      {/* same bottom shading the front card's caption puts under the name, so the hand-over doesn't brighten the foot of the photo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 18%, rgba(0,0,0,0.25) 34%, rgba(0,0,0,0) 52%)' }}
      />
    </div>
  );
});
NextCardPreview.displayName = 'NextCardPreview';
