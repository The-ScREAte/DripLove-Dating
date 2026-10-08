import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContactCard,
  LegalList,
  LegalPage,
  LegalSection,
  LegalSubheading,
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
            Your privacy matters to us. This Privacy Policy explains what information DripLove collects, how we use
            and share it, and the choices you have. It applies to the DripLove app and website, which are operated by
            {COMPANY.name} ("DripLove", "we", "us"), based in Rexburg, Idaho, United States. {COMPANY.name} is the
            controller of your personal information.
          </p>
          <p>We never sell your personal information or share it for targeted advertising.</p>
        </>
      }
    >
      <LegalSection number={1} title="Information you give us">
        <LegalList
          items={[
            'Account details: your name, email address, date of birth and gender, and your sign-in details if you use Apple or Google sign-in.',
            'Profile information: photos, bio, interests, lifestyle, work and education, relationship goals and the kind of people you would like to meet.',
            'Location: your country and city, and your device location if you choose to share it.',
            'Activity: your likes, matches, messages and other interactions with members.',
            'Verification selfie: if you choose to verify your profile (see section 3).',
            'Payments: when you subscribe, Apple, Google or Paystack processes the payment. We receive confirmation of the purchase, not your full card details.',
            'Support, reports and ads: what you send us when you contact support, report a member or create an ad.',
          ]}
        />
      </LegalSection>

      <LegalSection number={2} title="Information collected automatically">
        <LegalList
          items={[
            'Device information, such as device type, operating system and app version, and the push notification token for your device.',
            'Usage information, such as when you last used the app and which features you use.',
            'Log information, such as your IP address and the dates and times of your requests.',
            'On our website, local storage and similar technologies that keep you signed in and remember your preferences.',
          ]}
        />
      </LegalSection>

      <LegalSection number={3} title="Profile verification and photo checks">
        <p>
          Profile verification is optional. When you verify, your selfie is analysed by Amazon Rekognition, a
          service provided by Amazon Web Services, which creates a face template, a set of numbers describing your
          facial features. We use it only to confirm that your profile photos show you and to stop the same person
          from creating multiple or fake accounts.
        </p>
        <p>
          The face template is stored by Amazon Web Services on our behalf and is deleted when you delete your
          account. We do not use it for any other purpose or share it with anyone else.
        </p>
        <p>
          Photos you upload may be checked automatically and reviewed by our team to keep inappropriate content and
          fake profiles off DripLove.
        </p>
      </LegalSection>

      <LegalSection number={4} title="How we use your information">
        <LegalList
          items={[
            'To create and run your account and profile',
            'To suggest people you may like, based on your preferences, location and activity',
            'To let you chat and connect with other members',
            'To send notifications and emails about your activity, your account and occasional suggestions or offers, in line with your settings',
            'To keep DripLove safe: verifying profiles, moderating content, and preventing fraud, spam and abuse',
            'To process subscriptions and payments',
            'To provide customer support',
            'To understand how DripLove is used and improve it',
            'To comply with the law and enforce our Terms of Service',
          ]}
        />
      </LegalSection>

      <LegalSection number={5} title="What other members can see">
        <p>
          Your profile, including your name, age, photos, bio, interests and city or country, is visible to other
          members. Your messages are visible to the members you send them to. Your email address, date of birth,
          payment information and verification selfie are never shown to other members.
        </p>
      </LegalSection>

      <LegalSection number={6} title="How we share information">
        <p>We share information only as described here:</p>
        <LegalList
          items={[
            'With service providers who help us run DripLove, under contracts that limit how they can use it: Supabase (hosting, database and storage), Amazon Web Services (profile verification), Google Firebase and Apple (push notifications), our email providers, and Apple, Google and Paystack (sign-in and payments).',
            'With other members, as described in section 5.',
            'When required by law, or when needed to protect the safety, rights or property of our members, the public or DripLove.',
            'With a buyer or successor if DripLove is involved in a merger, acquisition or sale of assets.',
            'With your permission, for any other purpose.',
          ]}
        />
      </LegalSection>

      <LegalSection number={7} title="How we protect your information">
        <p>
          Information is encrypted in transit using TLS and encrypted at rest by our hosting provider. Access to
          personal information is restricted to the people and systems that need it to run the Service. No method
          of storing or sending information is completely secure, but we work hard to protect yours.
        </p>
      </LegalSection>

      <LegalSection number={8} title="How long we keep information">
        <p>
          We keep your information while your account is active. When you delete your account, we remove your
          personal information from our active systems within 30 days, and your face template as soon as you delete
          your account. We may keep limited information for longer where we need to for legal, safety or fraud
          prevention reasons, such as payment records or records of accounts removed for breaking our Terms.
        </p>
      </LegalSection>

      <LegalSection number={9} title="Your rights and choices">
        <p>Depending on where you live, you may have the right to:</p>
        <LegalList
          items={[
            'Access the personal information we hold about you',
            'Correct information that is inaccurate',
            'Delete your account and personal information (you can do this in your profile settings)',
            'Receive a copy of your information in a portable format',
            'Object to or restrict certain uses of your information',
            'Withdraw consent you have given us, such as for location or verification',
          ]}
        />
        <p>
          You can also turn off push notifications and location access in your device settings, and unsubscribe
          from marketing emails using the link in any email. To exercise any of these rights, contact us at the
          address below. You also have the right to complain to your local data protection authority.
        </p>
      </LegalSection>

      <LegalSection number={10} title="International transfers">
        <p>
          DripLove is operated from the United States and used around the world. If you use DripLove from outside
          the US, your information is transferred to and processed in the United States and in other countries
          where our service providers operate. Where the law requires it, for example for the European Economic
          Area, the United Kingdom and Switzerland, we rely on safeguards such as the European Commission's Standard
          Contractual Clauses.
        </p>
      </LegalSection>

      <LegalSection number={11} title="Regional privacy notices">
        <LegalSubheading>European Economic Area, United Kingdom and Switzerland</LegalSubheading>
        <p>We process your personal information on these legal bases:</p>
        <LegalList
          items={[
            'Contract: to provide DripLove, including your profile, matching, messaging and Premium.',
            'Legitimate interests: to keep DripLove safe, prevent fraud and abuse, and improve the Service.',
            'Consent: for profile verification (face data), device location and marketing messages. You can withdraw consent at any time.',
            'Legal obligation: where we must keep or disclose information by law.',
          ]}
        />
        <p>
          You have the rights described in section 9, and the right to lodge a complaint with your local data
          protection authority.
        </p>

        <LegalSubheading>United States: state privacy rights</LegalSubheading>
        <p>
          If you live in California, Colorado, Connecticut, Oregon, Texas, Utah, Virginia or another state with a
          consumer privacy law, you may have the right to know what personal information we collect and how we use
          it, to access, correct, delete or receive a copy of it, and to opt out of its sale, sharing for targeted
          advertising or profiling. We do not sell your personal information or share it for targeted advertising.
        </p>
        <p>
          Some information we process is considered sensitive: your face template if you verify your profile, your
          device location if you share it, and the gender and preferences you choose to show. We use it only to
          provide and secure DripLove, never to profile you for advertising. To make a request, email us; you can
          also use an authorised agent. We will not treat you differently for exercising your rights. If we deny a
          request, you can appeal by replying to our decision, and if you are not satisfied you can contact your
          state attorney general.
        </p>

        <LegalSubheading>Consumer health data (Washington, Nevada and similar laws)</LegalSubheading>
        <p>
          Under laws like Washington's My Health My Data Act, some information can count as consumer health data.
          On DripLove that is mainly the face template created when you verify your profile (biometric data), plus
          any health-related details you choose to add to your profile. We collect it only with your consent, use it
          only to verify your profile and keep DripLove safe, share it only with Amazon Web Services as our service
          provider, and never sell it. You can access or delete it, or withdraw consent by deleting your account.
        </p>
      </LegalSection>

      <LegalSection number={12} title="Children">
        <p>
          DripLove is only for adults aged 18 and over. We do not knowingly collect information from anyone under
          18. If we learn that someone under 18 has an account, we will delete it.
        </p>
      </LegalSection>

      <LegalSection number={13} title="Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. If we make significant changes, we will let you know
          in the app or by email, and ask for your consent where the law requires it.
        </p>
      </LegalSection>

      <LegalSection number={14} title="Contact us">
        <p>Questions about your privacy or this policy? Contact our privacy team.</p>
        <ContactCard team="Privacy Team" />
      </LegalSection>
    </LegalPage>
  );
};

export default PrivacyPolicy;
