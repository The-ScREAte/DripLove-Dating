import React from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

interface SwipeButtonsProps {
  onReverse: () => void;
  canReverse: boolean;
  reversesLeft?: number;
  isPremium?: boolean;
}

const SwipeButtons: React.FC<SwipeButtonsProps> = ({
  onReverse,
  canReverse,
  reversesLeft,
  isPremium
}) => {
  const showCount = !isPremium && reversesLeft !== undefined && reversesLeft > 0;

  // Detect platform
  const platform = Capacitor.getPlatform();
  const isIOS = platform === 'ios';
  const isAndroid = platform === 'android';

  // Adjust bottom position based on platform — lifted to clear the floating pill nav.
  //
  // Previously a vw-based clamp() guess at the nav's height - that caps out
  // (stops scaling) past ~467px viewport width, while the real nav bar keeps
  // growing on wider/tablet viewports, so the button ended up sitting under
  // the nav on medium screens. MainApp measures the real nav height via
  // ResizeObserver and publishes it as --app-bottom-nav-height (see
  // MainApp.tsx), so this now always clears the actual nav at any screen
  // size instead of estimating it. The extra gap is nudged up a touch from
  // before per feedback that it sat too close to the nav even on phones.
  const bottomOffset = (isAndroid || isIOS)
    ? 'calc(var(--app-bottom-nav-height, 88px) + clamp(22px, 4.2vw, 32px))'
    : 'calc(var(--app-bottom-nav-height, 64px) + clamp(16px, 3.2vw, 24px))';

  return (
  <div
    className="fixed right-[clamp(16px,4vw,24px)] z-30 sm:absolute sm:right-[clamp(16px,4vw,24px)]"
    style={{ bottom: bottomOffset }}
  >
      <div className="relative">
        <Button
          onClick={onReverse}
          variant="outline"
          disabled={!canReverse}
          className="rounded-full border-2 border-white/70 bg-white/20 hover:bg-white/35 disabled:opacity-30 backdrop-blur-md shadow-lg hover:border-white transition-all duration-200 p-0"
          style={{
            width: 'clamp(34px, 9vw, 40px)',
            height: 'clamp(34px, 9vw, 40px)',
            minWidth: 'clamp(34px, 9vw, 40px)',
            minHeight: 'clamp(34px, 9vw, 40px)',
          }}
          aria-label="Undo last action"
        >
          <RotateCcw
            className="text-white shrink-0"
            style={{ width: 'clamp(16px, 4.5vw, 18px)', height: 'clamp(16px, 4.5vw, 18px)' }}
            strokeWidth={2.5}
          />
        </Button>
        {showCount && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-white text-pink-600 text-xs font-bold rounded-full flex items-center justify-center shadow-lg border border-pink-200">
            {reversesLeft}
          </div>
        )}
      </div>
    </div>
  );
};

export default SwipeButtons;
