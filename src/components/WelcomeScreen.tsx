
import React from 'react';
import { Button } from '@/components/ui/button';

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onAdminAccess: () => void;
  onShowAbout: () => void;
  onShowTerms: () => void;
  onShowPrivacy: () => void;
}

const WelcomeScreen = ({ onGetStarted, onAdminAccess, onShowAbout, onShowTerms, onShowPrivacy }: WelcomeScreenProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex flex-col items-center justify-center text-white relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 left-10 w-20 h-20 bg-white rounded-full"></div>
        <div className="absolute top-32 right-20 w-16 h-16 bg-white rounded-full"></div>
        <div className="absolute bottom-20 left-20 w-12 h-12 bg-white rounded-full"></div>
        <div className="absolute bottom-32 right-32 w-24 h-24 bg-white rounded-full"></div>
      </div>
      
      {/* Main Content */}
      <div className="text-center z-10 px-4 max-w-md mx-auto">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <img 
            src="/driplove-logo.png" 
            alt="DripLove Logo" 
            className="h-56 w-auto"
          />
        </div>
        
        {/* Tagline */}
        <h2 className="text-2xl md:text-3xl font-bold mb-4 leading-tight">
          Where Hearts Connect Worldwide
        </h2>
        
        <p className="text-lg md:text-xl mb-8 opacity-90 leading-relaxed">
          Discover meaningful connections with people from all walks of life
        </p>
        
        {/* CTA Button */}
        <Button 
          onClick={onGetStarted}
          size="lg"
          className="bg-white text-purple-600 hover:bg-gray-100 font-semibold px-8 py-3 rounded-full text-lg shadow-lg transform hover:scale-105 transition-all duration-200 mb-6"
        >
          Get Started
        </Button>
        
        {/* About Us Link */}
        <div className="mb-8">
          <button 
            onClick={onShowAbout}
            className="text-sm text-white/80 hover:text-white underline transition-colors"
          >
            About Us
          </button>
        </div>
        
        {/* Admin Access */}
        <div className="mt-8">
          <button 
            onClick={onAdminAccess}
            className="text-sm text-white/70 hover:text-white underline transition-colors"
          >
          </button>
        </div>
      </div>
      
      {/* Footer */}
      <div className="absolute bottom-8 text-center text-white/60 text-sm w-full px-4">
        <p className="mb-3">Join thousands finding love across continents</p>
        <div className="flex justify-center space-x-4">
          <button 
            onClick={onShowTerms}
            className="text-white/70 hover:text-white underline transition-colors text-xs"
          >
            Terms of Service
          </button>
          <span className="text-white/50">•</span>
          <button 
            onClick={onShowPrivacy}
            className="text-white/70 hover:text-white underline transition-colors text-xs"
          >
            Privacy Policy
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
