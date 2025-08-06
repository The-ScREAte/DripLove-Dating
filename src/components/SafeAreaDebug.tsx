import React, { useEffect, useState } from 'react';
import { getSafeAreaInsets, supportsSafeAreaInsets, hasNotch } from '@/utils/safeAreaUtils';

interface SafeAreaDebugProps {
  className?: string;
}

export const SafeAreaDebug: React.FC<SafeAreaDebugProps> = ({ className = '' }) => {
  const [insets, setInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [supportsEnv, setSupportsEnv] = useState(false);
  const [hasNotchDetected, setHasNotchDetected] = useState(false);

  useEffect(() => {
    const updateInsets = () => {
      setInsets(getSafeAreaInsets());
      setSupportsEnv(supportsSafeAreaInsets());
      setHasNotchDetected(hasNotch());
    };

    updateInsets();

    // Update on orientation change
    window.addEventListener('orientationchange', updateInsets);
    window.addEventListener('resize', updateInsets);

    return () => {
      window.removeEventListener('orientationchange', updateInsets);
      window.removeEventListener('resize', updateInsets);
    };
  }, []);

  return (
    <div className={`fixed top-4 left-4 bg-black/80 text-white p-3 rounded-lg text-xs z-[9999] max-w-xs ${className}`}>
      <div className="font-bold mb-2">Safe Area Debug</div>
      <div>Top: {insets.top}px</div>
      <div>Right: {insets.right}px</div>
      <div>Bottom: {insets.bottom}px</div>
      <div>Left: {insets.left}px</div>
      <div className="mt-2 text-xs opacity-75">
        env() support: {supportsEnv ? '✅' : '❌'}
      </div>
      <div className="text-xs opacity-75">
        Has notch: {hasNotchDetected ? '✅' : '❌'}
      </div>
      <div className="text-xs opacity-75">
        UA: {navigator.userAgent.includes('iPhone') ? 'iOS' : 
             navigator.userAgent.includes('Android') ? 'Android' : 'Other'}
      </div>
    </div>
  );
};

export default SafeAreaDebug;
