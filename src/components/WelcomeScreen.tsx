import React from 'react';
import { Button } from '@/components/ui/button';

interface WelcomeScreenProps {
  onLogin: () => void;
  onAbout: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onLogin, onAbout, onTerms, onPrivacy }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex flex-col items-center justify-start pt-32 text-center relative">
      {/* Background Bubbles */}
      <div className="absolute inset-0">
        <div className="bg-purple-400 opacity-30 rounded-full w-20 h-20 absolute top-10 left-20"></div>
        <div className="bg-pink-400 opacity-30 rounded-full w-48 h-48 absolute bottom-32 right-20"></div>
        <div className="bg-purple-300 opacity-20 rounded-full w-12 h-12 absolute top-32 right-32"></div>
        <div className="bg-pink-300 opacity-20 rounded-full w-32 h-32 absolute bottom-40 left-10"></div>
        <div className="bg-purple-200 opacity-25 rounded-full w-24 h-24 absolute top-5 right-5"></div>
      </div>

      {/* Logo and Tagline */}
      <div className="mb-12 flex flex-col items-center relative z-10 mt-12">
        <img src="/driplove-logo.png" alt="DripLove Logo" className="w-50 h-40 mb-4" />
        <p className="text-lg text-white">Feel the Spark. Drip in Love</p>
        <p className="text-sm text-white/80">Real Vibes. Real People. Real Love.</p>
      </div>

      {/* Login Button */}
      <div className="space-y-4 mb-16 relative z-10">
        <Button
          onClick={onLogin}
          className="w-48 bg-white text-purple-600 font-semibold py-3 rounded-full shadow-lg hover:bg-gray-100"
        >
          Get Started
        </Button>
      </div>

      {/* About Us Link */}
      <div className="relative z-10 mb-auto">
        <button
          onClick={onAbout}
          className="text-white text-sm font-bold hover:text-white/80"
        >
          About DripLove
        </button>
      </div>

      {/* Footer Section */}
      <div className="absolute bottom-10 flex flex-col items-center space-y-4 relative z-10">
        <div className="text-sm text-white/80">
          Join thousands finding love across continents
        </div>
        <div className="flex justify-center space-x-4 text-sm">
          <button
            onClick={onTerms}
            className="text-white font-bold hover:text-white/80"
          >
            Terms of Service
          </button>
          <button
            onClick={onPrivacy}
            className="text-white font-bold hover:text-white/80"
          >
            Privacy Policy
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
