import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContactCard,
  LegalList,
  LegalPage,
  LegalSection,
  LegalSubheading,
  PolicyLink,
} from '@/components/legal/LegalPage';
import { COMPANY, LEGAL_LAST_UPDATED } from '@/components/legal/legalInfo';

interface PrivacyPolicyProps {
  onBack: () => void;
}

const PrivacyPolicy = ({ onBack }: PrivacyPolicyProps) => {
  const { t } = useTranslation();

  return (
    <LegalPage
      title={t('privacyPolicy.title')}
      updated={LEGAL_LAST_UPDATED}
      onBack={onBack}
      intro={
        <>
          <p>
            This Privacy Policy describes how {COMPANY.name} ("DripLove," "we," "us," or "our") collects, uses,
            discloses and otherwise processes personal information in connection with the DripLove mobile application
            and website (collectively, the "Service"), and the rights and choices available to you. {COMPANY.name} is
            the controller of the personal information processed under this Privacy Policy.
          </p>
          <p>
            This Privacy Policy forms part of our{' '}
            <PolicyLink to="/terms-of-service">Terms of Service</PolicyLink>. By using the Service, you acknowledge
            that your personal information will be processed as described herein. We do not sell personal
            information, and we do not share personal information for cross-context behavioral advertising.
          </p>
        </>
      }
    >
      <LegalSection number={1} title="Personal Information We Collect From You">
        <LegalList
          items={[
            'Account information: name, email address, date of birth, gender and, where you use Apple or Google sign-in, the identifiers provided by those services.',
            'Profile information: photographs, biography, interests, lifestyle, occupation and education, relationship intentions and partner preferences.',
            'Location information: country and city and, where you grant permission, the location of your device.',
            'Activity information: likes, matches, messages and other interactions with members.',
            'Verification information: the selfie you submit if you elect to verify your profile, as described in Section 3.',
            'Transaction information: confirmation of purchases processed by Apple, Google or Paystack. We do not receive or store full payment card numbers.',
            'Communications: information you provide when contacting support, submitting a report or creating an advertisement.',
          ]}
        />
      </LegalSection>

      <LegalSection number={2} title="Personal Information Collected Automatically">
        <LegalList
          items={[
            'Device information, including device type, operating system, application version and push notification token.',
            'Usage information, including the dates and times you access the Service and the features you use.',
            'Log information, including Internet Protocol (IP) address and request timestamps.',
            'Information stored through local storage and similar technologies on our website to maintain your session and preferences.',
          ]}
        />
      </LegalSection>

      <LegalSection number={3} title="Profile Verification and Biometric Information">
        <p>
          Profile verification is optional. If you elect to verify your profile, the selfie you submit is processed
          by Amazon Rekognition, a service of Amazon Web Services, Inc., to generate a facial template, being a
          numerical representation of facial features. The facial template is used solely to confirm that your
          profile photographs depict you and to prevent duplicate and fraudulent accounts.
        </p>
        <p>
          The facial template is stored by Amazon Web Services on our behalf, is not used for any other purpose, is
          not sold or otherwise disclosed to any third party, and is permanently deleted upon deletion of your
          account. By submitting a verification selfie, you consent to the collection and processing described in
          this Section.
        </p>
        <p>
          Photographs uploaded to the Service may be screened by automated systems and reviewed by our personnel to
          detect prohibited content and fraudulent profiles.
        </p>
      </LegalSection>

      <LegalSection number={4} title="Purposes of Processing">
        <p>We process personal information for the following purposes:</p>
        <LegalList
          items={[
            'to create and maintain your account and profile;',
            'to recommend potential matches based on your preferences, location and activity;',
            'to enable communications between members;',
            'to send notifications and emails regarding your account, member activity and offers relating to the Service, in accordance with your settings;',
            'to verify profiles, moderate content, and detect and prevent fraud, abuse and violations of our Terms of Service;',
            'to process subscriptions and payments;',
            'to provide customer support;',
            'to analyse and improve the Service; and',
            'to comply with legal obligations and to establish, exercise or defend legal claims.',
          ]}
        />
      </LegalSection>

      <LegalSection number={5} title="Information Visible to Other Members">
        <p>
          Your profile, including your name, age, photographs, biography, interests and city or country, is visible
          to other members. Messages are visible to their recipients. Your email address, date of birth, transaction
          information and verification selfie are not displayed to other members.
        </p>
      </LegalSection>

      <LegalSection number={6} title="Disclosure of Personal Information">
        <p>We disclose personal information only in the following circumstances:</p>
        <LegalList
          items={[
            'Service providers: to vendors that process personal information on our behalf under contractual obligations restricting its use, namely Supabase (hosting, database and storage), Amazon Web Services (profile verification), Google Firebase and Apple (push notifications), our email service providers, and Apple, Google and Paystack (authentication and payment processing).',
            'Other members: as described in Section 5.',
            'Legal requirements: where required by law, regulation, legal process or governmental request, or where necessary to protect the rights, property or safety of DripLove, our members or the public.',
            'Business transfers: in connection with a merger, acquisition, financing or sale of all or part of our business or assets.',
            'Consent: with your consent or at your direction.',
          ]}
        />
      </LegalSection>

      <LegalSection number={7} title="Data Security">
        <p>
          We maintain administrative, technical and organisational measures designed to protect personal
          information, including encryption in transit using Transport Layer Security (TLS), encryption at rest
          provided by our hosting provider, and access controls limiting access to personnel and systems that
          require it. No method of transmission or storage is completely secure, and we cannot guarantee absolute
          security.
        </p>
      </LegalSection>

      <LegalSection number={8} title="Data Retention">
        <p>
          We retain personal information for as long as your account remains active. Upon deletion of your account,
          we delete your personal information from our active systems within thirty (30) days and permanently
          delete your facial template immediately. We may retain limited information for longer periods where
          necessary to comply with legal obligations, resolve disputes, prevent fraud and abuse, or enforce our
          agreements, including transaction records and records of accounts removed for violations.
        </p>
      </LegalSection>

      <LegalSection number={9} title="Your Rights and Choices">
        <p>Subject to applicable law, you may have the right to:</p>
        <LegalList
          items={[
            'access the personal information we hold about you;',
            'correct inaccurate personal information;',
            'delete your account and personal information, which you may do at any time in your profile settings;',
            'receive a copy of your personal information in a portable format;',
            'object to or restrict certain processing; and',
            'withdraw consent previously given, including for device location and profile verification.',
          ]}
        />
        <p>
          You may disable push notifications and location access in your device settings and opt out of marketing
          emails using the unsubscribe link provided. To exercise any other right, contact us using the details in
          Section 14. We may need to verify your identity before responding. You may also lodge a complaint with the
          data protection authority in your jurisdiction.
        </p>
      </LegalSection>

      <LegalSection number={10} title="International Data Transfers">
        <p>
          Your personal information may be transferred to and processed in jurisdictions other than the one in which
          you reside, which may have data protection laws different from those of your jurisdiction. Where required
          by applicable law, we implement appropriate safeguards for such transfers, including the Standard
          Contractual Clauses approved by the European Commission.
        </p>
      </LegalSection>

      <LegalSection number={11} title="Jurisdiction-Specific Disclosures">
        <LegalSubheading>11.1 European Economic Area, United Kingdom and Switzerland</LegalSubheading>
        <p>We rely on the following legal bases for processing personal information:</p>
        <LegalList
          items={[
            'performance of a contract, to provide the Service, including profiles, matching, messaging and subscriptions;',
            'legitimate interests, to secure the Service, prevent fraud and abuse, and improve the Service;',
            'consent, for profile verification, device location and marketing communications, which you may withdraw at any time; and',
            'compliance with legal obligations.',
          ]}
        />
        <p>
          You have the rights set out in Section 9 and the right to lodge a complaint with a supervisory authority.
        </p>

        <LegalSubheading>11.2 State Consumer Privacy Laws</LegalSubheading>
        <p>
          Residents of jurisdictions with comprehensive consumer privacy laws, including California, Colorado,
          Connecticut, Oregon, Texas and Virginia, may have the right to know the categories and specific
          pieces of personal information we process; to access, correct, delete and obtain a copy of their personal
          information; and to opt out of the sale of personal information, its sharing for cross-context behavioral
          advertising, and profiling in furtherance of decisions producing legal or similarly significant effects.
          We do not sell personal information or share it for cross-context behavioral advertising.
        </p>
        <p>
          We process the following categories of sensitive personal information: biometric information (facial
          templates generated through optional profile verification), precise geolocation (where you grant
          permission), and information concerning gender and partner preferences that you elect to provide. We
          process sensitive personal information only as necessary to provide and secure the Service. Requests may
          be submitted to the contact in Section 14 or through an authorised agent. We will not discriminate against
          you for exercising your rights. If we decline a request, you may appeal by responding to our decision; if
          your appeal is denied, you may contact the attorney general of your jurisdiction.
        </p>

        <LegalSubheading>11.3 Consumer Health Data</LegalSubheading>
        <p>
          Certain laws, including the Washington My Health My Data Act and Nevada Senate Bill 370, treat some
          information as consumer health data. Consumer health data processed by DripLove consists of the facial
          template generated through optional profile verification and any health-related information you elect to
          include in your profile. We collect consumer health data only with your consent; use it only to verify
          profiles and maintain the safety of the Service; disclose it only to Amazon Web Services as our processor;
          and do not sell it. You may access or delete your consumer health data, or withdraw your consent, by
          contacting us or deleting your account.
        </p>
      </LegalSection>

      <LegalSection number={12} title="Children">
        <p>
          The Service is intended solely for persons aged eighteen (18) and over. We do not knowingly collect
          personal information from anyone under eighteen (18). If we become aware that such information has been
          collected, we will delete the associated account. See also our{' '}
          <PolicyLink to="/child-safety">Child Safety Standards</PolicyLink>.
        </p>
      </LegalSection>

      <LegalSection number={13} title="Changes to This Privacy Policy">
        <p>
          We may amend this Privacy Policy from time to time. We will provide notice of material changes in the
          Service or by email before they take effect and will obtain your consent where required by applicable law.
          The "Last updated" date above indicates when this Privacy Policy was last revised.
        </p>
      </LegalSection>

      <LegalSection number={14} title="Contact">
        <p>
          Requests and enquiries regarding this Privacy Policy or our processing of personal information may be
          directed to:
        </p>
        <ContactCard team="Privacy Office" />
      </LegalSection>
    </LegalPage>
  );
};

export default PrivacyPolicy;
