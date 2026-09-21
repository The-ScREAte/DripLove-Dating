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
const AUTO_CLOSE_MS = 30_000; // "make it 30 seconds"
const LEVEL_SIZE = 5;

// Shows once per calendar day, right after record_daily_login reports a
// fresh day (see useDailyStreak). Mirrors MatchAnimation's overlay style
// (dark card, pink accents, enter/exit transform+opacity animation) so it
// feels like part of the same app instead of a bolted-on toast.
const StreakFlash: React.FC<StreakFlashProps> = ({ currentStreak, onClose }) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const level = getStreakLevel(currentStreak);
  const dayInLevel = ((currentStreak - 1) % LEVEL_SIZE) + 1;
  const daysToNextLevel = LEVEL_SIZE - dayInLevel;

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
      className={`fixed inset-0 flex items-center justify-center z-50 p-4 ${
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
        className={`max-w-sm w-full relative z-10 transform bg-black border border-pink-500/50 ${
          isVisible ? 'animate-streak-enter' : 'animate-streak-exit'
        }`}
        style={{ willChange: 'transform, opacity' }}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label={t('common.close')}
          className="absolute top-2.5 right-2.5 z-10 p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <CardContent className="p-6 text-center">
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center animate-streak-pulse">
              <Flame className="w-9 h-9 text-white fill-white" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">
            {t('streak.dayCount', { count: currentStreak })}
          </h1>
          <div className="inline-block px-3 py-1 rounded-full bg-pink-500/15 border border-pink-500/40 text-pink-400 text-sm font-semibold mb-4">
            {t('streak.levelLabel', { level })}
          </div>

          <div className="flex items-center justify-center gap-1.5 mb-3">
            {Array.from({ length: LEVEL_SIZE }, (_, i) => i + 1).map((day) => (
              <div
                key={day}
                className={`h-1.5 flex-1 max-w-10 rounded-full ${
                  day <= dayInLevel ? 'bg-gradient-to-r from-orange-500 to-pink-500' : 'bg-neutral-800'
                }`}
              />
            ))}
          </div>

          {daysToNextLevel > 0 ? (
            <p className="text-gray-300 text-sm mb-3">
              {t('streak.daysToNextLevel', { count: daysToNextLevel, level: level + 1 })}
            </p>
          ) : (
            <>
              <p className="text-pink-400 font-bold text-base mb-1">
                {t('streak.levelComplete', { level })}
              </p>
              <p className="text-gray-300 text-sm mb-3">
                {t('streak.levelUpToday', { level: level + 1 })}
              </p>
            </>
          )}

          <p className="text-gray-300 text-sm">{t('streak.priorityHint')}</p>
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

        @keyframes streak-pulse { 0% { transform: scale(1) } 50% { transform: scale(1.08) } 100% { transform: scale(1) } }
        .animate-streak-pulse { animation: streak-pulse 1400ms ease-in-out infinite both; }
      `}</style>
    </div>
  );
};

export default StreakFlash;
