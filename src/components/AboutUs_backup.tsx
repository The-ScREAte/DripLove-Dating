
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
            <p className="text-gray-600 leading-relaxed mb-3">
              DripLove stands out in the crowded dating app landscape through our commitment to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>Authentic connections based on shared values and interests</li>
              <li>A diverse, global community that celebrates all backgrounds</li>
              <li>Advanced matching algorithms that prioritize compatibility</li>
              <li>Safe, secure, and harassment-free environment</li>
              <li>Inclusive features designed for everyone</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Globe className="w-6 h-6 mr-2 text-blue-600" />
              3. Global Community
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              From New York to Nairobi, London to Lagos, Tokyo to Toronto – DripLove connects hearts across continents. Our platform brings together vibrant souls from all walks of life, creating a truly global dating experience.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Love doesn't recognize borders, and neither do we. Whether you're seeking local connections or international romance, DripLove makes it possible.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Users className="w-6 h-6 mr-2 text-green-600" />
              4. Our Values
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-600">
              <div className="p-4 bg-pink-50 rounded-lg">
                <h3 className="font-semibold text-pink-800 mb-2">Authenticity</h3>
                <p className="text-sm">We encourage genuine connections and real conversations.</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <h3 className="font-semibold text-purple-800 mb-2">Inclusivity</h3>
                <p className="text-sm">Everyone is welcome regardless of background, identity, or beliefs.</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2">Safety</h3>
                <p className="text-sm">Your security and privacy are our top priorities.</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-2">Innovation</h3>
                <p className="text-sm">We continuously improve to provide the best dating experience.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Target className="w-6 h-6 mr-2 text-orange-600" />
              5. About The ScREAte Ltd
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              DripLove is proudly created by The ScREAte Ltd, a technology company dedicated to building innovative digital experiences that bring people together. We specialize in creating platforms that foster genuine human connections.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Our team combines technical expertise with a deep understanding of human relationships to create products that make a meaningful difference in people's lives.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Shield className="w-6 h-6 mr-2 text-indigo-600" />
              6. Safety & Security
            </h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              Your safety is paramount to us. DripLove implements comprehensive security measures including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>Profile verification systems</li>
              <li>Advanced reporting and blocking features</li>
              <li>24/7 moderation and support</li>
              <li>End-to-end encryption for private messages</li>
              <li>Strict privacy controls</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Mail className="w-6 h-6 mr-2 text-pink-600" />
              7. Contact Information
            </h2>
            <p className="text-gray-600 mb-4">
              Have questions, feedback, or need support? We're here to help:
            </p>
            <div className="bg-pink-50 border border-pink-200 rounded-lg p-4 space-y-2">
              <p className="text-pink-800 font-semibold">
                📧 <a href="mailto:support@driplove.com" className="hover:underline">support@driplove.com</a>
              </p>
              <p className="text-pink-700">
                � The ScREAte Ltd – Support Team
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;
