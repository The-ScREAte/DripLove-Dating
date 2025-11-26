import React from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import GlobalLanguageSelector from './GlobalLanguageSelector';

interface WelcomeScreenProps {
  onLogin: () => void;
  onAbout: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onLogin, onAbout, onTerms, onPrivacy }) => {
  const { t } = useTranslation();
  
  return (
  <div className="min-h-fill bg-gradient-to-br from-purple-500 to-pink-500 flex flex-col items-center justify-start text-center relative overflow-hidden">
      {/* Video Background */}
      <div className="absolute inset-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute top-0 left-0 w-full h-[70vh] object-cover opacity-40"
        >
          <source src="/welcome-video.mov" type="video/quicktime" />
          <source src="/welcome-video.mp4" type="video/mp4" />
        </video>
        {/* Gradient overlay to blend video with pink background */}
        <div className="absolute top-[60vh] left-0 right-0 h-[20vh] bg-gradient-to-b from-transparent to-pink-500"></div>
      </div>

      {/* Background Bubbles */}
      <div className="absolute inset-0">
        <div className="bg-purple-400 opacity-30 rounded-full w-20 h-20 absolute top-10 left-20"></div>
        <div className="bg-pink-400 opacity-30 rounded-full w-48 h-48 absolute bottom-32 right-20"></div>
        <div className="bg-purple-300 opacity-20 rounded-full w-12 h-12 absolute top-32 right-32"></div>
        <div className="bg-pink-300 opacity-20 rounded-full w-32 h-32 absolute bottom-40 left-10"></div>
        <div className="bg-purple-200 opacity-25 rounded-full w-24 h-24 absolute top-5 right-5"></div>
      </div>

      {/* Logo and Tagline */}
      <div className="mb-12 flex flex-col items-center relative z-10 mt-32 px-6 w-full max-w-md">
        <img src="/driplove-logo.png" alt="DripLove Logo" className="w-50 h-40 mb-4" />
        <p className="text-lg text-white font-semibold text-center break-words">{t('welcome.tagline')}</p>
        <p className="text-sm text-white/80 text-center break-words mt-2">{t('welcome.subtitle')}</p>
      </div>

      {/* Login Button */}
      <div className="space-y-4 mb-16 relative z-10">
        <Button
          onClick={onLogin}
          className="w-48 bg-white text-purple-600 font-semibold py-3 rounded-full shadow-lg hover:bg-gray-100"
        >
          {t('welcome.getStarted')}
        </Button>
      </div>

      {/* Footer Section */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center space-y-2 z-10 pb-8 px-6">
        <div className="text-sm text-white/80 text-center max-w-md break-words">
          {t('welcome.joinThousands')}
        </div>
        <button
          onClick={onAbout}
          className="text-white text-sm font-bold hover:text-white/80 transition-colors duration-200 bg-transparent border-none cursor-pointer"
        >
          {t('welcome.aboutLink')}
        </button>
        <div className="flex flex-wrap justify-center items-center gap-3 text-sm">
          <button
            onClick={onTerms}
            className="text-white font-bold hover:text-white/80 transition-colors duration-200 bg-transparent border-none cursor-pointer whitespace-nowrap"
          >
            {t('welcome.termsLink')}
          </button>
          <button
            onClick={onPrivacy}
            className="text-white font-bold hover:text-white/80 transition-colors duration-200 bg-transparent border-none cursor-pointer whitespace-nowrap"
          >
            {t('welcome.privacyLink')}
          </button>
          <GlobalLanguageSelector variant="welcome" />
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
