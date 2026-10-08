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
            These Terms of Service (the "Terms") constitute a legally binding agreement between you and{' '}
            {COMPANY.name} ("DripLove," "we," "us," or "our") governing your access to and use of the DripLove mobile
            application and website (collectively, the "Service"). By creating an account or otherwise accessing or
            using the Service, you acknowledge that you have read, understood and agree to be bound by these Terms,
            our <PolicyLink to="/privacy-policy">Privacy Policy</PolicyLink> and our{' '}
            <PolicyLink to="/community-guidelines">Community Guidelines</PolicyLink>, each of which is incorporated
            into these Terms by reference. If you do not agree to these Terms, you may not access or use the Service.
          </p>
          <p className="rounded-lg border border-white/15 p-4 text-[13px] font-semibold leading-relaxed text-neutral-100">
            IMPORTANT NOTICE: THESE TERMS CONTAIN A BINDING ARBITRATION AGREEMENT AND A WAIVER OF CLASS ACTIONS AND
            JURY TRIALS IN SECTION 15. UNLESS YOU OPT OUT AS PROVIDED IN SECTION 15, YOU AGREE THAT DISPUTES BETWEEN
            YOU AND DRIPLOVE WILL BE RESOLVED BY BINDING, INDIVIDUAL ARBITRATION.
          </p>
        </>
      }
    >
      <LegalSection number={1} title="Eligibility">
        <p>By accessing or using the Service, you represent and warrant that you:</p>
        <LegalList
          items={[
            'are at least eighteen (18) years of age;',
            'have the legal capacity to enter into a binding contract with DripLove;',
            'are not prohibited from using the Service under any applicable law;',
            'have never been convicted of a felony or indictable offence involving violence or a sexual offence, and are not required to register as a sex offender with any government authority; and',
            'have not previously been suspended or removed from the Service.',
          ]}
        />
        <p>You may maintain only one account.</p>
      </LegalSection>

      <LegalSection number={2} title="Account Security">
        <p>
          You are responsible for maintaining the confidentiality of your login credentials and for all activities
          that occur under your account. You agree to provide accurate and current information and to notify us
          immediately of any unauthorised access to or use of your account.
        </p>
      </LegalSection>

      <LegalSection number={3} title="Member Conduct">
        <p>
          You agree to comply with these Terms, the{' '}
          <PolicyLink to="/community-guidelines">Community Guidelines</PolicyLink>, the{' '}
          <PolicyLink to="/child-safety">Child Safety Standards</PolicyLink> and all applicable laws. Without
          limitation, you shall not:
        </p>
        <LegalList
          items={[
            'harass, threaten, stalk, intimidate, defame or abuse any person;',
            'post or transmit content that is hateful, discriminatory, violent, sexually explicit, obscene or unlawful;',
            'post, solicit or engage in any content or conduct that sexualises or endangers a minor;',
            'misrepresent your identity, age or affiliation, impersonate any person, or use images that are not of you;',
            'solicit money, gifts or financial information from any member, or engage in any fraudulent scheme;',
            'use the Service for any commercial purpose, advertising or solicitation other than through our advertising tools;',
            "disclose another person's personal information without their consent;",
            'use any robot, scraper or other automated means to access the Service; or',
            'circumvent, disable or interfere with any security, safety or access-control feature of the Service.',
          ]}
        />
        <p>
          We reserve the right, in our sole discretion and without notice or liability, to investigate any suspected
          violation, remove content, and suspend or terminate any account.
        </p>
      </LegalSection>

      <LegalSection number={4} title="Member Content">
        <p>
          You retain ownership of the photos, text and other content you submit to the Service ("Member Content").
          You grant DripLove a worldwide, non-exclusive, royalty-free, transferable and sublicensable licence to
          host, store, use, reproduce, display and distribute Member Content in connection with operating,
          improving and promoting the Service. This licence ends when you delete the Member Content or your
          account, except for content already shared with other members or retained as required by law.
        </p>
        <p>
          You represent and warrant that you own or have all necessary rights to your Member Content and that it
          does not violate these Terms or any law. We are not obligated to monitor Member Content but may review,
          screen and remove it at any time.
        </p>
      </LegalSection>

      <LegalSection number={5} title="Verification; No Background Checks">
        <p>
          Members may verify their profile by submitting a selfie. A verification badge indicates only that the
          selfie matched the profile photographs at the time of verification and is not a guarantee of any member's
          identity, character or intentions.
        </p>
        <p className="font-semibold text-neutral-100">
          DRIPLOVE DOES NOT CONDUCT CRIMINAL BACKGROUND CHECKS OR SCREENINGS OF ITS MEMBERS AND DOES NOT VERIFY THE
          STATEMENTS OF ITS MEMBERS. YOU ARE SOLELY RESPONSIBLE FOR YOUR INTERACTIONS WITH OTHER MEMBERS, BOTH ONLINE
          AND OFFLINE.
        </p>
        <p>
          Before meeting anyone in person, please review our <PolicyLink to="/safety-tips">Safety Tips</PolicyLink>.
        </p>
      </LegalSection>

      <LegalSection number={6} title="Subscriptions and Payments">
        <p>
          DripLove Premium is an optional paid subscription that currently includes unlimited daily swipes,
          unlimited reverse dislikes, the ability to see every member who liked you, reduced advertising, access to
          up to four (4) additional countries and priority support. Features are subject to change.
        </p>
        <LegalList
          items={[
            "Payments are processed by the Apple App Store, Google Play or Paystack, according to where you subscribe, and are subject to that provider's terms.",
            'AUTOMATIC RENEWAL: YOUR SUBSCRIPTION RENEWS AUTOMATICALLY AT THE END OF EACH SUBSCRIPTION PERIOD AT THE THEN-CURRENT PRICE UNLESS YOU CANCEL AT LEAST TWENTY-FOUR (24) HOURS BEFORE THE RENEWAL DATE.',
            'You may cancel through your App Store or Google Play account settings, or within the Service for Paystack subscriptions. Cancellation takes effect at the end of the current paid period.',
            'Deleting your account does not cancel a subscription purchased through the App Store or Google Play.',
            'Any free trial converts to a paid subscription at its end unless cancelled before the trial expires.',
            "Except as required by applicable law or the applicable app store's refund policy, all payments are non-refundable.",
            'We will notify you in advance of any price change, which will apply from your next renewal.',
          ]}
        />
      </LegalSection>

      <LegalSection number={7} title="Communications">
        <p>
          You consent to receive push notifications, emails and in-app messages relating to your account, member
          activity, safety and security, and offers relating to the Service. You may disable push notifications in
          your device settings and opt out of marketing emails using the unsubscribe link provided. We may continue
          to send communications necessary for the operation and security of your account.
        </p>
      </LegalSection>

      <LegalSection number={8} title="Advertising">
        <p>
          The Service may display advertisements, including advertisements submitted by members through our
          advertising tools. All advertisements are subject to our approval and may be rejected or removed at any
          time. DripLove is not responsible for any product, service or claim of any advertiser.
        </p>
      </LegalSection>

      <LegalSection number={9} title="Intellectual Property">
        <p>
          The Service, including the DripLove name, logos, designs, software and all content other than Member
          Content, is owned by {COMPANY.name} and protected by intellectual property laws. You may not copy,
          modify, distribute or create derivative works of any part of the Service without our prior written
          consent.
        </p>
      </LegalSection>

      <LegalSection number={10} title="Copyright Infringement">
        <p>
          We respond to notices of alleged copyright infringement in accordance with the Digital Millennium Copyright
          Act. To submit a notice, email {COMPANY.email} with: (a) identification of the copyrighted work; (b)
          identification of the infringing material and its location on the Service; (c) your name, address,
          telephone number and email address; (d) a statement that you have a good-faith belief that the use is not
          authorised by the copyright owner, its agent or the law; (e) a statement, under penalty of perjury, that
          the information in your notice is accurate and that you are the owner or authorised to act on the owner's
          behalf; and (f) your physical or electronic signature. We will terminate the accounts of repeat
          infringers.
        </p>
      </LegalSection>

      <LegalSection number={11} title="Termination">
        <p>
          You may delete your account at any time through your profile settings. We may suspend or terminate your
          access to the Service at any time, with or without notice, if we believe you have violated these Terms,
          created risk or possible legal exposure for DripLove or its members, or where required by law. Sections
          4, 9, 10 and 12 through 20 survive any termination of these Terms.
        </p>
      </LegalSection>

      <LegalSection number={12} title="Disclaimer of Warranties">
        <p className="font-semibold text-neutral-100">
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE." TO THE FULLEST EXTENT PERMITTED BY LAW, DRIPLOVE
          DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. DRIPLOVE DOES NOT WARRANT THAT THE SERVICE WILL BE
          UNINTERRUPTED, SECURE OR ERROR-FREE, THAT YOU WILL FIND A MATCH, OR THAT ANY INFORMATION PROVIDED BY
          MEMBERS IS ACCURATE. DRIPLOVE IS NOT RESPONSIBLE FOR THE CONDUCT OF ANY MEMBER, ONLINE OR OFFLINE.
        </p>
      </LegalSection>

      <LegalSection number={13} title="Limitation of Liability">
        <p className="font-semibold text-neutral-100">
          TO THE FULLEST EXTENT PERMITTED BY LAW, IN NO EVENT SHALL {COMPANY.name.toUpperCase()}, ITS AFFILIATES,
          OFFICERS, EMPLOYEES OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR
          PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA OR GOODWILL, ARISING OUT OF OR RELATING TO THE SERVICE
          OR YOUR INTERACTIONS WITH OTHER MEMBERS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR AGGREGATE
          LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE SHALL NOT EXCEED THE GREATER OF THE AMOUNT YOU PAID TO
          DRIPLOVE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM OR ONE HUNDRED U.S. DOLLARS (US$100).
        </p>
        <p>
          Some jurisdictions do not allow the exclusion or limitation of certain damages, so some of the above may
          not apply to you.
        </p>
      </LegalSection>

      <LegalSection number={14} title="Indemnification">
        <p>
          You agree to defend, indemnify and hold harmless {COMPANY.name} and its affiliates, officers, employees
          and agents from any claims, liabilities, damages, losses and expenses, including reasonable attorneys'
          fees, arising out of or relating to your use of the Service, your Member Content, your conduct towards
          other members or your breach of these Terms.
        </p>
      </LegalSection>

      <LegalSection number={15} title="Dispute Resolution; Arbitration; Class Action Waiver">
        <LegalSubheading>15.1 Informal Resolution</LegalSubheading>
        <p>
          Before initiating any proceeding, you agree to first contact us at {COMPANY.email} with a written
          description of your claim. The parties shall attempt in good faith to resolve the dispute informally for
          sixty (60) days.
        </p>
        <LegalSubheading>15.2 Binding Arbitration</LegalSubheading>
        <p className="font-semibold text-neutral-100">
          EXCEPT WHERE PROHIBITED BY APPLICABLE LAW, YOU AND DRIPLOVE AGREE THAT ANY DISPUTE, CLAIM OR CONTROVERSY
          ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE SHALL BE RESOLVED EXCLUSIVELY BY FINAL AND
          BINDING ARBITRATION ON AN INDIVIDUAL BASIS.
        </p>
        <p>
          The arbitration shall be administered by the American Arbitration Association under its Consumer
          Arbitration Rules and governed by the Federal Arbitration Act. The arbitration shall take place in the
          county in which you reside or by video conference, and fees shall be allocated in accordance with those
          rules. Either party may instead bring an individual claim in small claims court, and either party may seek
          injunctive relief in court to prevent the infringement or misappropriation of intellectual property.
        </p>
        <LegalSubheading>15.3 Class Action and Jury Trial Waiver</LegalSubheading>
        <p className="font-semibold text-neutral-100">
          YOU AND DRIPLOVE EACH AGREE THAT CLAIMS MAY BE BROUGHT ONLY IN AN INDIVIDUAL CAPACITY AND NOT AS A
          PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE OR REPRESENTATIVE PROCEEDING. YOU AND
          DRIPLOVE EACH WAIVE THE RIGHT TO A TRIAL BY JURY.
        </p>
        <LegalSubheading>15.4 Opt-Out</LegalSubheading>
        <p>
          You may opt out of this arbitration agreement by sending written notice to {COMPANY.email}, with the
          subject line "Arbitration Opt-Out" and stating your name and the email address associated with your
          account, within thirty (30) days of first accepting these Terms. Opting out does not affect any other
          provision of these Terms.
        </p>
        <LegalSubheading>15.5 Severability</LegalSubheading>
        <p>
          If any portion of this Section 15 is found unenforceable, the remainder shall remain in effect, provided
          that if the class action waiver is found unenforceable as to any claim, that claim shall proceed in court
          and not in arbitration.
        </p>
      </LegalSection>

      <LegalSection number={16} title="Governing Law and Venue">
        <p>
          These Terms and any dispute arising out of or relating to them or the Service shall be governed by the
          laws of the jurisdiction in which {COMPANY.name} is organised, without regard to its conflict of laws
          principles, and, with respect to Section 15, by the Federal Arbitration Act. Any claim not subject to
          arbitration shall be brought exclusively in the courts of competent jurisdiction located in that
          jurisdiction, and you consent to their personal jurisdiction. Nothing in these Terms limits any rights
          you may have under mandatory consumer protection laws that apply to you.
        </p>
      </LegalSection>

      <LegalSection number={17} title="Third-Party App Stores">
        <p>
          If you downloaded the Service from the Apple App Store, you acknowledge that these Terms are between you
          and DripLove only, not Apple Inc. ("Apple"); Apple has no obligation to provide maintenance or support for
          the Service and is not responsible for any claims relating to it; and Apple and its subsidiaries are
          third-party beneficiaries of these Terms with the right to enforce them against you. If you downloaded
          the Service from Google Play, your use is also subject to the Google Play Terms of Service.
        </p>
      </LegalSection>

      <LegalSection number={18} title="Modifications">
        <p>
          We may modify these Terms at any time. We will provide notice of material changes in the Service or by
          email at least fourteen (14) days before they take effect, except where a change is required by law or
          necessary to protect the safety of members. Your continued use of the Service after the effective date
          constitutes acceptance of the modified Terms. If you do not agree, you must stop using the Service and
          delete your account.
        </p>
      </LegalSection>

      <LegalSection number={19} title="General Provisions">
        <p>
          These Terms, together with the Privacy Policy, Community Guidelines and Child Safety Standards, constitute
          the entire agreement between you and DripLove regarding the Service. If any provision is held invalid or
          unenforceable, the remaining provisions shall remain in full force and effect. Our failure to enforce any
          provision is not a waiver of it. You may not assign or transfer these Terms without our prior written
          consent; we may assign them without restriction, including in connection with a merger, acquisition or
          sale of assets. Notices to you may be provided through the Service or by email.
        </p>
      </LegalSection>

      <LegalSection number={20} title="Contact">
        <p>
          Questions regarding these Terms, legal notices and requests from authorities may be directed to:
        </p>
        <ContactCard team="Legal" />
      </LegalSection>
    </LegalPage>
  );
};

export default TermsOfService;
