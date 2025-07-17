
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Heart, Globe, Users, Mail } from 'lucide-react';

interface AboutUsProps {
  onBack: () => void;
}

const AboutUs = ({ onBack }: AboutUsProps) => {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="w-full bg-white border-b p-4">
        <Button 
          onClick={onBack}
          variant="ghost"
          className="text-gray-700 hover:bg-gray-100 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <img 
              src="/driplove-logo.png" 
              alt="DripLove Logo" 
              className="h-32 w-auto mx-auto mb-4"
            />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Where Hearts Connect Worldwide</h1>
          </div>

          {/* Main Description */}
          <div className="space-y-6 text-gray-700 leading-relaxed mb-12">
            <p className="text-lg">
              DripLove is more than just a dating platform – it's a vibrant community where hearts connect across continents. Born from the vision of bringing together people from diverse backgrounds, we create meaningful connections that transcend geographical boundaries. Whether you're in New York, London, Tokyo, or anywhere in between, DripLove creates meaningful connections worldwide.
            </p>
            
            <p className="text-lg">
              Our mission is to foster authentic relationships built on genuine compatibility and shared values. We believe that love knows no borders, and through our carefully crafted matching system, we help you discover someone who not only captures your heart but also understands your journey. At DripLove, every swipe brings you closer to finding your perfect match within our beautiful, diverse global community.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="text-center p-6 bg-pink-50 rounded-lg">
              <Heart className="w-12 h-12 text-pink-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Authentic Connections</h3>
              <p className="text-gray-600">Find meaningful relationships based on shared values and cultural understanding</p>
            </div>

            <div className="text-center p-6 bg-purple-50 rounded-lg">
              <Users className="w-12 h-12 text-purple-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Diverse Community</h3>
              <p className="text-gray-600">Connect with singles from all walks of life across the globe</p>
            </div>

            <div className="text-center p-6 bg-indigo-50 rounded-lg">
              <Globe className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Global Reach</h3>
              <p className="text-gray-600">Bridge distances and cultures to find love anywhere in the world</p>
            </div>
          </div>

          {/* About Company */}
          <div className="bg-gray-50 rounded-lg p-8 mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">About The Company</h2>
            <p className="text-gray-700 leading-relaxed">
              DripLove is proudly developed by The ScREAte Company Ltd, a technology company dedicated to creating innovative solutions that bring communities together. We are committed to building safe, inclusive, and empowering digital spaces for people worldwide.
            </p>
          </div>

          {/* Support Section */}
          <div className="bg-pink-50 rounded-lg p-8 text-center">
            <Mail className="w-12 h-12 text-pink-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Need Help?</h2>
            <p className="text-gray-700 mb-4">
              Our support team is here to help you make the most of your DripLove experience.
            </p>
            <a 
              href="mailto:support@driplove.com" 
              className="text-pink-600 hover:text-pink-700 font-semibold text-lg hover:underline"
            >
              support@driplove.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;
