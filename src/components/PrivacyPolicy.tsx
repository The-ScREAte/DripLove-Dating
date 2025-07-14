import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Eye, Lock, Users } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

const PrivacyPolicy = ({ onBack }: PrivacyPolicyProps) => {
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
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-purple-100 mt-2">Last updated: July 13, 2025</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Shield className="w-6 h-6 mr-2 text-purple-600" />
              1. Our Commitment to Privacy
            </h2>
            <p className="text-gray-600 leading-relaxed">
              At AfroVibe, we take your privacy seriously. This Privacy Policy explains how we collect, use, protect, and share your personal 
              information when you use our dating platform. We are committed to maintaining the trust and confidence of our users by ensuring 
              your data is handled with the utmost care and in accordance with applicable privacy laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Eye className="w-6 h-6 mr-2 text-purple-600" />
              2. Information We Collect
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Information You Provide</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  <li>Profile information (name, age, photos, bio, interests)</li>
                  <li>Contact information (email address, phone number)</li>
                  <li>Location data (city, country, zip code)</li>
                  <li>Preferences and relationship goals</li>
                  <li>Messages and communications with other users</li>
                  <li>Payment information for premium subscriptions</li>
                  <li>Support inquiries and feedback</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Information We Collect Automatically</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  <li>Device information (type, operating system, unique identifiers)</li>
                  <li>Usage data (features used, time spent, interactions)</li>
                  <li>Log data (IP address, access times, referral URLs)</li>
                  <li>Location information (with your permission)</li>
                  <li>Cookies and similar tracking technologies</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">3. How We Use Your Information</h2>
            <div className="text-gray-600 leading-relaxed space-y-3">
              <p>We use your information to:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Create and maintain your profile</li>
                <li>Provide matching services and recommendations</li>
                <li>Enable communication between users</li>
                <li>Process payments and manage subscriptions</li>
                <li>Improve our services and develop new features</li>
                <li>Ensure platform safety and prevent fraud</li>
                <li>Send important updates and notifications</li>
                <li>Provide customer support</li>
                <li>Comply with legal obligations</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">4. Information Sharing and Disclosure</h2>
            <div className="text-gray-600 leading-relaxed space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">With Other Users</h3>
                <p>Your profile information is visible to other users as part of our matching service. You control what information to include in your profile.</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">With Service Providers</h3>
                <p>We work with trusted third-party service providers for hosting, analytics, payment processing, and customer support. These providers are bound by confidentiality agreements.</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Legal Requirements</h3>
                <p>We may disclose information when required by law, to protect our rights, or in connection with legal proceedings.</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Business Transfers</h3>
                <p>In the event of a merger, acquisition, or sale of assets, user information may be transferred as part of the transaction.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Lock className="w-6 h-6 mr-2 text-purple-600" />
              5. Data Security
            </h2>
            <div className="text-gray-600 leading-relaxed space-y-3">
              <p>We implement robust security measures to protect your personal information:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Encryption of data in transit and at rest</li>
                <li>Regular security audits and assessments</li>
                <li>Access controls and authentication protocols</li>
                <li>Secure payment processing systems</li>
                <li>Employee training on data protection</li>
                <li>Incident response procedures</li>
              </ul>
              <p className="mt-4 bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
                <strong>Important:</strong> While we implement strong security measures, no system is 100% secure. We encourage users to 
                use strong passwords and be cautious about sharing personal information.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Users className="w-6 h-6 mr-2 text-purple-600" />
              6. Your Privacy Rights
            </h2>
            <div className="text-gray-600 leading-relaxed space-y-4">
              <p>Depending on your location, you may have the following rights:</p>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Access & Portability</h4>
                  <p className="text-sm">Request a copy of your personal data and download your information.</p>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Correction</h4>
                  <p className="text-sm">Update or correct inaccurate personal information.</p>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Deletion</h4>
                  <p className="text-sm">Request deletion of your personal data and account.</p>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Restriction</h4>
                  <p className="text-sm">Limit how we process your personal information.</p>
                </div>
              </div>
              
              <p className="mt-4">
                To exercise these rights, contact us at privacy@afrovibe.com. We will respond to your request within 30 days.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">7. Cookies and Tracking</h2>
            <div className="text-gray-600 leading-relaxed space-y-3">
              <p>We use cookies and similar technologies to:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Remember your preferences and settings</li>
                <li>Analyze usage patterns and improve our service</li>
                <li>Provide personalized content and recommendations</li>
                <li>Ensure platform security and prevent fraud</li>
              </ul>
              <p className="mt-4">
                You can control cookie settings through your browser preferences. However, disabling cookies may affect some functionality.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">8. Data Retention</h2>
            <p className="text-gray-600 leading-relaxed">
              We retain your personal information for as long as necessary to provide our services, comply with legal obligations, 
              and resolve disputes. When you delete your account, we will delete your personal information within 30 days, except 
              where we are required to retain it for legal or safety purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">9. International Data Transfers</h2>
            <p className="text-gray-600 leading-relaxed">
              As AfroVibe connects users globally, your information may be transferred to and processed in countries other than your own. 
              We ensure appropriate safeguards are in place for international transfers, including standard contractual clauses and 
              adequacy decisions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">10. Children's Privacy</h2>
            <p className="text-gray-600 leading-relaxed">
              AfroVibe is intended for users 18 years and older. We do not knowingly collect personal information from minors. 
              If we become aware that we have collected information from someone under 18, we will delete it immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">11. Changes to This Policy</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update this Privacy Policy periodically to reflect changes in our practices or applicable laws. We will notify users 
              of significant changes through the app or email. Your continued use of AfroVibe after changes become effective constitutes 
              acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">12. Contact Us</h2>
            <div className="text-gray-600 leading-relaxed">
              <p>If you have questions about this Privacy Policy or how we handle your personal information, please contact us:</p>
              <div className="mt-4 bg-gray-50 p-6 rounded-lg">
                <div className="space-y-2">
                  <p><strong>Email:</strong> privacy@afrovibe.com</p>
                  <p><strong>Data Protection Officer:</strong> dpo@afrovibe.com</p>
                  <p><strong>Address:</strong> AfroVibe Privacy Team<br />123 Love Lane<br />Heart City, HC 12345</p>
                  <p><strong>Phone:</strong> +1 (555) 123-4567</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
