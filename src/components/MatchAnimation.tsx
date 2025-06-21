
import React, { useEffect, useState } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface MatchAnimationProps {
  currentUserName: string;
  matchedUserName: string;
  matchedUserImage?: string;
  onClose: () => void;
  onStartChat: () => void;
}

const MatchAnimation = ({ 
  currentUserName, 
  matchedUserName, 
  matchedUserImage,
  onClose, 
  onStartChat 
}: MatchAnimationProps) => {
  const [showAnimation, setShowAnimation] = useState(false);

  useEffect(() => {
    // Trigger animation after component mounts
    const timer = setTimeout(() => setShowAnimation(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <Card className={`max-w-md w-full transform transition-all duration-500 ${showAnimation ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
        <CardContent className="p-8 text-center">
          {/* Hearts Animation */}
          <div className="relative mb-6">
            <div className="flex justify-center items-center space-x-4">
              <div className={`transform transition-all duration-1000 delay-300 ${showAnimation ? 'scale-110 rotate-12' : 'scale-100'}`}>
                <Heart className="w-12 h-12 text-pink-500 fill-pink-500" />
              </div>
              <div className={`transform transition-all duration-1000 delay-500 ${showAnimation ? 'scale-125' : 'scale-100'}`}>
                <Heart className="w-16 h-16 text-red-500 fill-red-500" />
              </div>
              <div className={`transform transition-all duration-1000 delay-300 ${showAnimation ? 'scale-110 -rotate-12' : 'scale-100'}`}>
                <Heart className="w-12 h-12 text-pink-500 fill-pink-500" />
              </div>
            </div>
            
            {/* Floating hearts */}
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`absolute w-4 h-4 text-pink-400 transform transition-all duration-2000 delay-${i * 200} ${
                  showAnimation ? 'opacity-0 -translate-y-20' : 'opacity-100'
                }`}
                style={{
                  left: `${20 + i * 12}%`,
                  top: '50%',
                }}
              >
                <Heart className="w-full h-full fill-current" />
              </div>
            ))}
          </div>

          {/* Match Text */}
          <div className={`mb-6 transform transition-all duration-700 delay-700 ${showAnimation ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <h1 className="text-3xl font-bold text-pink-600 mb-2">It's a Match! 🎉</h1>
            <p className="text-gray-600 text-lg">
              You and <span className="font-semibold text-pink-600">{matchedUserName}</span> liked each other!
            </p>
          </div>

          {/* Profile Image */}
          {matchedUserImage && (
            <div className={`mb-6 flex justify-center transform transition-all duration-700 delay-900 ${showAnimation ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-pink-200">
                <img
                  src={matchedUserImage}
                  alt={matchedUserName}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className={`space-y-3 transform transition-all duration-700 delay-1100 ${showAnimation ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <Button 
              onClick={onStartChat}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3"
            >
              <MessageCircle className="w-5 h-5 mr-2" />
              Start Chatting
            </Button>
            <Button 
              onClick={onClose}
              variant="outline"
              className="w-full"
            >
              Keep Swiping
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MatchAnimation;
