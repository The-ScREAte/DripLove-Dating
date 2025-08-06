import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Eye, Heart } from 'lucide-react';

interface SwipeCounterProps {
  swipesUsedToday: number;
  swipeLimit: number;
  profileCompletion: number;
  isPremium: boolean;
}

const SwipeCounter: React.FC<SwipeCounterProps> = ({
  swipesUsedToday,
  swipeLimit,
  profileCompletion,
  isPremium
}) => {
  if (isPremium) return null; // Premium users don't have restrictions

  const remainingSwipes = swipeLimit - swipesUsedToday;
  const showWarning = swipesUsedToday >= 3 && profileCompletion < 70;
  const isRestricted = swipesUsedToday >= 5 && profileCompletion < 70;

  if (swipesUsedToday === 0) return null; // Don't show until user starts swiping

  return (
    <Card className="fixed top-20 left-4 right-4 z-40 bg-white/95 backdrop-blur-sm border shadow-lg mx-auto max-w-sm">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-pink-500" />
            <span className="text-sm font-medium text-gray-700">Daily Swipes</span>
          </div>
          <span className="text-sm font-bold text-gray-800">
            {swipesUsedToday}/{swipeLimit}
          </span>
        </div>
        
        <Progress value={(swipesUsedToday / swipeLimit) * 100} className="h-2 mb-2" />
        
        {showWarning && (
          <div className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
            isRestricted 
              ? 'bg-red-50 border border-red-200' 
              : 'bg-orange-50 border border-orange-200'
          }`}>
            <AlertTriangle className={`w-3 h-3 mt-0.5 flex-shrink-0 ${
              isRestricted ? 'text-red-500' : 'text-orange-500'
            }`} />
            <div>
              {isRestricted ? (
                <p className="text-red-700 font-medium">
                  Complete your profile to {profileCompletion}% to continue swiping
                </p>
              ) : (
                <p className="text-orange-700">
                  After {5 - swipesUsedToday} more swipes, you'll need 70% profile completion to continue
                </p>
              )}
            </div>
          </div>
        )}
        
        {!showWarning && (
          <p className="text-xs text-gray-500 text-center">
            {remainingSwipes} swipes remaining today
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default SwipeCounter;
