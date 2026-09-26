import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getStreakLevel } from '@/utils/activityWeighting';

interface StreakFlashProps {
  currentStreak: number;
  onClose: () => void;
}

const ENTER_DURATION = 400; // ms
const EXIT_DURATION = 300; // ms
const AUTO_CLOSE_MS = 30_000;
const LEVEL_SIZE = 5;

// Shows once per calendar day, right after record_daily_login reports a
// fresh day (see useDailyStreak). Restrained, mostly-monochrome palette on
// purpose - the fire icon is already the one attention-grabbing element, so
// everything else (pill, progress dots, copy) stays white/gray/black with
// only a thin magenta accent, rather than competing with it in pink too.
const StreakFlash: React.FC<StreakFlashProps> = ({ currentStreak, onClose }) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const level = getStreakLevel(currentStreak);
  const dayInLevel = ((currentStreak - 1) % LEVEL_SIZE) + 1;
  const daysToNextLevel = LEVEL_SIZE - dayInLevel;
  const levelComplete = daysToNextLevel === 0;

  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(onClose, EXIT_DURATION);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isClosing) handleClose();
    }, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClosing]);

  return (
    <div
      aria-live="polite"
      className={`fixed inset-0 flex items-center justify-center z-[100000] p-4 ${
        isVisible ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div
        onClick={handleClose}
        className={`absolute inset-0 bg-black/75 transition-opacity ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ willChange: 'opacity' }}
      />

      <Card
        role="dialog"
        aria-modal
        className={`max-w-sm w-full relative z-10 transform overflow-hidden rounded-3xl border border-pink-500/20 ${
          isVisible ? 'animate-streak-enter' : 'animate-streak-exit'
        }`}
        style={{
          willChange: 'transform, opacity',
          background: 'linear-gradient(180deg, #1a0f14 0%, #0a0a0a 45%)',
        }}
      >
        {/* Very subtle magenta glow behind the icon - the only "flourish" in
            an otherwise flat black card, instead of pink showing up
            everywhere else too. */}
        <div
          className="absolute left-1/2 top-8 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.18) 0%, rgba(236,72,153,0) 70%)' }}
        />

        <button
          type="button"
          onClick={handleClose}
          aria-label={t('common.close')}
          className="absolute top-4 right-4 z-10 p-1 rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <CardContent className="relative p-6 text-center">
          <div className="flex justify-center mb-2">
            <div className="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center animate-streak-pulse">
              <Flame className="w-7 h-7 text-white fill-white" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white uppercase tracking-wide mb-2.5">
            {t('streak.dayCount', { count: currentStreak })}
          </h1>

          <div className="inline-block px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-pink-300/90 text-[11px] font-medium tracking-wide uppercase mb-4">
            {t('streak.levelLabel', { level })}
          </div>

          {/* Single segmented indicator - a filled dot/line up to the
              current day in this level, dark/subtle beyond it - instead of
              five separate equal-weight bars. */}
          <div className="flex items-center justify-center mb-4">
            {Array.from({ length: LEVEL_SIZE }, (_, i) => i + 1).map((day) => (
              <React.Fragment key={day}>
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    day <= dayInLevel ? 'bg-gradient-to-br from-orange-400 to-pink-500' : 'bg-white/15'
                  }`}
                />
                {day < LEVEL_SIZE && (
                  <div
                    className={`h-px w-6 sm:w-7 ${
                      day < dayInLevel ? 'bg-gradient-to-r from-orange-400 to-pink-500' : 'bg-white/10'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          <p className="text-gray-200 text-sm font-medium mb-1.5">
            {levelComplete
              ? t('streak.levelComplete', { level })
              : t('streak.daysToNextLevel', { count: daysToNextLevel, level: level + 1 })}
          </p>
          <p className="text-gray-500 text-xs leading-snug">
            {levelComplete ? t('streak.levelUpToday', { level: level + 1 }) : t('streak.priorityHint')}
          </p>
        </CardContent>
      </Card>

      <style>{`
        @keyframes streak-enter {
          0% { transform: translateY(16px) scale(.98); opacity: 0 }
          100% { transform: translateY(0) scale(1); opacity: 1 }
        }
        @keyframes streak-exit {
          0% { transform: translateY(0) scale(1); opacity: 1 }
          100% { transform: translateY(8px) scale(.995); opacity: 0 }
        }
        .animate-streak-enter { animation: streak-enter ${ENTER_DURATION}ms ease-out both; }
        .animate-streak-exit { animation: streak-exit ${EXIT_DURATION}ms ease-in both; }

        @keyframes streak-pulse { 0% { transform: scale(1) } 50% { transform: scale(1.06) } 100% { transform: scale(1) } }
        .animate-streak-pulse { animation: streak-pulse 1400ms ease-in-out infinite both; }
      `}</style>
    </div>
  );
};

export default StreakFlash;
