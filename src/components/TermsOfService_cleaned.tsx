import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, Users, Crown, Shield, AlertTriangle, Gavel, Mail } from 'lucide-react';

interface TermsOfServiceProps {
  onBack: () => void;
}

const TermsOfService = ({ onBack }: TermsOfServiceProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 sticky top-0 z-10">
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">DripLove Terms of Service</h1>
          <p className="text-purple-100 mt-2">Last Updated: July 13, 2025</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <FileText className="w-6 h-6 mr-2 text-blue-600" />
              1. Acceptance of Terms
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              By accessing or using DripLove ("the Service"), you agree to comply with and be legally bound by these Terms of Service. If you do not accept these terms in full, do not use the Service.
            </p>
            <p className="text-gray-600 leading-relaxed">
              DripLove is owned and operated by The ScREAte Ltd, a company committed to building innovative and inclusive digital experiences.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Users className="w-6 h-6 mr-2 text-purple-600" />
              2. Description of Service
            </h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              DripLove is a global dating platform created to connect individuals from diverse backgrounds. Our features include:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600">
              <li>Personalized profile creation and management</li>
              <li>Match suggestions based on preferences and compatibility</li>
              <li>Real-time messaging and communication tools</li>
              <li>Optional premium subscription features</li>
              <li>Safety guidelines and community moderation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">3. User Eligibility</h2>
            <p className="text-gray-600 leading-relaxed mb-3">To use DripLove, you must:</p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600">
              <li>Be at least 18 years of age</li>
              <li>Provide accurate and truthful personal information</li>
              <li>Not be prohibited from using the service by any applicable law</li>
              <li>Not have been previously suspended or banned from DripLove</li>
              <li>Use the platform solely for legitimate dating or relationship purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <AlertTriangle className="w-6 h-6 mr-2 text-red-600" />
              4. User Conduct
            </h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              All users are expected to behave respectfully and responsibly. The following actions are strictly prohibited:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 mb-4">
              <li>Harassment, abuse, or threatening behavior</li>
              <li>Uploading or sharing explicit, hateful, or illegal content</li>
              <li>Creating fake identities or impersonating others</li>
              <li>Soliciting money, gifts, or sensitive information</li>
              <li>Promoting commercial services, spam, or scams</li>
              <li>Violating any laws while using the service</li>
              <li>Circumventing or disabling safety features</li>
            </ul>
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
              <p className="text-red-800">
                <strong>⚠️ Violation of these rules may result in immediate account suspension or termination.</strong>
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Crown className="w-6 h-6 mr-2 text-yellow-600" />
              5. Premium Subscription
            </h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              DripLove offers optional premium features, such as:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 mb-4">
              <li>Unlimited likes and super likes</li>
              <li>Advanced match filtering</li>
              <li>Ad-free browsing</li>
              <li>Enhanced profile visibility</li>
              <li>Priority customer support</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mb-2">All subscriptions:</p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600">
              <li>Auto-renew by default unless canceled before renewal</li>
              <li>Are non-refundable unless otherwise required by law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">6. Privacy and Data Protection</h2>
            <p className="text-gray-600 leading-relaxed">
              We respect your privacy. Our practices are explained in our Privacy Policy. By using DripLove, you consent to the collection and use of your information in accordance with that policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">7. Content and Intellectual Property</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>Users retain ownership of their uploaded content but grant DripLove a non-exclusive, worldwide license to use, display, and distribute it within the platform.</li>
              <li>All platform branding, visuals, and code remain the exclusive property of The ScREAte Ltd and may not be used without written permission.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Shield className="w-6 h-6 mr-2 text-green-600" />
              8. Safety and Security
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              DripLove implements community and technical safeguards, but your personal safety is your responsibility.
            </p>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-green-800 mb-3 flex items-center">
                🔐 User Safety Guidelines:
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-green-700">
                <li>Always meet in public spaces for initial dates</li>
                <li>Inform someone you trust of your meeting details</li>
                <li>Never share banking or financial information</li>
                <li>Use in-app chat before exchanging personal contact details</li>
                <li>Report suspicious behavior using the in-app report tool</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">9. Account Termination</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We reserve the right to suspend or permanently ban users who violate these Terms or compromise user safety.
            </p>
            <p className="text-gray-600 leading-relaxed">
              You may delete your account at any time via your profile settings. Account deletion is permanent and will remove your data from our active servers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Gavel className="w-6 h-6 mr-2 text-gray-600" />
              10. Limitation of Liability
            </h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              DripLove is provided "as is" and without warranties of any kind. We are not liable for:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600">
              <li>User interactions or relationships</li>
              <li>Technical disruptions, bugs, or downtime</li>
              <li>Data loss or service interruptions</li>
              <li>Unauthorized use of your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">11. Changes to Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update these Terms periodically. You will be notified of significant changes, and continued use of the Service constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Mail className="w-6 h-6 mr-2 text-pink-600" />
              12. Contact Information
            </h2>
            <p className="text-gray-600 mb-4">
              If you have questions or need assistance, contact us at:
            </p>
            <div className="bg-pink-50 border border-pink-200 rounded-lg p-4 space-y-2">
              <p className="text-pink-800 font-semibold">
                📧 <a href="mailto:support@driplove.com" className="hover:underline">support@driplove.com</a>
              </p>
              <p className="text-pink-700">
                📍 The ScREAte Ltd – Support Team
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
