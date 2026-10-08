import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContactCard,
  LEGAL_LAST_UPDATED,
  LegalList,
  LegalPage,
  LegalSection,
} from '@/components/legal/LegalPage';

interface TermsOfServiceProps {
  onBack: () => void;
}

const TermsOfService = ({ onBack }: TermsOfServiceProps) => {
  const { t } = useTranslation();

  return (
    <LegalPage
      title={t('termsOfService.title')}
      updated={LEGAL_LAST_UPDATED}
      onBack={onBack}
      intro={
        <>
          <p>
            Welcome to DripLove. These Terms of Service ("Terms") are an agreement between you and The ScREAte Ltd
            ("DripLove", "we", "us") and govern your use of the DripLove app and website (the "Service").
          </p>
          <p>
            By creating an account or using the Service, you agree to these Terms and to our Privacy Policy. If you
            do not agree, please do not use DripLove.
          </p>
        </>
      }
    >
      <LegalSection number={1} title="Eligibility">
        <p>To use DripLove, you must:</p>
        <LegalList
          items={[
            'Be at least 18 years old',
            'Be legally able to enter into a binding agreement',
            'Not be prohibited from using the Service under any applicable law',
            'Not have been convicted of a violent or sexual offence',
            'Not have had a DripLove account removed by us for breaking these Terms',
          ]}
        />
        <p>You may have only one account.</p>
      </LegalSection>

      <LegalSection number={2} title="Your account">
        <p>
          Keep the information in your account accurate and up to date, and keep your sign-in details secure. You
          are responsible for everything that happens under your account. If you think someone else has accessed
          it, contact us right away.
        </p>
      </LegalSection>

      <LegalSection number={3} title="Community standards">
        <p>DripLove is built on respect. When using the Service, you agree not to:</p>
        <LegalList
          items={[
            'Harass, threaten, bully, stalk or intimidate anyone',
            'Post hateful, discriminatory, violent, sexually explicit or illegal content',
            'Share any content involving minors in a sexual or inappropriate way',
            'Create a fake profile, impersonate anyone, or use photos that are not of you',
            'Ask other members for money, gifts or financial information, or run any kind of scam',
            'Promote products or services, or send spam, outside our advertising tools',
            "Share other people's private information without their permission",
            'Use bots, scrapers or other automated means to access the Service',
            "Interfere with the Service's security or safety features",
          ]}
        />
        <p>
          We may remove content and suspend or close accounts that break these standards, with or without notice.
          Please report anything that concerns you using the in-app report tools.
        </p>
      </LegalSection>

      <LegalSection number={4} title="Your content">
        <p>
          You own the photos, text and other content you post. By posting it, you give us a worldwide,
          non-exclusive, royalty-free licence to host, store, display and distribute that content as needed to run,
          improve and promote the Service. This licence ends when you delete the content or your account, except
          where other members have already received it (for example, in messages) or we must keep it by law.
        </p>
        <p>
          You are responsible for what you post. Photos and profiles may be reviewed, automatically and by our
          team, and we may remove anything that breaks these Terms.
        </p>
      </LegalSection>

      <LegalSection number={5} title="Verification and safety">
        <p>
          You can verify your profile with a selfie. A verification badge means the selfie matched the person in
          the profile photos at the time of verification; it does not guarantee who someone is. DripLove does not
          conduct criminal background checks on members.
        </p>
        <p>
          You are responsible for your interactions with other members. Get to know people in the app first, meet
          in public places, tell a friend where you are going, and never send money to someone you have met online.
        </p>
      </LegalSection>

      <LegalSection number={6} title="Premium subscriptions and payments">
        <p>DripLove Premium is an optional paid subscription. It currently includes:</p>
        <LegalList
          items={[
            'Unlimited daily swipes',
            'Unlimited reverse dislikes',
            'See everyone who liked you',
            'Fewer ads',
            'Up to 4 additional countries to explore',
            'Priority support',
          ]}
        />
        <p>Features may change over time.</p>
        <LegalList
          items={[
            'Payments are processed by the Apple App Store, Google Play or Paystack, depending on where you subscribe.',
            'Subscriptions renew automatically at the end of each period unless you cancel at least 24 hours before renewal.',
            'Cancel through your App Store or Google Play account settings, or in DripLove for Paystack subscriptions. Your benefits continue until the end of the paid period.',
            'Deleting your account does not cancel an App Store or Google Play subscription. Please cancel it in your store settings.',
            'If a free trial is offered, it becomes a paid subscription when the trial ends unless you cancel before then.',
            "Payments are non-refundable except where required by law or by the app store's refund policy.",
            'If prices change, we will tell you in advance, and the new price applies from your next renewal.',
          ]}
        />
      </LegalSection>

      <LegalSection number={7} title="Notifications and emails">
        <p>
          We send push notifications and emails about activity on your account (such as likes, matches and
          messages), account and safety updates, and occasional suggestions and offers. You can turn off push
          notifications in your device settings and unsubscribe from marketing emails using the link in any
          email. We will still send messages that are essential to your account and security.
        </p>
      </LegalSection>

      <LegalSection number={8} title="Advertising">
        <p>
          The Service may show ads, including ads created by other members using DripLove's advertising tools.
          Ads must follow our advertising guidelines, and we may reject or remove any ad. We are not responsible
          for the products or services advertisers offer.
        </p>
      </LegalSection>

      <LegalSection number={9} title="Intellectual property">
        <p>
          The DripLove name, logo, design, software and all other parts of the Service, apart from content posted
          by members, belong to The ScREAte Ltd and are protected by law. You may not copy, modify or use them
          without our written permission.
        </p>
      </LegalSection>

      <LegalSection number={10} title="Ending your account">
        <p>
          You can delete your account at any time in your profile settings. We may suspend or close your account
          if you break these Terms, create risk for other members or for us, or where required by law. Sections
          that by their nature should continue after your account ends, such as Disclaimers and Limitation of
          Liability, will continue to apply.
        </p>
      </LegalSection>

      <LegalSection number={11} title="Disclaimers">
        <p>
          The Service is provided "as is" and "as available". We do not guarantee that you will find a match, that
          the Service will be uninterrupted or error-free, or that information provided by other members is
          accurate. We are not responsible for the conduct of any member, online or offline.
        </p>
      </LegalSection>

      <LegalSection number={12} title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, The ScREAte Ltd will not be liable for any indirect, incidental,
          special, consequential or punitive damages, or for any loss of data, profits or goodwill, arising from
          your use of the Service or your interactions with other members. Our total liability for any claim
          relating to the Service will not exceed the amount you paid us in the 12 months before the claim.
          Nothing in these Terms limits any rights you have that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection number={13} title="Indemnity">
        <p>
          You agree to compensate The ScREAte Ltd for any claims, losses or costs (including reasonable legal fees)
          arising from your breach of these Terms or your conduct towards other members.
        </p>
      </LegalSection>

      <LegalSection number={14} title="Governing law">
        <p>
          These Terms are governed by the laws of the country in which The ScREAte Ltd is registered. If you live
          in a country whose consumer protection laws give you additional rights, those rights still apply.
        </p>
      </LegalSection>

      <LegalSection number={15} title="Changes to these Terms">
        <p>
          We may update these Terms from time to time. If we make significant changes, we will let you know in
          the app or by email before they take effect. Continuing to use DripLove after that means you accept the
          updated Terms.
        </p>
      </LegalSection>

      <LegalSection number={16} title="Contact us">
        <p>Questions about these Terms? We're happy to help.</p>
        <ContactCard team="Support" />
      </LegalSection>
    </LegalPage>
  );
};

export default TermsOfService;
