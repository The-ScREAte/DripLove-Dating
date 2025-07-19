import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Eye, Lock, Users, Globe, Database, FileText, Mail } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

const PrivacyPolicy = ({ onBack }: PrivacyPolicyProps) => {
  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4 mobile-container"
      style={{
        paddingTop: `max(env(safe-area-inset-top, 0px), 16px)`,
        paddingBottom: `max(env(safe-area-inset-bottom, 0px), 16px)`,
        paddingLeft: `max(env(safe-area-inset-left, 0px), 16px)`,
        paddingRight: `max(env(safe-area-inset-right, 0px), 16px)`,
        minHeight: '100dvh'
      }}
    >
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 sticky-header rounded-t-lg" style={{ top: 0, zIndex: 10 }}>
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20 mb-4"
            style={{ fontSize: '16px' }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">DripLove Privacy Policy</h1>
          <p className="text-purple-100 mt-2">Last Updated: July 13, 2025</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
          <div className="text-center mb-8">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Shield className="w-6 h-6 mr-2 text-purple-600" />
              1. Our Commitment to Privacy
            </h2>
            <p className="text-gray-600 leading-relaxed">
              At DripLove, we respect and protect your privacy. This Privacy Policy explains how we collect, use, protect, and share your information when you use our platform. We are committed to maintaining the trust of our users by handling your data responsibly and in compliance with applicable privacy laws.
            </p>
          </section>

          <div className="text-center">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Database className="w-6 h-6 mr-2 text-blue-600" />
              2. Information We Collect
            </h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-3">a. Information You Provide</h3>
                <p className="text-gray-600 mb-3">When you use DripLove, you may provide:</p>
                <ul className="list-disc pl-6 space-y-1 text-gray-600">
                  <li>Profile details (e.g., name, age, photos, bio, interests)</li>
                  <li>Contact information (email address, optional phone number)</li>
                  <li>Location data (city, country, zip code)</li>
                  <li>Dating preferences and relationship goals</li>
                  <li>Messages and interactions with other users</li>
                  <li>Payment details for premium features</li>
                  <li>Support inquiries and feedback</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-3">b. Information We Collect Automatically</h3>
                <p className="text-gray-600 mb-3">We also collect certain technical and usage data, including:</p>
                <ul className="list-disc pl-6 space-y-1 text-gray-600">
                  <li>Device information (type, OS, unique identifiers)</li>
                  <li>Usage data (interactions, features used, time spent)</li>
                  <li>Log data (IP address, access times, referral sources)</li>
                  <li>Location information (with your permission)</li>
                  <li>Cookies and similar tracking technologies</li>
                </ul>
              </div>
            </div>
          </section>

          <div className="text-center">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Eye className="w-6 h-6 mr-2 text-green-600" />
              3. How We Use Your Information
            </h2>
            <p className="text-gray-600 mb-3">We use your information to:</p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600">
              <li>Create and manage your account</li>
              <li>Recommend matches based on your preferences</li>
              <li>Enable communication with other users</li>
              <li>Process payments and manage subscriptions</li>
              <li>Improve app performance and develop new features</li>
              <li>Maintain platform safety and prevent misuse</li>
              <li>Send essential updates and notifications</li>
              <li>Provide customer support</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <div className="text-center">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Users className="w-6 h-6 mr-2 text-purple-600" />
              4. Information Sharing and Disclosure
            </h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">a. With Other Users</h3>
                <p className="text-gray-600">Your profile is visible to other users as part of the matching experience. You control the content you choose to share.</p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">b. With Third-Party Service Providers</h3>
                <p className="text-gray-600">We work with trusted partners for hosting, analytics, payments, and support. These providers are contractually required to protect your data.</p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">c. Legal and Compliance</h3>
                <p className="text-gray-600">We may disclose your information when required to comply with legal obligations, enforce our policies, or protect the rights and safety of others.</p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">d. Business Transfers</h3>
                <p className="text-gray-600">In the event of a merger, acquisition, or asset transfer, user information may be part of the transferred assets under appropriate safeguards.</p>
              </div>
            </div>
          </section>

          <div className="text-center">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Lock className="w-6 h-6 mr-2 text-red-600" />
              5. Data Security
            </h2>
            <p className="text-gray-600 mb-3">We implement strong technical and organizational measures to protect your data, including:</p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 mb-4">
              <li>Data encryption during storage and transmission</li>
              <li>Access controls and secure authentication</li>
              <li>Security audits and regular vulnerability assessments</li>
              <li>Secure payment processing practices</li>
              <li>Internal data handling policies and employee training</li>
            </ul>
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
              <p className="text-yellow-800">
                <strong>⚠️ While we take every reasonable precaution, no system is completely immune to risks. Please use strong passwords and be cautious when sharing personal information.</strong>
              </p>
            </div>
          </section>

          <div className="text-center">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <FileText className="w-6 h-6 mr-2 text-indigo-600" />
              6. Your Privacy Rights
            </h2>
            <p className="text-gray-600 mb-3">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 mb-4">
              <li>Access your personal information</li>
              <li>Correct any inaccurate data</li>
              <li>Delete your account and associated information</li>
              <li>Restrict certain types of data processing</li>
            </ul>
            <p className="text-gray-600">
              To exercise any of these rights, please contact us at <a href="mailto:privacy@driplove.com" className="text-blue-600 hover:underline">privacy@driplove.com</a>. We will respond to your request within 30 days, in accordance with applicable laws.
            </p>
          </section>

          <div className="text-center">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">7. Cookies and Tracking Technologies</h2>
            <p className="text-gray-600 mb-3">DripLove uses cookies and similar tools to:</p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 mb-4">
              <li>Remember your preferences</li>
              <li>Analyze usage trends</li>
              <li>Personalize content</li>
              <li>Support security and fraud prevention</li>
            </ul>
            <p className="text-gray-600">
              You may control cookie settings in your browser. Please note that disabling cookies may affect certain functionality.
            </p>
          </section>

          <div className="text-center">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">8. Data Retention</h2>
            <p className="text-gray-600">
              We retain your information only as long as necessary for service delivery, legal compliance, and safety. Once you delete your account, we will remove your data within 30 days unless retention is legally required.
            </p>
          </section>

          <div className="text-center">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Globe className="w-6 h-6 mr-2 text-blue-600" />
              9. International Data Transfers
            </h2>
            <p className="text-gray-600">
              Because DripLove connects users globally, your data may be processed in countries outside your own. We use appropriate legal safeguards to protect your information during such transfers.
            </p>
          </section>

          <div className="text-center">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">10. Children's Privacy</h2>
            <p className="text-gray-600">
              DripLove is intended for users aged 18 and older. We do not knowingly collect data from minors. If we discover that a user is under 18, their data will be promptly deleted.
            </p>
          </section>

          <div className="text-center">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">11. Changes to This Policy</h2>
            <p className="text-gray-600">
              We may update this Privacy Policy to reflect changes in our practices or legal obligations. Significant changes will be communicated via the app or email. Continued use of DripLove after updates constitutes acceptance of the revised policy.
            </p>
          </section>

          <div className="text-center">
            <div className="text-gray-400 text-2xl font-light">⸻</div>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Mail className="w-6 h-6 mr-2 text-pink-600" />
              12. Contact Us
            </h2>
            <p className="text-gray-600 mb-4">
              If you have any questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
              <p className="text-pink-800 font-semibold">
                📧 <a href="mailto:privacy@driplove.com" className="hover:underline">privacy@driplove.com</a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
