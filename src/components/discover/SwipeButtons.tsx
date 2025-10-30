import React from 'react';
import { Button } from '@/components/ui/button';
import { Heart, X, Undo2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

interface SwipeButtonsProps {
  onPass: () => void;
  onReverse: () => void;
  onLike: () => void;
  canReverse: boolean;
  reversesLeft?: number;
  isPremium?: boolean;
}

const SwipeButtons: React.FC<SwipeButtonsProps> = ({
  onPass,
  onReverse,
  onLike,
  canReverse,
  reversesLeft,
  isPremium
}) => {
  const showCount = !isPremium && reversesLeft !== undefined && reversesLeft > 0;
  
  // Detect platform
  const platform = Capacitor.getPlatform();
  const isWeb = platform === 'web';
  const isIOS = platform === 'ios';
  
  // Adjust bottom position based on platform
  const bottomClass = isIOS ? 'bottom-24 sm:bottom-24' : isWeb ? 'bottom-16 sm:bottom-16' : 'bottom-16 sm:bottom-16';

  return (
  <div className={`fixed right-6 z-30 sm:absolute sm:right-6 ${bottomClass}`}>
      <div className="relative">
        <Button
          onClick={onReverse}
          variant="outline"
          disabled={!canReverse}
          className="rounded-full border-2 border-yellow-500 bg-yellow-500/20 hover:bg-yellow-500/30 disabled:opacity-30 backdrop-blur-sm shadow-lg hover:border-yellow-400 transition-all duration-200 w-8 h-8 sm:w-10 sm:h-8 min-w-8 min-h-8 sm:min-w-10 sm:min-h-8 p-0"
          aria-label="Undo last action"
        >
          <Undo2 className="w-4 h-4 sm:w-5 sm:h-4 text-yellow-500" />
        </Button>
        {showCount && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-500 text-black text-xs font-bold rounded-full flex items-center justify-center shadow-lg">
            {reversesLeft}
          </div>
        )}
      </div>
    </div>
  );
};

export default SwipeButtons;
