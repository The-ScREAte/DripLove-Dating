import React from 'react';
import { isAndroidPlatform } from '@/utils/platformUtils';
import { optimizeImageUrl } from '@/utils/imageOptimizer';

interface DominantColorImageBgProps {
  imageUrl?: string;
  children?: React.ReactNode;
}

const DominantColorImageBg: React.FC<DominantColorImageBgProps> = ({ imageUrl, children }) => {
  // Use lightweight static background color instead of expensive pixel scanning
  const edgeColor = '#f6f6f6';
  // ⭐ ANDROID OPTIMIZATION: Reduce blur for Android (CPU intensive on Android WebView)
  const blurAmount = isAndroidPlatform() ? '3px' : '6px';
  
  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      {/* Solid color overlay fills all space */}
      <div
        className="absolute inset-0"
        style={{ background: edgeColor, zIndex: 0 }}
        aria-hidden="true"
      />
      {/* Low-res thumbnail as background (cheap to decode). We intentionally request a tiny optimized image and lightly blur it. */}
      {imageUrl && (
        <img
          src={optimizeImageUrl(imageUrl, { width: 40, quality: 20 })}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            // ⭐ ANDROID FIX: Lighter blur for Android performance
            filter: `blur(${blurAmount}) brightness(1.04)`,
            zIndex: 1,
            objectFit: 'cover',
            width: '100%',
            height: '100%',
            transform: 'scale(1.4)',
            imageRendering: 'auto',
            // ⭐ ANDROID FIX: Force GPU acceleration
            willChange: isAndroidPlatform() ? 'transform' : 'auto'
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
