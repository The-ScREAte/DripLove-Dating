import React from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

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

  // Lifted to clear the floating pill nav. One shared formula for every
  // platform now (native app on iOS/Android, and a plain mobile browser,
  // which Capacitor itself reports as 'web' - a previous per-platform
  // branch here relied on Capacitor.getPlatform(), which only ever returns
  // 'ios'/'android' inside the actual native app shell, not a browser
  // running on an iOS/Android device. That meant anyone testing via mobile
  // Safari/Chrome silently got the OTHER branch's (smaller) offset, with no
  // visible relation to which one "should" apply - splitting a purely
  // visual position into platform branches was never buying anything here.
  // MainApp measures the real nav height via ResizeObserver and publishes
  // it as --app-bottom-nav-height (see MainApp.tsx), so this always clears
  // the actual nav at any screen size instead of estimating it.
  const bottomOffset = 'calc(var(--app-bottom-nav-height, 88px) + var(--dl-undo-lift, clamp(28px, 5vw, 38px)))';

  return (
  <div
    className="dl-under-popup fixed right-[clamp(16px,4vw,24px)] z-[100000] sm:absolute sm:right-[clamp(16px,4vw,24px)]"
    style={{ bottom: bottomOffset }}
  >
      <div className="relative">
        <Button variant="overlay" className="p-0 bg-black/35 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(244,114,182,0.35)] disabled:opacity-30"
          onClick={onReverse}
         
          disabled={!canReverse}
         
          style={{
            width: 'clamp(44px, 11vw, 48px)',
            height: 'clamp(44px, 11vw, 48px)',
            minWidth: 'clamp(44px, 11vw, 48px)',
            minHeight: 'clamp(44px, 11vw, 48px)',
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
          <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-pink-200 text-pink-900 text-[11px] font-semibold rounded-full shadow-[0_0_0_1.5px_rgba(0,0,0,0.35)] flex items-center justify-center">
            {reversesLeft}
          </div>
        )}
      </div>
    </div>
  );
};

export default SwipeButtons;
