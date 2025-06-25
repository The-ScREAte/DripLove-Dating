
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Heart, Users, Globe, Mail } from 'lucide-react';

interface AboutUsProps {
  onBack: () => void;
}

const AboutUs = ({ onBack }: AboutUsProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-4 py-3 flex items-center">
          <Button
            onClick={onBack}
            variant="ghost"
            className="mr-3 p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-gray-800">About AfroVibe</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-8 max-w-2xl mx-auto">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <img 
            src="/lovable-uploads/0e9bd84b-0f71-493b-8c1f-1a2883e5109d.png" 
            alt="AfroVibe Logo" 
            className="h-20 mx-auto mb-4"
          />
          <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Where African Hearts Connect
          </h2>
        </div>

        {/* About Content */}
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p className="text-lg">
            AfroVibe is more than just a dating platform – it's a vibrant community where African hearts connect across continents. 
            Born from the vision of bringing together the rich diversity of the African diaspora, we understand the unique beauty of 
            African culture, values, and traditions that make our community special. Whether you're in Lagos, London, New York, or anywhere 
            in between, AfroVibe creates meaningful connections that transcend geographical boundaries.
          </p>

          <p className="text-lg">
            Our mission is to foster authentic relationships built on shared heritage, mutual respect, and genuine compatibility. 
            We believe that love knows no borders, and through our carefully crafted matching system, we help you discover someone who 
            not only captures your heart but also understands your journey. At AfroVibe, every swipe brings you closer to finding your 
            perfect match within our beautiful, diverse African community worldwide.
          </p>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
            <div className="text-center p-4 rounded-lg bg-white shadow-sm">
              <Heart className="w-8 h-8 text-pink-500 mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Authentic Connections</h3>
              <p className="text-sm text-gray-600">Find meaningful relationships based on shared values and cultural understanding</p>
            </div>
            
            <div className="text-center p-4 rounded-lg bg-white shadow-sm">
              <Users className="w-8 h-8 text-purple-500 mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Diverse Community</h3>
              <p className="text-sm text-gray-600">Connect with African singles from all walks of life across the globe</p>
            </div>
            
            <div className="text-center p-4 rounded-lg bg-white shadow-sm">
              <Globe className="w-8 h-8 text-indigo-500 mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Global Reach</h3>
              <p className="text-sm text-gray-600">Bridge distances and cultures to find love anywhere in the world</p>
            </div>
          </div>

          {/* Company Info */}
          <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-pink-500">
            <h3 className="text-lg font-semibold mb-2 text-gray-800">About The Company</h3>
            <p className="text-gray-600 mb-4">
              AfroVibe is proudly developed by <strong>The ScREAte Company Ltd</strong>, a technology company dedicated to creating 
              innovative solutions that bring communities together. We are committed to building safe, inclusive, and empowering 
              digital spaces for the African diaspora.
            </p>
          </div>

          {/* Support Section */}
          <div className="bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg p-6 text-white text-center">
            <h3 className="text-xl font-bold mb-3">Need Help?</h3>
            <p className="mb-4">
              Our support team is here to help you make the most of your AfroVibe experience.
            </p>
            <div className="flex items-center justify-center space-x-2 text-white/90">
              <Mail className="w-4 h-4" />
              <span className="font-medium">support@afrovibe.com</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;
