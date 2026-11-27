import React from 'react';
import type { SlideContent } from '../discover/MatchCardHelpers';
import type { Starter } from '@/utils/icebreaker';
import { toTitleCase } from '../profile-card/profileCardUtils';
import IcebreakerButton from './IcebreakerButton';
import type { IcebreakerTarget } from './store';

interface MatchLike {
  id?: string;
  first_name?: string | null;
  images?: string[] | null;
}

/** Who a Break the ice button on this profile would write to (opener ideas come from the card deck). */
export function icebreakerTargetFor(match: MatchLike, slides: SlideContent[] | undefined, photoUrl?: string | null): IcebreakerTarget | null {
  if (!match.id) return null;
  const starterCard = (slides || []).find((s) => s.type === 'card' && s.card?.kind === 'starter');
  const starters = starterCard?.card?.data.starters as Starter[] | undefined;
  return {
    id: match.id,
    name: toTitleCase(match.first_name || '') || '',
    photoUrl: photoUrl ?? match.images?.[0] ?? null,
    starters,
  };
}

/** The compact pill for a photo caption (ProfileCaption `action` slot); null when it must not show. */
export function icebreakerPillFor(
  match: MatchLike,
  slides: SlideContent[] | undefined,
  opts: { viewerId?: string | null; photoUrl?: string | null; currentSlide?: number } = {}
): React.ReactNode {
  const target = icebreakerTargetFor(match, slides, opts.photoUrl);
  if (!target || (opts.viewerId && opts.viewerId === target.id)) return null;
  // The Break the ice / welcome card has its own big button: don't show the pill on top of it.
  const cur = slides && typeof opts.currentSlide === 'number' ? slides[opts.currentSlide] : undefined;
  if (cur?.type === 'card' && (cur.card?.kind === 'starter' || cur.card?.kind === 'welcome')) return null;
  return <IcebreakerButton variant="pill" target={target} />;
}
