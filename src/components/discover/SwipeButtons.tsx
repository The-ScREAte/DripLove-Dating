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
  
  // Adjust bottom position based on platform — lifted to clear the floating pill nav
  const bottomClass = isAndroid
    ? 'bottom-32 sm:bottom-32'
    : isIOS
    ? 'bottom-32 sm:bottom-32'
    : 'bottom-24 sm:bottom-24';

  return (
  <div className={`fixed right-6 z-30 sm:absolute sm:right-6 ${bottomClass}`}>
      <div className="relative">
        <Button
          onClick={onReverse}
          variant="outline"
          disabled={!canReverse}
          className="rounded-full border-2 border-white/70 bg-white/20 hover:bg-white/35 disabled:opacity-30 backdrop-blur-md shadow-lg hover:border-white transition-all duration-200 w-9 h-9 sm:w-10 sm:h-10 min-w-9 min-h-9 sm:min-w-10 sm:min-h-10 p-0"
          aria-label="Undo last action"
        >
          <RotateCcw className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-white" strokeWidth={2.5} />
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
