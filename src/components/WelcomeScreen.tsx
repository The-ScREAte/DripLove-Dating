
import React from 'react';
import { Button } from '@/components/ui/button';
import { Heart, Sparkles, Users, MessageCircle, Shield } from 'lucide-react';

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onAdminAccess?: () => void;
}

const WelcomeScreen = ({ onGetStarted, onAdminAccess }: WelcomeScreenProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4">
      <div className="text-center max-w-md mx-auto">
        {/* Admin Access Button */}
        {onAdminAccess && (
          <div className="absolute top-4 right-4">
            <Button
              onClick={onAdminAccess}
              variant="ghost"
              className="text-white hover:bg-white/20"
            >
              <Shield className="w-4 h-4 mr-2" />
              Admin
            </Button>
          </div>
        )}

        <div className="mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-white/20 rounded-full mb-6">
            <img 
              src="/lovable-uploads/ef9367e7-bcc2-40e6-8a31-b92465c0e20b.png" 
              alt="AfroVibe Logo" 
              className="w-16 h-16"
            />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">
            AfroVibe
          </h1>
          <p className="text-xl text-white/90 mb-8">
            Connect with your vibe and find your perfect match
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
            <span>Discover your perfect vibe</span>
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
