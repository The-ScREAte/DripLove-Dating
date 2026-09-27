import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';

interface CircleUpHeaderProps {
  onBack: () => void;
  backLabel?: string;
}

// Standalone routes (like this one) don't mount inside MainApp, so they
// never get its global branded header (logo + tagline) - reproduced here
// (visual only, no ResizeObserver/--app-header-height wiring, since these
// pages lay out via plain flex, not that CSS var) so leaving the tab
// system for Circle Up doesn't feel like leaving the app. Always visible:
// a non-scrolling flex item at the top of each screen's h-[100dvh] column,
// with the body as the only scrollable section below it.
const CircleUpHeader = ({ onBack, backLabel = 'Back' }: CircleUpHeaderProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex-shrink-0">
      <div
        className="relative flex justify-between items-center"
        style={{
          paddingTop: 'clamp(16px, calc(env(safe-area-inset-top, 16px) + 8px), 48px)',
          paddingLeft: 'clamp(10px, 4vw, 16px)',
          paddingRight: 'clamp(10px, 4vw, 16px)',
          paddingBottom: 'clamp(6px, 2vw, 8px)',
          background: 'rgba(0,0,0,0.95)',
        }}
      >
        <img
          src="/driplove-logo.webp"
          alt="DripLove Logo"
          loading="lazy"
          decoding="async"
          style={{ height: 'clamp(30px, 9vw, 40px)', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))' }}
        />
        <div className="text-right">
          <div
            className="font-brush font-bold"
            style={{ color: '#ffffff', fontSize: 'clamp(15px, 4.2vw, 19px)', textShadow: '0 1px 3px rgba(0,0,0,0.5), 0 1px 8px rgba(0,0,0,0.35)' }}
          >
            <div>{t('common.findYour')}</div>
            <div>{t('common.perfectMatch')}</div>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            borderLeft: '1px solid rgba(236,72,153,0.55)',
            borderRight: '1px solid rgba(236,72,153,0.55)',
            borderBottom: '1px solid rgba(236,72,153,0.55)',
            borderBottomLeftRadius: '20px',
            borderBottomRightRadius: '20px',
          }}
        />
      </div>

      <div className="flex items-center gap-2 px-4 py-2 bg-black">
        <button type="button" onClick={onBack} className="p-2 -ml-2 text-white/70 hover:text-white" aria-label={backLabel}>
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-white font-semibold text-base">Circle Up</h2>
      </div>
    </div>
  );
};

export default CircleUpHeader;
