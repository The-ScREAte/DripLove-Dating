import React from 'react';
import { Button } from '@/components/ui/button';
import { Heart, X, Undo2 } from 'lucide-react';

interface SwipeButtonsProps {
  onPass: () => void;
  onReverse: () => void;
  onLike: () => void;
  canReverse: boolean;
}

const SwipeButtons: React.FC<SwipeButtonsProps> = ({
  onPass,
  onReverse,
  onLike,
  canReverse
}) => {
  return (
    <div className="absolute bottom-8 left-0 right-0 flex justify-center space-x-6 px-6 z-30">
      <Button
        onClick={onPass}
        variant="outline"
        className="w-16 h-16 rounded-full border-2 border-red-500 bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm shadow-lg hover:border-red-400 transition-all duration-200"
        aria-label="Pass on this match"
      >
        <X className="w-7 h-7 text-red-500" />
      </Button>

      <Button
        onClick={onReverse}
        variant="outline"
        disabled={!canReverse}
        className="w-16 h-16 rounded-full border-2 border-yellow-500 bg-yellow-500/20 hover:bg-yellow-500/30 disabled:opacity-30 backdrop-blur-sm shadow-lg hover:border-yellow-400 transition-all duration-200"
        aria-label="Undo last action"
      >
        <Undo2 className="w-7 h-7 text-yellow-500" />
      </Button>

      <Button
        onClick={onLike}
        variant="outline"
        className="w-16 h-16 rounded-full border-2 border-green-500 bg-green-500/20 hover:bg-green-500/30 backdrop-blur-sm shadow-lg hover:border-green-400 transition-all duration-200"
        aria-label="Like this match"
      >
        <Heart className="w-7 h-7 text-green-500" />
      </Button>
    </div>
  );
};

export default SwipeButtons;
