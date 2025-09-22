
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface AboutUsProps {
  onBack: () => void;
}

const AboutUs = ({ onBack }: AboutUsProps) => {
  return (
    <div 
      className="min-h-fill bg-white flex flex-col mobile-container"
      style={{
        // Use a smaller top padding so the About page doesn't have an oversized gap
        paddingTop: `max(env(safe-area-inset-top, 0px), 8px)`,
        paddingBottom: `max(env(safe-area-inset-bottom, 0px), 12px)`,
        paddingLeft: `max(env(safe-area-inset-left, 0px), 0px)`,
        paddingRight: `max(env(safe-area-inset-right, 0px), 0px)`,
        minHeight: '100dvh'
      }}
    >
      {/* Header */}
      <div className="w-full bg-white border-b py-2 px-4 sticky-header" style={{ top: 0, zIndex: 10 }}>
        <Button 
          onClick={onBack}
          variant="ghost"
          className="text-gray-700 hover:bg-gray-100"
          style={{ fontSize: '16px' }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Header Text */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Feel the Spark. Drip in Love.</h1>
            <h2 className="text-2xl font-semibold text-gray-700 mb-8">Real Vibes. Real People. Real Love.</h2>
            <div className="text-gray-400 text-2xl font-light mb-8">⸻</div>
          </div>

          {/* What Is DripLove */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center">
              💖 What Is DripLove?
            </h2>
            <div className="space-y-6 text-gray-700 leading-relaxed">
              <p className="text-lg">
                DripLove isn't just a dating app — it's a global movement where bold hearts connect, real stories begin, and love flows beyond borders. We're not here for ordinary. We're here for something that hits different.
              </p>
              <p className="text-lg">
                Born from a vision to unite people from all walks of life, DripLove brings together vibrant souls from New York to Nairobi, London to Lagos, Tokyo to Toronto — wherever you are, love is always just a swipe away.
              </p>
            </div>
            <div className="text-gray-400 text-2xl font-light text-center my-8">⸻</div>
          </div>

          {/* Why DripLove */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center">
              🌍 Why DripLove?
            </h2>
            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Authentic Connections</h3>
                <p className="text-gray-700">Meet people who truly vibe with you — not just on looks, but on values, culture, and vision.</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Diverse Community</h3>
                <p className="text-gray-700">Drip into a space where every background is celebrated. Real love thrives when diversity is embraced.</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Global Reach</h3>
                <p className="text-gray-700">Cross oceans, time zones, and languages — because love doesn't need a visa.</p>
              </div>
            </div>
            <div className="text-gray-400 text-2xl font-light text-center my-8">⸻</div>
          </div>

          {/* About Company */}
          <div className="bg-gray-50 rounded-lg p-8 mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center">
              🏢 About the Company
            </h2>
            <p className="text-gray-700 leading-relaxed text-lg">
              DripLove is proudly created by The ScREAte Company Ltd, a tech brand with heart. We build tools that connect, empower, and uplift people across the globe. Our mission? To make digital spaces feel human — inclusive, safe, and full of possibility.
            </p>
            <div className="text-gray-400 text-2xl font-light text-center my-8">⸻</div>
          </div>

          {/* Support Section */}
          <div className="bg-pink-50 rounded-lg p-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center justify-center">
              🤝 Need Help?
            </h2>
            <p className="text-gray-700 mb-4 text-lg">
              We're here to make your DripLove journey smooth and magical.
            </p>
            <a 
              href="mailto:support@driplove.com" 
              className="text-pink-600 hover:text-pink-700 font-semibold text-lg hover:underline"
            >
              📩 support@driplove.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;
