import React from 'react';
import { useTranslation } from 'react-i18next';
import { LegalList, LegalPage, LegalSection } from '@/components/legal/LegalPage';

interface AboutUsProps {
  onBack: () => void;
}

const VALUES = ['authenticity', 'inclusivity', 'safety', 'innovation'] as const;

const AboutUs = ({ onBack }: AboutUsProps) => {
  const { t } = useTranslation();
  const list = (key: string, count: number) => Array.from({ length: count }, (_, i) => t(`${key}.${i}`));

  return (
    <LegalPage
      title={t('aboutUs.title')}
      onBack={onBack}
      intro={
        <>
          <p>{t('aboutUs.sections.mission.content.0')}</p>
          <p>{t('aboutUs.sections.mission.content.1')}</p>
        </>
      }
    >
      <LegalSection title={t('aboutUs.sections.different.title')}>
        <p>{t('aboutUs.sections.different.intro')}</p>
        <LegalList items={list('aboutUs.sections.different.points', 5)} />
      </LegalSection>

      <LegalSection title={t('aboutUs.sections.community.title')}>
        <p>{t('aboutUs.sections.community.content.0')}</p>
        <p>{t('aboutUs.sections.community.content.1')}</p>
      </LegalSection>

      <LegalSection title={t('aboutUs.sections.values.title')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {VALUES.map((value) => (
            <div key={value} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="font-semibold text-white">{t(`aboutUs.sections.values.${value}.title`)}</h3>
              <p className="mt-1 text-sm text-neutral-400">{t(`aboutUs.sections.values.${value}.description`)}</p>
            </div>
          ))}
        </div>
      </LegalSection>

      <LegalSection title={t('aboutUs.sections.safety.title')}>
        <p>{t('aboutUs.sections.safety.intro')}</p>
        <LegalList items={list('aboutUs.sections.safety.points', 5)} />
      </LegalSection>

      <LegalSection title={t('aboutUs.sections.company.title')}>
        <p>{t('aboutUs.sections.company.content.0')}</p>
        <p>{t('aboutUs.sections.company.content.1')}</p>
      </LegalSection>

      <LegalSection title={t('aboutUs.sections.contact.title')}>
        <p>{t('aboutUs.sections.contact.content')}</p>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-sm text-neutral-400">{t('aboutUs.sections.contact.email')}</p>
          <a href="mailto:info@driplove.love" className="mt-1 inline-block font-medium text-pink-400 hover:underline">
            info@driplove.love
          </a>
        </div>
      </LegalSection>
    </LegalPage>
  );
};

export default AboutUs;
