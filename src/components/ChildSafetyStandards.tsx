import React from 'react';
import {
  ContactCard,
  LegalList,
  LegalPage,
  LegalSection,
} from '@/components/legal/LegalPage';
import { LEGAL_LAST_UPDATED } from '@/components/legal/legalInfo';

interface ChildSafetyStandardsProps {
  onBack: () => void;
}

// Published child safety standards (required for dating apps on Google Play).
const ChildSafetyStandards = ({ onBack }: ChildSafetyStandardsProps) => (
  <LegalPage
    title="Child Safety Standards"
    updated={LEGAL_LAST_UPDATED}
    onBack={onBack}
    intro={
      <p>
        DripLove is for adults only. We have zero tolerance for child sexual abuse and exploitation (CSAE) of any
        kind. These standards explain how The ScREAte prevents, detects and responds to it on DripLove.
      </p>
    }
  >
    <LegalSection number={1} title="What we prohibit">
      <p>The following are strictly forbidden on DripLove and lead to an immediate, permanent ban:</p>
      <LegalList
        items={[
          'Child sexual abuse material (CSAM) of any kind, including drawn, generated or edited images',
          'Grooming, or any attempt to build a relationship with a minor for sexual purposes',
          'Sexual solicitation of a minor, or sexual conversations with a minor',
          'Sextortion or any threat involving sexual images of a minor',
          'Child trafficking, or promoting or facilitating the exploitation of a child',
          'Anyone under 18 using DripLove',
        ]}
      />
    </LegalSection>

    <LegalSection number={2} title="How we prevent and detect it">
      <LegalList
        items={[
          'Everyone must be 18 or older. We collect date of birth at sign-up and remove any account we believe belongs to someone under 18.',
          'Photos are checked automatically and reviewed by our team, and members can verify their profile with a selfie.',
          'Every profile and conversation has in-app tools to report and block.',
          'Our team reviews reports and prioritises anything involving the safety of a child.',
        ]}
      />
    </LegalSection>

    <LegalSection number={3} title="How we respond">
      <LegalList
        items={[
          'We remove the content and permanently ban the accounts involved.',
          'We preserve relevant information as required by law.',
          'We report CSAM and child exploitation to the relevant authorities, including the National Center for Missing & Exploited Children (NCMEC) where applicable, and cooperate fully with law enforcement.',
        ]}
      />
    </LegalSection>

    <LegalSection number={4} title="How to report a concern">
      <p>
        Use the report button on the person's profile or in your conversation. You can also email our child safety
        contact directly, with "Child Safety" in the subject line. If a child is in immediate danger, contact your
        local police or emergency services first.
      </p>
      <ContactCard team="Child Safety Contact" />
    </LegalSection>

    <LegalSection number={5} title="Compliance">
      <p>
        DripLove complies with applicable child safety laws in the countries where it operates, and with the child
        safety policies of the Apple App Store and Google Play.
      </p>
    </LegalSection>
  </LegalPage>
);

export default ChildSafetyStandards;
