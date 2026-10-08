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
            Welcome to DripLove. These Terms of Service ("Terms") are a legal agreement between you and {COMPANY.name}{' '}
            ("DripLove", "we", "us"), based in Rexburg, Idaho, United States. They govern your use of the DripLove app
            and website (the "Service").
          </p>
          <p>
            By creating an account or using the Service, you agree to these Terms, our{' '}
            <PolicyLink to="/privacy-policy">Privacy Policy</PolicyLink> and our{' '}
            <PolicyLink to="/community-guidelines">Community Guidelines</PolicyLink>. If you do not agree, please do
            not use DripLove.
          </p>
          <p className="rounded-xl border border-pink-500/30 bg-pink-500/[0.06] p-4 text-neutral-200">
            <strong className="text-white">Please read section 14 carefully.</strong> If you live in the United States,
            it requires you and DripLove to resolve disputes through individual binding arbitration rather than in
            court, and waives class actions and jury trials, unless you opt out within 30 days.
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
            'Not have been convicted of a violent or sexual offence, or be required to register as a sex offender',
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
        <p>
          DripLove is built on respect. You agree to follow our{' '}
          <PolicyLink to="/community-guidelines">Community Guidelines</PolicyLink>, and not to:
        </p>
        <LegalList
          items={[
            'Harass, threaten, bully, stalk or intimidate anyone',
            'Post hateful, discriminatory, violent, sexually explicit or illegal content',
            'Create a fake profile, impersonate anyone, or use photos that are not of you',
            'Ask other members for money, gifts or financial information, or run any kind of scam',
            'Promote products or services, or send spam, outside our advertising tools',
            "Share other people's private information without their permission",
            'Use bots, scrapers or other automated means to access the Service',
            "Interfere with the Service's security or safety features",
          ]}
        />
        <p>
          We have zero tolerance for child sexual abuse and exploitation. See our{' '}
          <PolicyLink to="/child-safety">Child Safety Standards</PolicyLink>.
        </p>
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
          the profile photos at the time of verification; it does not guarantee who someone is.{' '}
          <strong className="text-white">DripLove does not conduct criminal background checks on members.</strong>
        </p>
        <p>
          You are responsible for your interactions with other members, online and offline. Please read our{' '}
          <PolicyLink to="/safety-tips">Safety Tips</PolicyLink> before meeting anyone in person.
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
            "Payments are non-refundable except where required by law or by the app store's refund policy. Residents of some US states and other countries may have additional cancellation rights under local law.",
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
          by members, belong to {COMPANY.name} and are protected by law. You may not copy, modify or use them
          without our written permission.
        </p>
      </LegalSection>

      <LegalSection number={10} title="Copyright complaints">
        <p>
          We respect intellectual property rights and respond to notices under the US Digital Millennium Copyright
          Act (DMCA). If you believe content on DripLove infringes your copyright, email {COMPANY.email} with: a
          description of your work; where the content appears on DripLove; your name, address, phone number and
          email; a statement that you believe in good faith the use is not authorised; a statement, under penalty
          of perjury, that your notice is accurate and that you are the owner or authorised to act for the owner;
          and your physical or electronic signature. We remove infringing content and close the accounts of repeat
          infringers.
        </p>
      </LegalSection>

      <LegalSection number={11} title="Ending your account">
        <p>
          You can delete your account at any time in your profile settings. We may suspend or close your account
          if you break these Terms, create risk for other members or for us, or where required by law. Sections
          that by their nature should continue after your account ends, such as Disclaimers, Limitation of
          Liability and Dispute Resolution, will continue to apply.
        </p>
      </LegalSection>

      <LegalSection number={12} title="Disclaimers">
        <p>
          The Service is provided "as is" and "as available", without warranties of any kind, to the fullest
          extent permitted by law. We do not guarantee that you will find a match, that the Service will be
          uninterrupted or error-free, or that information provided by other members is accurate. We are not
          responsible for the conduct of any member, online or offline.
        </p>
      </LegalSection>

      <LegalSection number={13} title="Limitation of liability and indemnity">
        <p>
          To the fullest extent permitted by law, {COMPANY.name} will not be liable for any indirect, incidental,
          special, consequential or punitive damages, or for any loss of data, profits or goodwill, arising from
          your use of the Service or your interactions with other members. Our total liability for any claim
          relating to the Service will not exceed the greater of the amount you paid us in the 12 months before the
          claim or US$100. Nothing in these Terms limits any liability that cannot be limited by law.
        </p>
        <p>
          You agree to compensate {COMPANY.name} for any claims, losses or costs (including reasonable legal fees)
          arising from your breach of these Terms or your conduct towards other members.
        </p>
      </LegalSection>

      <LegalSection number={14} title="Dispute resolution, arbitration and class action waiver">
        <LegalSubheading>Let's talk first</LegalSubheading>
        <p>
          Most concerns can be solved quickly. Before starting any formal proceeding, contact us at {COMPANY.email}{' '}
          with a description of the issue, and we will try in good faith to resolve it within 60 days.
        </p>
        <LegalSubheading>Binding arbitration (United States)</LegalSubheading>
        <p>
          If you live in the United States and we cannot resolve a dispute informally, you and {COMPANY.name} agree
          that any dispute arising out of or relating to these Terms or the Service will be resolved by binding
          arbitration on an individual basis, administered by the American Arbitration Association (AAA) under its
          Consumer Arbitration Rules. The Federal Arbitration Act governs this agreement. The arbitration will take
          place in the county where you live or by video conference, and the AAA's fee rules for consumer
          disputes apply.
        </p>
        <p>
          Either of us may instead bring an individual claim in small claims court, and either of us may ask a court
          to stop the infringement or misuse of intellectual property.
        </p>
        <LegalSubheading>Class action and jury trial waiver</LegalSubheading>
        <p>
          You and {COMPANY.name} each agree to bring claims only in an individual capacity, and not as a plaintiff or
          class member in any class, collective or representative proceeding. You and we each waive the right to a
          jury trial.
        </p>
        <LegalSubheading>Your right to opt out</LegalSubheading>
        <p>
          You can opt out of this arbitration agreement by emailing {COMPANY.email} with the subject "Arbitration
          Opt-Out", your name and the email address on your account, within 30 days of first accepting these Terms.
          Opting out does not affect any other part of these Terms.
        </p>
        <p>
          If any part of this section is found to be unenforceable, the rest of it still applies, except that if the
          class action waiver is found unenforceable for a claim, that claim will proceed in court.
        </p>
      </LegalSection>

      <LegalSection number={15} title="Governing law">
        <p>
          These Terms are governed by the laws of the State of Idaho and applicable US federal law, without regard
          to conflict-of-law rules. Any claim that is not subject to arbitration will be brought exclusively in the
          state or federal courts located in Idaho, and you and we consent to their jurisdiction. If you live
          outside the United States, you keep the protection of any mandatory consumer laws of your country.
        </p>
      </LegalSection>

      <LegalSection number={16} title="Regional terms">
        <LegalList
          items={[
            `European Union, United Kingdom and Switzerland: nothing in these Terms limits your statutory rights as a consumer. For questions or complaints, including under the EU Digital Services Act, contact our point of contact at ${COMPANY.email}. You may also use your local courts and dispute resolution bodies.`,
            'Apple App Store: if you downloaded DripLove from the App Store, these Terms are between you and us, not Apple. Apple has no obligation to provide support or maintenance for DripLove and is not responsible for any claims relating to it, and Apple is a third-party beneficiary of these Terms.',
            'Google Play: your use of DripLove downloaded from Google Play is also subject to the Google Play Terms of Service.',
          ]}
        />
      </LegalSection>

      <LegalSection number={17} title="Changes to these Terms">
        <p>
          We may update these Terms from time to time. If we make significant changes, we will let you know in
          the app or by email at least 14 days before they take effect, unless a change is required by law or
          urgently needed to keep members safe. If you do not agree, you can delete your account before the changes
          take effect; continuing to use DripLove after that means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection number={18} title="General">
        <p>
          These Terms, together with our Privacy Policy and Community Guidelines, are the entire agreement between
          you and us about the Service. If any part is found unenforceable, the rest remains in effect. If we do not
          enforce a provision, that is not a waiver. You may not transfer these Terms; we may transfer them in
          connection with a merger, acquisition or sale of assets.
        </p>
      </LegalSection>

      <LegalSection number={19} title="Contact us">
        <p>Questions about these Terms? We're happy to help.</p>
        <ContactCard team="Support" />
      </LegalSection>
    </LegalPage>
  );
};

export default TermsOfService;
