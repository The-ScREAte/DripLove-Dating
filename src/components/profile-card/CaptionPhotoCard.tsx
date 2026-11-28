import React from 'react';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import { truncateCaption } from '@/utils/profileFormat';
import { SOFT_SURFACE } from './ProfileSection';
import type { CaptionedPhoto } from './types';

/**
 * A profile photo with its preset label and caption. Photo on the left, text on
 * the right, so the caption is always fully readable and the card stays compact
 * (the details beneath it stay within reach on small phones).
 */
export const CaptionPhotoCard: React.FC<{ photo: CaptionedPhoto }> = ({ photo }) => (
  <figure className={`flex items-stretch gap-3 p-2.5 ${SOFT_SURFACE}`}>
    <img
      src={getDetailImageUrl(photo.url)}
      alt=""
      width={112}
      height={144}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="h-36 w-28 shrink-0 rounded-[14px] bg-neutral-900 object-cover"
    />
    <figcaption className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 pr-1">
      {photo.label && (
        <span className="break-words text-[11.5px] font-semibold uppercase leading-tight tracking-[0.12em] text-[rgba(249,168,212,0.82)]">
          {photo.label}
        </span>
      )}
      <p dir="auto" className="break-words text-[15px] leading-snug text-white/[0.88]">
        {truncateCaption(photo.caption)}
      </p>
    </figcaption>
  </figure>
);
