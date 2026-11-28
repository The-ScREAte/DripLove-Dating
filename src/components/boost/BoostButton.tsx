import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { activateBoost, getBoostHandlers, openBoostSheet, useBoostAvailable, useBoostStatus } from '@/services/boost';
import { boostProgress, formatBoostWait } from '@/utils/boost';
import { BoostBolt, useBoostNow } from './BoostBolt';
import './boost.css';

/**
 * The Boost control on the Discover card, pinned right above the expand button.
 *  ready   -> pink/purple disc; a tap boosts at once and plays the launch animation
 *  active  -> glass disc with a ring filling up as the boost runs; a tap opens the boost sheet
 *  waiting -> (free, today's boost used) dimmed bolt + lock + "5h"; a tap opens the Premium upgrade
 * Hidden entirely until the backend answers (and for good if it is missing).
 */
export const BoostButton: React.FC<{ hidden?: boolean; variant?: 'card' | 'inline' }> = ({ hidden = false, variant = 'card' }) => {
  const { t } = useTranslation();
  const available = useBoostAvailable();
  const status = useBoostStatus();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const active = !!status?.active;
  const now = useBoostNow(active || (!!status && !status.canActivate && !!status.nextFreeAt));

  if (available !== true || !status) return null;

  const state: 'ready' | 'active' | 'waiting' = active ? 'active' : status.canActivate ? 'ready' : 'waiting';
  const progress = active && status.endsAt ? boostProgress(status.endsAt, status.durationMinutes, now) : 0;
  const waitMs = status.nextFreeAt ? status.nextFreeAt - now : 0;

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (state === 'waiting' && !status.isPremium) {
      // Today's free boost is used: Premium boosts any time.
      const openPremium = getBoostHandlers().openPremium;
      if (openPremium) openPremium();
      else openBoostSheet();
      return;
    }
    if (state !== 'ready') {
      openBoostSheet();
      return;
    }
    setBusy(true);
    const rect = ref.current?.getBoundingClientRect();
    try {
      const launchFrom = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: 34 }
        : { x: window.innerWidth - 40, y: window.innerHeight * 0.6, size: 34 };
      const res = await activateBoost({ launchFrom });
      if (res.kind !== 'ok' && res.kind !== 'missing') {
        openBoostSheet();
      }
    } finally {
      setBusy(false);
    }
  };

  const label =
    state === 'active'
      ? t('boost.button.active', 'Boost is on')
      : state === 'waiting'
        ? t('boost.button.waiting', 'Next free boost in {{time}}', { time: formatBoostWait(waitMs) })
        : t('boost.button.ready', 'Boost your profile');
  const fullLabel = state === 'waiting' && !status.isPremium ? `${label}. ${t('boost.button.upsell', 'Premium boosts any time')}` : label;

  // Inline pill (e.g. the empty Discover deck): same states and actions, with a text label.
  if (variant === 'inline') {
    return (
      <button ref={ref} type="button" onClick={onClick} aria-busy={busy || undefined} className="dl-boost-inline dl-focus" data-state={state}>
        <BoostBolt size={16} tone={state === 'ready' ? 'white' : 'gradient'} />
        <span>{state === 'ready' ? t('boost.inline.ready', 'Boost your profile') : label}</span>
        {state === 'waiting' && !status.isPremium && <Lock size={12} strokeWidth={2.5} aria-hidden="true" />}
      </button>
    );
  }

  // ring: r=15.5 -> circumference ~97.4
  const C = 97.4;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={fullLabel}
      title={fullLabel}
      aria-busy={busy || undefined}
      className="dl-boost-btn absolute z-10 flex h-14 w-14 items-center justify-center rounded-full dl-focus"
      data-state={state}
      data-hidden={hidden ? 'true' : 'false'}
      data-busy={busy ? 'true' : undefined}
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden || undefined}
    >
      <span className="dl-boost-disc">
        {state === 'active' && (
          <svg className="dl-boost-ring" viewBox="0 0 34 34" aria-hidden="true">
            <circle cx="17" cy="17" r="15.5" className="dl-boost-ring-track" />
            <circle cx="17" cy="17" r="15.5" className="dl-boost-ring-fill" strokeDasharray={C} strokeDashoffset={C * progress} />
          </svg>
        )}
        <BoostBolt size={state === 'ready' ? 24 : 22} tone={state === 'ready' ? 'white' : 'gradient'} className="dl-boost-glyph" />
      </span>
      {state === 'waiting' && (
        <span className="dl-boost-lock" aria-hidden="true">
          <Lock size={8} strokeWidth={3} />
        </span>
      )}
      {state === 'waiting' && status.nextFreeAt && waitMs > 0 && <span className="dl-boost-wait">{formatBoostWait(waitMs)}</span>}
    </button>
  );
};

export default BoostButton;
