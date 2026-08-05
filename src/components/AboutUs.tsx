import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Heart, Users, Globe, Sparkles, Mail, Shield, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AboutUsProps {
  onBack: () => void;
}

const AboutUs = ({ onBack }: AboutUsProps) => {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-fill bg-black p-4">
      <div className="max-w-4xl mx-auto bg-black border border-pink-500/40 rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 to-pink-700 text-white py-2 px-4 sticky top-0 z-10">
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('aboutUs.back')}
          </Button>
          <h1 className="text-3xl font-bold">{t('aboutUs.title')}</h1>
          <p className="text-purple-100 mt-2">{t('aboutUs.lastUpdated')}</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
          <section>
            <h2 className="text-2xl font-semibold text-gray-100 mb-4 flex items-center">
              <Heart className="w-6 h-6 mr-2 text-pink-600" />
              1. {t('aboutUs.sections.mission.title')}
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              {t('aboutUs.sections.mission.content.0')}
            </p>
            <p className="text-gray-300 leading-relaxed">
              {t('aboutUs.sections.mission.content.1')}
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-100 mb-4 flex items-center">
              <Sparkles className="w-6 h-6 mr-2 text-purple-600" />
              2. {t('aboutUs.sections.different.title')}
            </h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              {t('aboutUs.sections.different.intro')}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-300">
              <li>{t('aboutUs.sections.different.points.0')}</li>
              <li>{t('aboutUs.sections.different.points.1')}</li>
              <li>{t('aboutUs.sections.different.points.2')}</li>
              <li>{t('aboutUs.sections.different.points.3')}</li>
              <li>{t('aboutUs.sections.different.points.4')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-100 mb-4 flex items-center">
              <Globe className="w-6 h-6 mr-2 text-blue-600" />
              3. {t('aboutUs.sections.community.title')}
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              {t('aboutUs.sections.community.content.0')}
            </p>
            <p className="text-gray-300 leading-relaxed">
              {t('aboutUs.sections.community.content.1')}
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-100 mb-4 flex items-center">
              <Users className="w-6 h-6 mr-2 text-green-600" />
              4. {t('aboutUs.sections.values.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-300">
              <div className="p-4 bg-pink-950/40 border border-pink-500/30 rounded-lg">
                <h3 className="font-semibold text-pink-300 mb-2">{t('aboutUs.sections.values.authenticity.title')}</h3>
                <p className="text-sm">{t('aboutUs.sections.values.authenticity.description')}</p>
              </div>
              <div className="p-4 bg-purple-950/40 border border-purple-500/30 rounded-lg">
                <h3 className="font-semibold text-purple-300 mb-2">{t('aboutUs.sections.values.inclusivity.title')}</h3>
                <p className="text-sm">{t('aboutUs.sections.values.inclusivity.description')}</p>
              </div>
              <div className="p-4 bg-blue-950/40 border border-blue-500/30 rounded-lg">
                <h3 className="font-semibold text-blue-300 mb-2">{t('aboutUs.sections.values.safety.title')}</h3>
                <p className="text-sm">{t('aboutUs.sections.values.safety.description')}</p>
              </div>
              <div className="p-4 bg-green-950/40 border border-green-500/30 rounded-lg">
                <h3 className="font-semibold text-green-300 mb-2">{t('aboutUs.sections.values.innovation.title')}</h3>
                <p className="text-sm">{t('aboutUs.sections.values.innovation.description')}</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-100 mb-4 flex items-center">
              <Target className="w-6 h-6 mr-2 text-orange-600" />
              5. {t('aboutUs.sections.company.title')}
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              {t('aboutUs.sections.company.content.0')}
            </p>
            <p className="text-gray-300 leading-relaxed">
              {t('aboutUs.sections.company.content.1')}
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-100 mb-4 flex items-center">
              <Shield className="w-6 h-6 mr-2 text-indigo-600" />
              6. {t('aboutUs.sections.safety.title')}
            </h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              {t('aboutUs.sections.safety.intro')}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-300">
              <li>{t('aboutUs.sections.safety.points.0')}</li>
              <li>{t('aboutUs.sections.safety.points.1')}</li>
              <li>{t('aboutUs.sections.safety.points.2')}</li>
              <li>{t('aboutUs.sections.safety.points.3')}</li>
              <li>{t('aboutUs.sections.safety.points.4')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-100 mb-4 flex items-center">
              <Mail className="w-6 h-6 mr-2 text-pink-600" />
              7. {t('aboutUs.sections.contact.title')}
            </h2>
            <p className="text-gray-300 mb-4">
              {t('aboutUs.sections.contact.content')}
            </p>
            <div className="bg-pink-950/40 border border-pink-500/30 rounded-lg p-4 space-y-2">
              <p className="text-pink-300 font-semibold">
                {t('aboutUs.sections.contact.email')} <a href="mailto:driploveinfo@gmail.com" className="hover:underline">driploveinfo@gmail.com</a>
              </p>
              <p className="text-pink-300">
                📍 {t('aboutUs.sections.contact.support')}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;