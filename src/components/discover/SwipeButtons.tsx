import React from 'react';
import { Button } from '@/components/ui/button';
import { Heart, X, Undo2 } from 'lucide-react';

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
  
  return (
    <div className="absolute bottom-4 right-4 z-30">
      <div className="relative">
        <Button
          onClick={onReverse}
          variant="outline"
          disabled={!canReverse}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-yellow-500 bg-yellow-500/20 hover:bg-yellow-500/30 disabled:opacity-30 backdrop-blur-sm shadow-lg hover:border-yellow-400 transition-all duration-200"
          aria-label="Undo last action"
        >
          <Undo2 className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500" />
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
