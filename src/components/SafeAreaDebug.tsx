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
    <div
      className={`pointer-events-none fixed bottom-2 left-2 z-[1000] rounded-md border bg-background/80 backdrop-blur px-3 py-2 text-xs text-foreground shadow ${className}`}
      role="status"
      aria-live="polite"
    >
      <div>safe-area: t {insets.top}px r {insets.right}px b {insets.bottom}px l {insets.left}px</div>
      <div>env(): {supportsEnv ? 'yes' : 'no'} • notch: {hasNotchDetected ? 'yes' : 'no'}</div>
    </div>
  );
};

export default SafeAreaDebug;
