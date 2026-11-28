import React from 'react';
import { getDetailImageUrl } from '@/utils/imageOptimizer';

interface DominantColorImageBgProps {
  imageUrl?: string;
  children?: React.ReactNode;
}

const DominantColorImageBg: React.FC<DominantColorImageBgProps> = ({ imageUrl, children }) => {
  // Use lightweight static background color instead of expensive pixel scanning
  const edgeColor = '#f6f6f6';
  // Same blur on every platform so the backdrop looks identical on Android and iOS.
  // It is a static filter on a still image (rasterised once on its own layer), so
  // the stronger blur costs nothing per frame.
  const blurAmount = '6px';
  
  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      {/* Solid color overlay fills all space */}
      <div
        className="absolute inset-0"
        style={{ background: edgeColor, zIndex: 0 }}
        aria-hidden="true"
      />
      {/* Blurred backdrop, reusing the same raw URL the main photo already
          loads with (Supabase Image Transformations is off - see
          getDetailImageUrl) - the browser serves this second <img> from its
          own cache instead of a new network request, and the blur filter
          below hides the extra resolution either way. */}
      {imageUrl && (
        <img
          src={getDetailImageUrl(imageUrl)}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            filter: `blur(${blurAmount}) brightness(1.04)`,
            zIndex: 1,
            objectFit: 'cover',
            width: '100%',
            height: '100%',
            transform: 'scale(1.4)',
            imageRendering: 'auto',
            // Own compositor layer so the blurred image is painted once, not per frame.
            willChange: 'transform'
          }}
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      )}
      <div className="absolute inset-0 z-10">
        {children}
      </div>
    </div>
  );
};

export default React.memo(DominantColorImageBg);
