import React, { useEffect, useState } from 'react';
import { thumbnailUrlFor, isThumbnailKnownMissing, markThumbnailMissing } from '@/utils/photoThumbnails';

type ThumbnailImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** The full photo URL, exactly as stored. */
  src: string | null | undefined;
};

/**
 * <img> for small photo cards: loads the photo's ~400px thumbnail, and falls
 * back to the full photo if that photo has no thumbnail yet (uploaded before
 * thumbnails existed). Anything that isn't a profile photo URL (blob: previews,
 * other hosts) is shown as-is.
 */
const ThumbnailImage = ({ src, onError, decoding = 'async', loading = 'lazy', ...rest }: ThumbnailImageProps) => {
  const full = src || '';
  const thumb = thumbnailUrlFor(full);
  const pick = () => (thumb && !isThumbnailKnownMissing(thumb) ? thumb : full);
  const [current, setCurrent] = useState(pick);

  useEffect(() => {
    setCurrent(pick());
    // pick() only depends on these two
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, thumb]);

  if (!full) return null;

  return (
    <img
      {...rest}
      src={current}
      decoding={decoding}
      loading={loading}
      onError={(e) => {
        if (thumb && current === thumb) {
          markThumbnailMissing(thumb);
          setCurrent(full);
          return;
        }
        onError?.(e);
      }}
    />
  );
};

export default ThumbnailImage;
