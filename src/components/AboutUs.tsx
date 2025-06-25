
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface AboutUsProps {
  onBack: () => void;
}

const AboutUs = ({ onBack }: AboutUsProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex flex-col items-center justify-center text-white p-4">
      {/* Header */}
      <div className="w-full max-w-2xl mb-8">
        <Button 
          onClick={onBack}
          variant="ghost"
          className="text-white hover:bg-white/10 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-2xl text-center space-y-6">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <img 
            src="/lovable-uploads/0e9bd84b-0f71-493b-8c1f-1a2883e5109d.png" 
            alt="AfroVibe Logo" 
            className="h-24 w-auto"
          />
        </div>

        <h1 className="text-4xl font-bold mb-6">About AfroVibe</h1>
        
        <div className="space-y-4 text-lg leading-relaxed">
          <p>
            AfroVibe is a premier dating platform created by The ScREAte Company Ltd, designed specifically for the vibrant African diaspora community worldwide. Our mission is to create meaningful connections that transcend borders, bringing together hearts from across continents who share common values, culture, and aspirations. We understand the unique experiences of Africans living globally and have built a platform that celebrates our rich heritage while fostering genuine relationships.
          </p>
          
          <p>
            Whether you're seeking a life partner, meaningful friendships, or cultural connections, AfroVibe provides a safe and inclusive space where authentic relationships flourish. Our advanced matching system considers not just preferences, but cultural compatibility, shared interests, and relationship goals to help you find your perfect match. Join thousands of African singles who have already discovered love, friendship, and community through AfroVibe.
          </p>
        </div>

        {/* Support Email */}
        <div className="mt-12 pt-8 border-t border-white/20">
          <p className="text-sm opacity-80">
            Need help or have questions? Reach out to our support team:
          </p>
          <a 
            href="mailto:support@afrovibe.com" 
            className="text-white font-semibold hover:underline text-lg"
          >
            support@afrovibe.com
          </a>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;
