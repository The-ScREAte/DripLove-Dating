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
  const bottomOffset = 'calc(var(--app-bottom-nav-height, 88px) + clamp(28px, 5vw, 38px))';

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
