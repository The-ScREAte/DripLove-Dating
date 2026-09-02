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
  // Nudged down slightly - it was sitting high enough to get covered by content
  // above it (the card's own bottom info/caption panel).
  //
  // clamp(), not Tailwind's sm: breakpoint - the old bottom-28/bottom-20 with a
  // matching sm: value was really just two fixed states that snapped at 640px,
  // not an actual scale-with-screen-size behavior (the "mobile" and "sm" values
  // were identical, so it never even visibly changed at that breakpoint). This
  // scales continuously with viewport width instead, same pattern the bottom
  // nav bar itself already uses.
  const bottomOffset = (isAndroid || isIOS)
    ? 'clamp(96px, 24vw, 112px)'
    : 'clamp(78px, 19vw, 86px)';

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
