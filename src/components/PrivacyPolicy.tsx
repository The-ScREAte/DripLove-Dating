import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Eye, Lock, Users, Globe, Database, FileText, Mail } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

const PrivacyPolicy = ({ onBack }: PrivacyPolicyProps) => {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-fill bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white py-2 px-4 sticky top-0 z-10">
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.back')}
          </Button>
          <h1 className="text-3xl font-bold">{t('privacyPolicy.title')}</h1>
          <p className="text-purple-100 mt-2">{t('privacyPolicy.lastUpdated')}</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Shield className="w-6 h-6 mr-2 text-purple-600" />
              1. Our Commitment to Privacy
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              At DripLove, we respect and protect your privacy. This Privacy Policy explains how we collect, use, protect, and share your information when you use our platform. We are committed to maintaining the trust of our users by handling your data responsibly and in compliance with applicable privacy laws.
            </p>
            <p className="text-gray-600 leading-relaxed">
              DripLove is owned and operated by The ScREAte Ltd, a company dedicated to protecting user privacy and maintaining the highest standards of data security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Database className="w-6 h-6 mr-2 text-blue-600" />
              2. Information We Collect
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Information You Provide:</h3>
                <ul className="list-disc pl-6 space-y-1 text-gray-600">
                  <li>Profile details (name, age, photos, bio, interests)</li>
                  <li>Contact information (email address, phone number)</li>
                  <li>Location data (city, country, zip code)</li>
                  <li>Dating preferences and relationship goals</li>
                  <li>Messages and interactions with other users</li>
                  <li>Payment details for premium features</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Biometric and Face Data:</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <p className="text-gray-700 font-medium">Face Data Collection</p>
                  <p className="text-gray-600 leading-relaxed">
                    We collect a single facial image during account registration for identity verification and fraud prevention. The facial image is processed using Amazon Web Services (AWS Rekognition) to generate a Face ID that helps ensure each individual can create only one account.
                  </p>
                  <p className="text-gray-700 font-medium">Use of Face Data</p>
                  <p className="text-gray-600 leading-relaxed">
                    Face data is used exclusively to prevent duplicate registrations and protect users from fraudulent activity. It is not used for advertising, analytics, tracking, personalization, or profiling. The app enforces a one user = one account policy.
                  </p>
                  <p className="text-gray-700 font-medium">Third-Party Processing</p>
                  <p className="text-gray-600 leading-relaxed">
                    Facial recognition processing is performed by AWS Rekognition. The facial image is not stored by the app after processing. AWS Rekognition generates and stores only the Face ID (biometric identifier) securely within AWS infrastructure. Face data is not shared with advertisers, analytics providers, or any other third parties.
                  </p>
                  <p className="text-gray-700 font-medium">Retention of Face Data</p>
                  <p className="text-gray-600 leading-relaxed">
                    The facial image is not retained by the app after processing. The Face ID stored by AWS Rekognition is retained only while the user account is active. If a user deletes their account, the corresponding Face ID is permanently deleted to prevent further association.
                  </p>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Information We Collect Automatically:</h3>
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

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Eye className="w-6 h-6 mr-2 text-green-600" />
              3. How We Use Your Information
            </h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              We use your information to provide and improve our services, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>Creating and maintaining your profile</li>
              <li>Matching you with compatible users</li>
              <li>Facilitating communication between users</li>
              <li>Personalizing your experience</li>
              <li>Ensuring platform safety and security</li>
              <li>Verifying identity and preventing duplicate accounts using face data</li>
              <li>Processing payments and subscriptions</li>
              <li>Providing customer support</li>
              <li>Improving our algorithms and features</li>
            </ul>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4">
              <p className="text-gray-700 text-sm">
                <strong>Note on Face Data:</strong> Facial recognition is used only for identity verification and fraud prevention. Face data is never used for advertising, analytics, user tracking, personalization, or profiling purposes.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Users className="w-6 h-6 mr-2 text-orange-600" />
              4. Information Sharing
            </h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              We may share your information in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>With other users as part of the matching and communication features</li>
              <li>With service providers who help us operate our platform</li>
              <li>When required by law or to protect our rights</li>
              <li>In connection with a business transaction (merger, acquisition)</li>
              <li>With your explicit consent for specific purposes</li>
            </ul>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4 space-y-2">
              <p className="text-gray-700 font-medium">Third-Party Service Providers</p>
              <p className="text-gray-600 text-sm leading-relaxed">
                <strong>AWS Rekognition:</strong> We use Amazon Web Services (AWS Rekognition) to process facial images for identity verification. The facial image is submitted to AWS Rekognition solely to generate a Face ID (biometric identifier). The original facial image is not stored by our app after processing. AWS stores only the Face ID securely within AWS infrastructure. Face data is never shared with advertisers, analytics providers, or any other third parties beyond AWS Rekognition.
              </p>
            </div>
            <p className="text-gray-600 leading-relaxed mt-3">
              We never sell your personal information to third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Lock className="w-6 h-6 mr-2 text-red-600" />
              5. Data Security
            </h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              We implement comprehensive security measures to protect your information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>End-to-end encryption for sensitive communications</li>
              <li>Secure data transmission using SSL/TLS protocols</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Access controls and authentication systems</li>
              <li>Data backup and recovery procedures</li>
              <li>Staff training on privacy and security best practices</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Globe className="w-6 h-6 mr-2 text-indigo-600" />
              6. Your Rights and Choices
            </h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              You have several rights regarding your personal information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600">
              <li>Access and review your personal data</li>
              <li>Correct or update inaccurate information</li>
              <li>Delete your account and associated data</li>
              <li>Control your privacy settings and preferences</li>
              <li>Opt out of certain communications</li>
              <li>Request data portability</li>
              <li>Object to certain processing activities</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <FileText className="w-6 h-6 mr-2 text-cyan-600" />
              7. Data Retention
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We retain your information only as long as necessary to provide our services and comply with legal obligations. When you delete your account, we will remove your personal information from our active systems within 30 days.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              Some information may be retained for longer periods for legal, safety, or business purposes, but will be kept in a secure and restricted manner.
            </p>
            <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4 space-y-2">
              <p className="text-gray-700 font-medium">Face Data Retention</p>
              <ul className="list-disc pl-6 space-y-1 text-gray-600 text-sm">
                <li>The facial image is not retained by the app after processing</li>
                <li>The Face ID stored by AWS Rekognition is retained only while your account is active</li>
                <li>Upon account deletion, the corresponding Face ID is permanently deleted from AWS Rekognition to prevent further association</li>
                <li>This ensures complete removal of all biometric data when you choose to leave the platform</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">8. Changes to This Policy</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update this Privacy Policy periodically to reflect changes in our practices or applicable laws. We will notify you of significant changes and obtain your consent where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <Mail className="w-6 h-6 mr-2 text-pink-600" />
              9. Contact Information
            </h2>
            <p className="text-gray-600 mb-4">
              If you have questions about this Privacy Policy or your data, contact us at:
            </p>
            <div className="bg-pink-50 border border-pink-200 rounded-lg p-4 space-y-2">
              <p className="text-pink-800 font-semibold">
                📧 <a href="mailto:driploveinfo@gmail.com" className="hover:underline">driploveinfo@gmail.com</a>
              </p>
              <p className="text-pink-700">
                📍 The ScREAte Ltd – Privacy Team
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;