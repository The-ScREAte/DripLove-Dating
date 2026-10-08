import React from 'react';
import {
  ContactCard,
  LegalList,
  LegalPage,
  LegalSection,
  PolicyLink,
} from '@/components/legal/LegalPage';
import { LEGAL_LAST_UPDATED } from '@/components/legal/legalInfo';

interface SafetyTipsProps {
  onBack: () => void;
}

const SafetyTips = ({ onBack }: SafetyTipsProps) => (
  <LegalPage
    title="Safety Tips"
    updated={LEGAL_LAST_UPDATED}
    onBack={onBack}
    intro={
      <p>
        Meeting new people should be exciting, not risky. Most people on DripLove are here for the same reason you
        are, but it is always smart to take a few simple precautions. DripLove does not run criminal background
        checks, so trust your instincts and use these tips.
      </p>
    }
  >
    <LegalSection number={1} title="Getting to know someone online">
      <LegalList
        items={[
          'Keep conversations in the DripLove app until you feel comfortable. Our reporting tools work here.',
          'Look for the verification badge, and ask for a video call before meeting.',
          'Protect your personal information: your home or work address, daily routine and financial details.',
          'Never send money, gift cards or cryptocurrency, or share bank details, however convincing the story.',
          'Be wary of anyone who avoids video calls, moves very fast, or quickly asks to talk on another app.',
        ]}
      />
    </LegalSection>

    <LegalSection number={2} title="Meeting in person">
      <LegalList
        items={[
          'Meet in a busy public place, like a café or restaurant, and stay in public for the first few dates.',
          'Tell a friend or family member who you are meeting, where and when, and check in with them.',
          'Arrange your own transport so you can leave whenever you want.',
          'Keep your phone charged and with you.',
          'Know your limits with alcohol, and never leave your drink unattended.',
          'If something feels wrong, leave. You never owe anyone an explanation.',
        ]}
      />
    </LegalSection>

    <LegalSection number={3} title="Travelling or meeting someone from another country">
      <LegalList
        items={[
          'Spend time getting to know them through video calls before making any travel plans.',
          'Pay for your own travel and accommodation, and share your itinerary with someone you trust.',
          'Never send money for visas, tickets, customs fees or emergencies. These are common scams.',
        ]}
      />
    </LegalSection>

    <LegalSection number={4} title="Reporting and getting help">
      <p>
        Report anyone who makes you uncomfortable, asks for money or breaks our{' '}
        <PolicyLink to="/community-guidelines">Community Guidelines</PolicyLink>. Use the report button on their
        profile or in your conversation. Reports are confidential. If you are in immediate danger, contact your local
        police or emergency services first.
      </p>
      <ContactCard team="Trust & Safety" />
    </LegalSection>
  </LegalPage>
);

export default SafetyTips;
