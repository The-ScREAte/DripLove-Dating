
import React from 'react';
import { Button } from '@/components/ui/button';
import { Heart, Sparkles, Users, MessageCircle } from 'lucide-react';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

const WelcomeScreen = ({ onGetStarted }: WelcomeScreenProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4">
      <div className="text-center max-w-md mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-white/20 rounded-full mb-6">
            <Heart className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">
            LoveConnect
          </h1>
          <p className="text-xl text-white/90 mb-8">
            Find your perfect match and start your love story today
          </p>
        </div>
        
        <div className="grid grid-cols-1 gap-4 mb-8">
          <div className="flex items-center justify-center space-x-3 text-white/90">
            <Users className="w-6 h-6" />
            <span>Connect with like-minded people</span>
          </div>
          <div className="flex items-center justify-center space-x-3 text-white/90">
            <MessageCircle className="w-6 h-6" />
            <span>Start meaningful conversations</span>
          </div>
          <div className="flex items-center justify-center space-x-3 text-white/90">
            <Sparkles className="w-6 h-6" />
            <span>Discover your perfect match</span>
          </div>
        </div>
        
        <Button 
          onClick={onGetStarted}
          className="w-full bg-white text-purple-600 hover:bg-gray-100 font-semibold py-4 rounded-lg text-lg transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
        >
          Get Started
        </Button>
      </div>
    </div>
  );
};

export default WelcomeScreen;
