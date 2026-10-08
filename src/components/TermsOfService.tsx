import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContactCard,
  LegalList,
  LegalPage,
  LegalPart,
  LegalSection,
  LegalSubheading,
  PolicyLink,
} from '@/components/legal/LegalPage';
import { COMPANY, LEGAL_LAST_UPDATED } from '@/components/legal/legalInfo';

interface TermsOfServiceProps {
  onBack: () => void;
}

// Conspicuous (capitalised) clauses, as is standard for the terms courts expect users to notice.
const Conspicuous = ({ children }: { children: React.ReactNode }) => (
  <p className="font-semibold text-neutral-100">{children}</p>
);

const TermsOfService = ({ onBack }: TermsOfServiceProps) => {
  const { t } = useTranslation();

  return (
    <LegalPage
      title={t('termsOfService.title')}
      updated={LEGAL_LAST_UPDATED}
      onBack={onBack}
      contents
      intro={
        <>
          <p>
            These Terms of Service (the "Terms") constitute a legally binding agreement between you and{' '}
            {COMPANY.name} ("DripLove," "we," "us," or "our") governing your access to and use of the DripLove mobile
            application, website and related services (collectively, the "Service"). By creating an account or
            otherwise accessing or using the Service, you acknowledge that you have read, understood and agree to be
            bound by these Terms, our <PolicyLink to="/privacy-policy">Privacy Policy</PolicyLink>, our{' '}
            <PolicyLink to="/community-guidelines">Community Guidelines</PolicyLink> and our{' '}
            <PolicyLink to="/child-safety">Child Safety Standards</PolicyLink>, each of which is incorporated into
            these Terms by reference. If you do not agree, you may not access or use the Service.
          </p>
          <p className="rounded-lg border border-white/15 p-4 text-[13px] font-semibold leading-relaxed text-neutral-100">
            IMPORTANT NOTICE: YOU ARE SOLELY RESPONSIBLE FOR YOUR OWN SAFETY AND FOR YOUR CONDUCT TOWARDS OTHER
            MEMBERS (PART II). DRIPLOVE DOES NOT CONDUCT CRIMINAL BACKGROUND CHECKS. THESE TERMS ALSO CONTAIN A BINDING
            ARBITRATION AGREEMENT AND A WAIVER OF CLASS ACTIONS AND JURY TRIALS (SECTION 22). UNLESS YOU OPT OUT AS
            PROVIDED IN SECTION 22, DISPUTES BETWEEN YOU AND DRIPLOVE WILL BE RESOLVED BY BINDING, INDIVIDUAL
            ARBITRATION.
          </p>
        </>
      }
    >
      {/* ------------------------------------------------------------------ */}
      <LegalPart numeral="I" title="The Agreement">
        <LegalSection number={1} title="Acceptance of Terms">
          <p>
            By registering for, accessing or using the Service, you accept these Terms on your own behalf. These Terms
            apply to all features of the Service, including features introduced after you first accept them.
          </p>
        </LegalSection>

        <LegalSection number={2} title="Eligibility">
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
          <p>You may maintain only one (1) account.</p>
        </LegalSection>

        <LegalSection number={3} title="Account Registration and Security">
          <p>
            You agree to provide accurate, current and complete information and to keep it up to date. You are
            responsible for maintaining the confidentiality of your login credentials and for all activities that
            occur under your account. You shall notify us immediately of any unauthorised access to or use of your
            account. You may not transfer, sell or share your account.
          </p>
        </LegalSection>
      </LegalPart>

      {/* ------------------------------------------------------------------ */}
      <LegalPart numeral="II" title="Your Safety and Responsibility">
        <LegalSection number={4} title="Your Safety Is Your Responsibility">
          <Conspicuous>
            YOU ARE SOLELY RESPONSIBLE FOR YOUR OWN SAFETY AND FOR YOUR INTERACTIONS WITH OTHER MEMBERS, BOTH ONLINE AND
            OFFLINE. DRIPLOVE DOES NOT SUPERVISE, CONTROL OR ACCEPT RESPONSIBILITY FOR THE CONDUCT OF ANY MEMBER OR FOR
            ANY COMMUNICATION, MEETING OR RELATIONSHIP BETWEEN MEMBERS.
          </Conspicuous>
          <p>You agree to exercise caution and sound judgment in all interactions and, in particular, to:</p>
          <LegalList
            items={[
              <>
                review and follow our <PolicyLink to="/safety-tips">Safety Tips</PolicyLink> before communicating
                with or meeting any member;
              </>,
              'protect your personal information, including your address, workplace, routine and financial details;',
              'never send money, gifts, cryptocurrency or financial information to any member;',
              'meet other members only in public places, inform a trusted person of your plans and arrange your own transport; and',
              'contact local emergency services immediately if you believe you or any other person is in danger.',
            ]}
          />
        </LegalSection>

        <LegalSection number={5} title="Your Responsibility to Other Members">
          <p>
            Every member shares responsibility for keeping DripLove safe. You are responsible for your conduct towards
            other members and agree to:
          </p>
          <LegalList
            items={[
              'treat every member with respect and courtesy, online and in person;',
              'obtain clear and freely given consent before sharing intimate content or engaging in any physical contact, and respect the withdrawal of consent at any time;',
              "respect a member's decision to decline, unmatch or end contact;",
              'never act in a manner that places another member at risk of physical, emotional or financial harm;',
              "never record, capture or distribute another member's image, voice, messages or personal information without their express consent; and",
              'report any member you reasonably believe poses a risk to others.',
            ]}
          />
          <p>
            You are liable for any harm you cause to another member, and DripLove may cooperate with law enforcement
            and affected members in connection with any such harm.
          </p>
        </LegalSection>

        <LegalSection number={6} title="No Background Checks; Profile Verification">
          <Conspicuous>
            DRIPLOVE DOES NOT CONDUCT CRIMINAL BACKGROUND CHECKS OR SCREENINGS OF ITS MEMBERS, DOES NOT INQUIRE INTO THE
            BACKGROUNDS OF ITS MEMBERS, AND DOES NOT VERIFY THE STATEMENTS OF ITS MEMBERS.
          </Conspicuous>
          <p>
            Members may verify their profile by submitting a selfie. A verification badge indicates only that the
            selfie matched the profile photographs at the time of verification. It is not a representation,
            warranty or guarantee of any member's identity, character, intentions or conduct.
          </p>
        </LegalSection>

        <LegalSection number={7} title="Reporting, Investigation and Enforcement">
          <p>
            Members may report profiles, messages and conduct using the in-app reporting tools. Reports are
            confidential. DripLove may, in its sole discretion and without notice or liability, investigate any report
            or suspected violation; remove content; issue warnings; restrict features; suspend or permanently terminate
            accounts; preserve information; and disclose information to law enforcement or other authorities where
            required by law or where we believe disclosure is necessary to protect any person. Where appropriate, you
            may request a review of an enforcement decision by contacting us at {COMPANY.email}.
          </p>
        </LegalSection>
      </LegalPart>

      {/* ------------------------------------------------------------------ */}
      <LegalPart numeral="III" title="Use of the Service">
        <LegalSection number={8} title="Licence to Use the Service">
          <p>
            Subject to your compliance with these Terms, DripLove grants you a personal, worldwide, revocable,
            non-exclusive, non-transferable and non-sublicensable licence to access and use the Service for your
            personal, non-commercial use. This licence terminates upon termination of your account or of these Terms.
          </p>
        </LegalSection>

        <LegalSection number={9} title="Prohibited Conduct">
          <p>
            You shall comply with these Terms, the{' '}
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
              'use the Service for any commercial purpose, advertising or solicitation other than through our Advertising Services or the Promoter Program;',
              "disclose another person's personal information without their consent;",
              'use any robot, scraper or other automated means to access the Service, or reverse engineer any part of it; or',
              'circumvent, disable or interfere with any security, safety or access-control feature of the Service.',
            ]}
          />
        </LegalSection>

        <LegalSection number={10} title="Member Content">
          <p>
            You retain ownership of the photographs, text, messages and other content you submit to the Service
            ("Member Content"). You grant DripLove a worldwide, non-exclusive, royalty-free, transferable and
            sublicensable licence to host, store, use, reproduce, display and distribute Member Content in
            connection with operating, improving and promoting the Service. This licence ends when you delete the
            Member Content or your account, except for content already shared with other members or retained as
            required by law.
          </p>
          <p>
            You represent and warrant that you own or have all rights necessary to submit your Member Content and
            that it does not violate these Terms, any law or the rights of any third party. We are not obligated to
            monitor Member Content but may screen, review and remove it at any time, by automated means or
            otherwise.
          </p>
        </LegalSection>

        <LegalSection number={11} title="Messaging, Video Calls and Interactive Features">
          <LegalList
            items={[
              'Messaging. Members may exchange messages and photographs with their matches. Matches and conversations may expire after a period of inactivity determined by DripLove.',
              'Video calls. Certain features, including Circle Up, connect members by live video in real time. DripLove does not record video calls. You shall not record, capture, stream or distribute any call, or the image or voice of any participant, without the express consent of every participant.',
              'Screen protection. The Service may restrict screenshots and screen recordings on certain screens. This does not prevent all capture, and you remain responsible for what you share.',
              'Games and interactive features. Games and similar features are provided for entertainment and to help members connect, and may be changed or withdrawn at any time.',
            ]}
          />
        </LegalSection>

        <LegalSection number={12} title="Communications">
          <p>
            You consent to receive push notifications, emails and in-app messages relating to your account, member
            activity, safety and security, and offers relating to the Service. You may disable push notifications in
            your device settings and opt out of marketing emails using the unsubscribe link provided. We may continue
            to send communications necessary for the operation and security of your account.
          </p>
        </LegalSection>
      </LegalPart>

      {/* ------------------------------------------------------------------ */}
      <LegalPart numeral="IV" title="Paid Services and Programs">
        <LegalSection number={13} title="Premium Subscriptions">
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

        <LegalSection number={14} title="Advertising Services">
          <p>
            Members may purchase advertising campaigns displayed within the Service ("Advertising Services"). The full
            campaign budget is charged when a campaign is launched. All advertisements are subject to review and
            approval and must comply with these Terms, our advertising guidelines and all applicable laws. DripLove
            may reject, pause or remove any advertisement at any time. Impression estimates are not guaranteed.
            Advertising fees are non-refundable except as required by law or as DripLove determines in its sole
            discretion. Advertisers are solely responsible for their advertisements and for the products, services
            and claims they promote.
          </p>
        </LegalSection>

        <LegalSection number={15} title="Promoter Program">
          <p>
            DripLove may invite members to participate in its promoter program, under which participants may earn
            commissions on qualifying purchases made through their referral links, on the terms communicated at
            enrolment. Commission rates, eligibility and duration are determined by DripLove and may be changed,
            suspended or discontinued at any time. Commissions are payable only on genuine, completed and
            non-refunded purchases. Self-referrals, fraudulent or incentivised referrals, and misleading promotion are
            prohibited and result in forfeiture of all commissions and removal from the program. Participants act as
            independent contractors, are solely responsible for any taxes on their earnings, and must clearly
            disclose their relationship with DripLove and comply with all applicable advertising and consumer
            protection laws.
          </p>
        </LegalSection>
      </LegalPart>

      {/* ------------------------------------------------------------------ */}
      <LegalPart numeral="V" title="Intellectual Property">
        <LegalSection number={16} title="Ownership of the Service">
          <p>
            The Service, including the DripLove name, logos, designs, software and all content other than Member
            Content, is owned by {COMPANY.name} and protected by intellectual property laws. You may not copy,
            modify, distribute or create derivative works of any part of the Service without our prior written
            consent. Any feedback you provide may be used by DripLove without restriction or compensation.
          </p>
        </LegalSection>

        <LegalSection number={17} title="Copyright Infringement">
          <p>
            We respond to notices of alleged copyright infringement in accordance with the Digital Millennium
            Copyright Act. To submit a notice, email {COMPANY.email} with: (a) identification of the copyrighted work;
            (b) identification of the infringing material and its location on the Service; (c) your name, address,
            telephone number and email address; (d) a statement that you have a good-faith belief that the use is not
            authorised by the copyright owner, its agent or the law; (e) a statement, under penalty of perjury, that
            the information in your notice is accurate and that you are the owner or authorised to act on the
            owner's behalf; and (f) your physical or electronic signature. We will terminate the accounts of repeat
            infringers.
          </p>
        </LegalSection>
      </LegalPart>

      {/* ------------------------------------------------------------------ */}
      <LegalPart numeral="VI" title="Disclaimers, Release and Liability">
        <LegalSection number={18} title="Disclaimer of Warranties">
          <Conspicuous>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE." TO THE FULLEST EXTENT PERMITTED BY LAW, DRIPLOVE
            DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. DRIPLOVE DOES NOT WARRANT THAT THE SERVICE WILL BE
            UNINTERRUPTED, SECURE OR ERROR-FREE, THAT YOU WILL FIND A MATCH, OR THAT ANY INFORMATION PROVIDED BY
            MEMBERS IS ACCURATE.
          </Conspicuous>
        </LegalSection>

        <LegalSection number={19} title="Assumption of Risk and Release">
          <Conspicuous>
            YOU UNDERSTAND AND ACKNOWLEDGE THAT COMMUNICATING AND MEETING WITH PEOPLE YOU DO NOT KNOW INVOLVES INHERENT
            RISKS, AND YOU VOLUNTARILY ASSUME ALL SUCH RISKS. TO THE FULLEST EXTENT PERMITTED BY LAW, YOU RELEASE{' '}
            {COMPANY.name.toUpperCase()} AND ITS AFFILIATES, OFFICERS, EMPLOYEES AND AGENTS FROM ANY CLAIMS, DEMANDS,
            DAMAGES AND LIABILITIES OF EVERY KIND, KNOWN OR UNKNOWN, ARISING OUT OF OR RELATING TO ANY DISPUTE OR
            INTERACTION BETWEEN YOU AND ANY OTHER MEMBER OR THIRD PARTY, AND YOU WAIVE THE BENEFIT OF ANY LAW THAT
            WOULD OTHERWISE LIMIT THIS RELEASE TO CLAIMS KNOWN OR SUSPECTED AT THE TIME OF RELEASE.
          </Conspicuous>
        </LegalSection>

        <LegalSection number={20} title="Limitation of Liability">
          <Conspicuous>
            TO THE FULLEST EXTENT PERMITTED BY LAW, IN NO EVENT SHALL {COMPANY.name.toUpperCase()}, ITS AFFILIATES,
            OFFICERS, EMPLOYEES OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR
            PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA OR GOODWILL, ARISING OUT OF OR RELATING TO THE SERVICE
            OR THE CONDUCT OF ANY MEMBER, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR AGGREGATE LIABILITY
            FOR ALL CLAIMS RELATING TO THE SERVICE SHALL NOT EXCEED THE GREATER OF THE AMOUNT YOU PAID TO DRIPLOVE IN
            THE TWELVE (12) MONTHS PRECEDING THE CLAIM OR ONE HUNDRED U.S. DOLLARS (US$100).
          </Conspicuous>
          <p>
            Some jurisdictions do not allow the exclusion or limitation of certain warranties or damages, so some of
            the above may not apply to you.
          </p>
        </LegalSection>

        <LegalSection number={21} title="Indemnification">
          <p>
            You agree to defend, indemnify and hold harmless {COMPANY.name} and its affiliates, officers, employees
            and agents from any claims, liabilities, damages, losses and expenses, including reasonable attorneys'
            fees, arising out of or relating to your use of the Service, your Member Content, your conduct towards
            other members or any third party, or your breach of these Terms.
          </p>
        </LegalSection>
      </LegalPart>

      {/* ------------------------------------------------------------------ */}
      <LegalPart numeral="VII" title="Dispute Resolution">
        <LegalSection number={22} title="Informal Resolution; Arbitration; Class Action Waiver">
          <LegalSubheading>22.1 Informal Resolution</LegalSubheading>
          <p>
            Before initiating any proceeding, you agree to first contact us at {COMPANY.email} with a written
            description of your claim. The parties shall attempt in good faith to resolve the dispute informally for
            sixty (60) days.
          </p>
          <LegalSubheading>22.2 Binding Arbitration</LegalSubheading>
          <Conspicuous>
            EXCEPT WHERE PROHIBITED BY APPLICABLE LAW, YOU AND DRIPLOVE AGREE THAT ANY DISPUTE, CLAIM OR CONTROVERSY
            ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE SHALL BE RESOLVED EXCLUSIVELY BY FINAL AND
            BINDING ARBITRATION ON AN INDIVIDUAL BASIS.
          </Conspicuous>
          <p>
            The arbitration shall be administered by the American Arbitration Association under its Consumer
            Arbitration Rules and governed by the Federal Arbitration Act. The arbitration shall take place in the
            county in which you reside or by video conference, and fees shall be allocated in accordance with those
            rules. Either party may instead bring an individual claim in small claims court, and either party may
            seek injunctive relief in court to prevent the infringement or misappropriation of intellectual property.
          </p>
          <LegalSubheading>22.3 Class Action and Jury Trial Waiver</LegalSubheading>
          <Conspicuous>
            YOU AND DRIPLOVE EACH AGREE THAT CLAIMS MAY BE BROUGHT ONLY IN AN INDIVIDUAL CAPACITY AND NOT AS A
            PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE OR REPRESENTATIVE PROCEEDING. YOU AND
            DRIPLOVE EACH WAIVE THE RIGHT TO A TRIAL BY JURY.
          </Conspicuous>
          <LegalSubheading>22.4 Opt-Out</LegalSubheading>
          <p>
            You may opt out of this arbitration agreement by sending written notice to {COMPANY.email}, with the
            subject line "Arbitration Opt-Out" and stating your name and the email address associated with your
            account, within thirty (30) days of first accepting these Terms. Opting out does not affect any other
            provision of these Terms.
          </p>
          <LegalSubheading>22.5 Severability</LegalSubheading>
          <p>
            If any portion of this Section 22 is found unenforceable, the remainder shall remain in effect, provided
            that if the class action waiver is found unenforceable as to any claim, that claim shall proceed in court
            and not in arbitration.
          </p>
        </LegalSection>

        <LegalSection number={23} title="Governing Law and Venue">
          <p>
            These Terms and any dispute arising out of or relating to them or the Service shall be governed by the
            laws of the jurisdiction in which {COMPANY.name} is organised, without regard to its conflict of laws
            principles, and, with respect to Section 22, by the Federal Arbitration Act. Any claim not subject to
            arbitration shall be brought exclusively in the courts of competent jurisdiction located in that
            jurisdiction, and you consent to their personal jurisdiction. Nothing in these Terms limits any rights
            you may have under mandatory consumer protection laws that apply to you.
          </p>
        </LegalSection>
      </LegalPart>

      {/* ------------------------------------------------------------------ */}
      <LegalPart numeral="VIII" title="General Terms">
        <LegalSection number={24} title="Third-Party Services and App Stores">
          <p>
            The Service relies on, and may link to, services provided by third parties, which are governed by their
            own terms and for which DripLove is not responsible. If you downloaded the Service from the Apple App
            Store, you acknowledge that these Terms are between you and DripLove only, not Apple Inc. ("Apple"); Apple
            has no obligation to provide maintenance or support for the Service and is not responsible for any claims
            relating to it; and Apple and its subsidiaries are third-party beneficiaries of these Terms with the right
            to enforce them against you. If you downloaded the Service from Google Play, your use is also subject to
            the Google Play Terms of Service.
          </p>
        </LegalSection>

        <LegalSection number={25} title="Termination">
          <p>
            You may delete your account at any time through your profile settings. We may suspend or terminate your
            access to the Service at any time, with or without notice, if we believe you have violated these Terms,
            created risk or possible legal exposure for DripLove or its members, or where required by law. Sections
            4 through 7, 10, 14 through 23 and 27 survive any termination of these Terms.
          </p>
        </LegalSection>

        <LegalSection number={26} title="Modifications">
          <p>
            We may modify these Terms at any time. We will provide notice of material changes in the Service or by
            email at least fourteen (14) days before they take effect, except where a change is required by law or
            necessary to protect the safety of members. Your continued use of the Service after the effective date
            constitutes acceptance of the modified Terms. If you do not agree, you must stop using the Service and
            delete your account.
          </p>
        </LegalSection>

        <LegalSection number={27} title="General Provisions">
          <p>
            These Terms, together with the documents incorporated by reference, constitute the entire agreement
            between you and DripLove regarding the Service. If any provision is held invalid or unenforceable, the
            remaining provisions shall remain in full force and effect. Our failure to enforce any provision is not a
            waiver of it. You may not assign or transfer these Terms without our prior written consent; we may assign
            them without restriction, including in connection with a merger, acquisition or sale of assets. DripLove
            shall not be liable for any failure or delay caused by events beyond its reasonable control. Notices to
            you may be provided through the Service or by email.
          </p>
        </LegalSection>

        <LegalSection number={28} title="Contact">
          <p>Questions regarding these Terms, legal notices and requests from authorities may be directed to:</p>
          <ContactCard team="Legal" />
        </LegalSection>
      </LegalPart>
    </LegalPage>
  );
};

export default TermsOfService;
