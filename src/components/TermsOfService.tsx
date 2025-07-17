import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface TermsOfServiceProps {
  onBack: () => void;
}

const TermsOfService = ({ onBack }: TermsOfServiceProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6">
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">Terms of Service</h1>
          <p className="text-purple-100 mt-2">Last updated: July 13, 2025</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              By accessing and using DripLove ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. 
              If you do not agree to abide by the above, please do not use this service.
            </p>
            
            <p className="text-gray-700 mb-6">
              DripLove is a property of The ScREAte Ltd, a technology company dedicated to creating innovative digital solutions.
            </p>
            
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Service Description</h3>
            <p className="text-gray-700 mb-6">
              DripLove is a dating platform designed to connect individuals from diverse backgrounds worldwide.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">2. Description of Service</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              AfroVibe is a dating platform designed to connect individuals within the African diaspora community worldwide. 
              Our service provides features including:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>Profile creation and management</li>
              <li>Matching algorithms based on preferences and compatibility</li>
              <li>Messaging and communication tools</li>
              <li>Premium subscription features</li>
              <li>Community guidelines and safety features</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">3. User Eligibility</h2>
            <div className="text-gray-600 leading-relaxed space-y-3">
              <p>To use DripLove, you must:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Be at least 18 years of age</li>
                <li>Provide accurate and truthful information</li>
                <li>Not be prohibited from using the service under applicable law</li>
                <li>Not have been previously banned from our platform</li>
                <li>Use the service for legitimate dating and relationship purposes only</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">4. User Conduct</h2>
            <div className="text-gray-600 leading-relaxed space-y-3">
              <p>Users agree to conduct themselves respectfully and lawfully. The following behaviors are strictly prohibited:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Harassment, abuse, or threatening behavior toward other users</li>
                <li>Sharing inappropriate, offensive, or explicit content</li>
                <li>Impersonating another person or creating fake profiles</li>
                <li>Soliciting money, gifts, or personal information</li>
                <li>Promoting commercial activities or spam</li>
                <li>Using the platform for illegal activities</li>
                <li>Attempting to circumvent our safety measures</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">5. Premium Subscription</h2>
            <div className="text-gray-600 leading-relaxed space-y-3">
              <p>DripLove offers premium subscription features including:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Unlimited likes and super likes</li>
                <li>Advanced filtering options</li>
                <li>Priority customer support</li>
                <li>Ad-free experience</li>
                <li>Enhanced profile visibility</li>
              </ul>
              <p className="mt-4">
                Subscription fees are non-refundable except as required by law. Subscriptions automatically renew unless cancelled before the renewal date.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">6. Privacy and Data Protection</h2>
            <p className="text-gray-600 leading-relaxed">
              Your privacy is important to us. Please review our Privacy Policy to understand how we collect, use, and protect your personal information. 
              By using our service, you consent to the collection and use of information as outlined in our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">7. Content and Intellectual Property</h2>
            <ul className="text-gray-600 leading-relaxed space-y-3">
              <li>
                Users retain ownership of content they upload but grant DripLove a license to use, display, and distribute such content 
                within the platform for its intended purpose.
              </li>
              <li>
                All DripLove branding, logos, and proprietary content remain the exclusive property of The ScREAte Ltd and may not be used 
                without explicit written permission.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">8. Safety and Security</h2>
            <div className="text-gray-600 leading-relaxed space-y-3">
              <p>While we implement safety measures, users are responsible for their own safety when meeting others through our platform:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Always meet in public places for initial meetings</li>
                <li>Inform friends or family about your plans</li>
                <li>Trust your instincts and report suspicious behavior</li>
                <li>Never share personal financial information</li>
                <li>Use our in-app messaging until you feel comfortable</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">9. Account Termination</h2>
            <p className="text-gray-600 leading-relaxed">
              We reserve the right to suspend or terminate accounts that violate these terms or engage in harmful behavior. 
              Users may also delete their accounts at any time through their profile settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">10. Limitation of Liability</h2>
            <p className="text-gray-600 leading-relaxed">
              DripLove provides the service "as is" without warranties. We are not liable for any damages resulting from use of our platform, 
              including but not limited to interactions between users, technical issues, or data loss.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">11. Changes to Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update these terms periodically. Users will be notified of significant changes, and continued use of the service 
              constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">12. Contact Information</h2>
            <div className="text-gray-600 leading-relaxed">
              <p>For questions about these Terms of Service, please contact us at:</p>
              <div className="mt-3 bg-gray-50 p-4 rounded-lg">
                <p>Email: support@driplove.com</p>
                <p>Address: The ScREAte Ltd Support Team</p>
                <p>Phone: +1 (555) 123-4567</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
