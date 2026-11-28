import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useBackClose } from '@/utils/backStack';
import {
  activateBoost,
  closeBoostSheet,
  countWinsForBoost,
  getBoostHandlers,
  useBoostStatus,
  useBoostWins,
} from '@/services/boost';
import { FREE_BOOST_MINUTES, PREMIUM_BOOST_MINUTES, formatBoostClock, formatBoostWait } from '@/utils/boost';
import { BoostBolt, useBoostNow } from './BoostBolt';

/**
 * The tiny sheet behind the top timer and the card button:
 *  active  -> time left, what it does, what it brought so far; premium: "Boost again when it ends"
 *  ready   -> what a boost does + "Boost now"
 *  waiting -> next free boost in 5h + Premium upsell
 */
const BoostSheet: React.FC = () => {
  const { t } = useTranslation();
  const status = useBoostStatus();
  useBoostWins(); // re-render when likes / messages come in
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const cta = useRef<HTMLButtonElement | null>(null);
  const active = !!status?.active;
  const now = useBoostNow(true);
  useBackClose(true, closeBoostSheet, { escape: false });

  if (!status) return null;
  const left = active && status.endsAt ? status.endsAt - now : 0;
  const waitMs = status.nextFreeAt ? status.nextFreeAt - now : 0;
  const state: 'active' | 'ready' | 'waiting' = active && left > 0 ? 'active' : status.canActivate ? 'ready' : 'waiting';
  const counts = countWinsForBoost(status.boostId);
  const minutes = status.isPremium ? PREMIUM_BOOST_MINUTES : FREE_BOOST_MINUTES;

  const goPremium = () => {
    closeBoostSheet();
    getBoostHandlers().openPremium?.();
  };
  const boostNow = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const rect = cta.current?.getBoundingClientRect();
    try {
      const launchFrom = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: 44 }
        : { x: window.innerWidth / 2, y: window.innerHeight - 120, size: 44 };
      const res = await activateBoost({ launchFrom });
      if (res.kind === 'ok') {
        closeBoostSheet();
      } else if (res.kind === 'error') {
        setNote(t('boost.sheet.error', "Couldn't start your Boost. Please try again."));
      }
    } finally {
      setBusy(false);
    }
  };

  const resultLine = (): string | null => {
    if (!counts.likes && !counts.messages) return null;
    const likes = t('boost.sheet.likes', { count: counts.likes, defaultValue: '{{count}} likes' });
    const messages = t('boost.sheet.messages', { count: counts.messages, defaultValue: '{{count}} messages' });
    if (counts.likes && counts.messages) return t('boost.sheet.resultsBoth', '{{likes}} and {{messages}} so far', { likes, messages });
    return t('boost.sheet.resultsOne', '{{what}} so far', { what: counts.likes ? likes : messages });
  };

  return (
    <Sheet open onOpenChange={(o) => !o && closeBoostSheet()}>
      <SheetContent side="bottom" className="boost-sheet" aria-describedby="boost-sheet-desc" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="boost-grab" aria-hidden="true" />
        <div className="boost-body">
          <span className="boost-emblem" data-state={state} aria-hidden="true">
            <BoostBolt size={26} tone="white" />
          </span>

          {state === 'active' && (
            <>
              <SheetTitle className="boost-title">{t('boost.sheet.activeTitle', "You're boosted")}</SheetTitle>
              <div className="boost-clock" role="timer" aria-live="off">
                {formatBoostClock(left)}
              </div>
              <SheetDescription id="boost-sheet-desc" className="boost-sub">
                {t('boost.sheet.activeBody', 'You appear first in DripCheck until the timer ends.')}
              </SheetDescription>
              {resultLine() && <p className="boost-results">{resultLine()}</p>}
              <p className="boost-note">
                {status.isPremium
                  ? t('boost.sheet.premiumAgain', 'You can Boost again when it ends.')
                  : t('boost.sheet.freeNext', 'Your next free Boost is tomorrow. With Premium, Boost any time.')}
              </p>
              <Button variant="primary" size="lg" className="w-full" onClick={closeBoostSheet}>
                {t('boost.sheet.ok', 'Got it')}
              </Button>
              {!status.isPremium && (
                <Button variant="quiet" size="sm" className="w-full text-white/80" onClick={goPremium}>
                  {t('boost.sheet.getPremium', 'Get Premium')}
                </Button>
              )}
            </>
          )}

          {state === 'ready' && (
            <>
              <SheetTitle className="boost-title">{t('boost.sheet.readyTitle', 'Boost your profile')}</SheetTitle>
              <SheetDescription id="boost-sheet-desc" className="boost-sub">
                {t('boost.sheet.readyBody', 'Appear first in DripCheck for {{minutes}} minutes.', { minutes })}
              </SheetDescription>
              <p className="boost-note">{t('boost.sheet.tip', 'Tip: most people swipe in the evening.')}</p>
              {note && (
                <p className="boost-error" role="alert">
                  {note}
                </p>
              )}
              <Button ref={cta} variant="primary" size="lg" className="w-full" loading={busy} onClick={boostNow}>
                <BoostBolt size={16} tone="white" />
                <span>{t('boost.sheet.boostNow', 'Boost now')}</span>
              </Button>
            </>
          )}

          {state === 'waiting' && (
            <>
              <SheetTitle className="boost-title">
                {waitMs > 0
                  ? t('boost.sheet.waitTitle', 'Next free Boost in {{time}}', { time: formatBoostWait(waitMs) })
                  : t('boost.sheet.waitTitleSoon', 'Your free Boost is almost ready')}
              </SheetTitle>
              <SheetDescription id="boost-sheet-desc" className="boost-sub">
                {t('boost.sheet.waitBody', 'Free members get one {{free}}-minute Boost a day. Premium members can Boost for {{premium}} minutes any time.', {
                  free: FREE_BOOST_MINUTES,
                  premium: PREMIUM_BOOST_MINUTES,
                })}
              </SheetDescription>
              <Button variant="primary" size="lg" className="w-full" onClick={goPremium}>
                {t('boost.sheet.getPremium', 'Get Premium')}
              </Button>
              <Button variant="quiet" size="sm" className="w-full text-white/80" onClick={closeBoostSheet}>
                {t('boost.sheet.notNow', 'Not now')}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default BoostSheet;
