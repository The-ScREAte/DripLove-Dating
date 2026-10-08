import React from 'react';
import {
  ContactCard,
  LegalList,
  LegalPage,
  LegalSection,
  PolicyLink,
} from '@/components/legal/LegalPage';
import { LEGAL_LAST_UPDATED } from '@/components/legal/legalInfo';

interface CommunityGuidelinesProps {
  onBack: () => void;
}

const CommunityGuidelines = ({ onBack }: CommunityGuidelinesProps) => (
  <LegalPage
    title="Community Guidelines"
    updated={LEGAL_LAST_UPDATED}
    onBack={onBack}
    intro={
      <>
        <p>
          DripLove is a place to meet people with kindness, honesty and respect. These guidelines describe what we
          expect from everyone in our community. They are part of our{' '}
          <PolicyLink to="/terms-of-service">Terms of Service</PolicyLink>, and breaking them can lead to content
          being removed or an account being banned.
        </p>
      </>
    }
  >
    <LegalSection number={1} title="Be yourself">
      <LegalList
        items={[
          'Use your real name or a name you are known by, your real age and recent photos of you.',
          'Your main photo should clearly show your face. No photos of other people, celebrities, cartoons or stock images.',
          'One account per person. Do not share or sell your account.',
        ]}
      />
    </LegalSection>

    <LegalSection number={2} title="Be respectful">
      <LegalList
        items={[
          'No harassment, bullying, threats or intimidation, on DripLove or anywhere else you take a conversation.',
          'No hate speech or attacks based on race, ethnicity, nationality, religion, gender, gender identity, sexual orientation, disability or age.',
          'No unwanted sexual messages or images. Consent matters, in words and in pictures.',
          'If someone stops replying or unmatches, let it go.',
        ]}
      />
    </LegalSection>

    <LegalSection number={3} title="Keep it appropriate">
      <LegalList
        items={[
          'No nudity, sexually explicit content or sexual services.',
          'No violent, graphic or shocking content.',
          'No content that promotes self-harm, illegal drugs or weapons.',
          <>
            Zero tolerance for anything that sexualises or endangers children. See our{' '}
            <PolicyLink to="/child-safety">Child Safety Standards</PolicyLink>.
          </>,
        ]}
      />
    </LegalSection>

    <LegalSection number={4} title="No scams, spam or selling">
      <LegalList
        items={[
          'Never ask members for money, gifts, cryptocurrency, investment or financial details.',
          'No promoting products, services, social accounts or other apps outside our advertising tools.',
          'No fake profiles, bots, catfishing or misleading links.',
        ]}
      />
    </LegalSection>

    <LegalSection number={5} title="Respect privacy">
      <LegalList
        items={[
          "Do not share other people's personal information, private photos or conversations without their permission.",
          'Do not record or screenshot video calls or chats to embarrass or threaten anyone.',
        ]}
      />
    </LegalSection>

    <LegalSection number={6} title="Stay within the law">
      <p>
        Do not use DripLove for anything illegal, including fraud, human trafficking, prostitution or the sale of
        illegal goods. We cooperate with law enforcement when the law requires it or when someone's safety is at
        risk.
      </p>
    </LegalSection>

    <LegalSection number={7} title="Reporting and enforcement">
      <p>
        If someone breaks these guidelines, please report them from their profile or your conversation; reports are
        confidential. Our team reviews reports and may warn members, remove content, or suspend or permanently ban
        accounts. Serious violations, especially anything involving a child or a threat to someone's safety, lead
        to an immediate ban. If you believe we got a decision wrong, contact us and we will take another look.
      </p>
      <ContactCard team="Trust & Safety" />
    </LegalSection>

    <LegalSection number={8} title="Stay safe">
      <p>
        Our <PolicyLink to="/safety-tips">Safety Tips</PolicyLink> explain how to get to know people safely online
        and when you meet in person.
      </p>
    </LegalSection>
  </LegalPage>
);

export default CommunityGuidelines;
