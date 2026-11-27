import React from 'react';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import { truncateCaption } from '@/utils/profileFormat';
import type { CaptionedPhoto } from './types';

/**
 * A profile photo with its preset label and caption. Photo on the left, text on
 * the right, so the caption is always fully readable and the card stays compact
 * (the details beneath it stay within reach on small phones).
 */
export const CaptionPhotoCard: React.FC<{ photo: CaptionedPhoto }> = ({ photo }) => (
  <figure className="flex items-stretch gap-3 rounded-2xl border border-brand/20 bg-white/[0.03] p-2.5">
    <img
      src={getDetailImageUrl(photo.url)}
      alt=""
      width={112}
      height={144}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="h-36 w-28 shrink-0 rounded-xl bg-neutral-900 object-cover"
    />
    <figcaption className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 pr-1">
      {photo.label && (
        <span className="break-words text-xs font-semibold uppercase leading-tight tracking-wider text-brand-ink">
          {photo.label}
        </span>
      )}
      <p dir="auto" className="break-words text-[15px] leading-snug text-white">
        {truncateCaption(photo.caption)}
      </p>
    </figcaption>
  </figure>
);
