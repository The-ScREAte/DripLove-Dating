import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { App as CapacitorApp } from '@capacitor/app';
import {
  clearBoostFocus,
  countWinsForBoost,
  getBoostStatus,
  openBoostSheet,
  requestBoostFocus,
  useBoostFocusRequest,
  useBoostStatus,
  loadBoost,
  loadBoostWins,
  onBoostEnded,
  onNewBoostWins,
  setBoostHandlers,
  setBoostUser,
  shouldWatchWins,
  useBoostAvailable,
  useBoostLaunch,
  useBoostSheetOpen,
  type BoostWin,
} from '@/services/boost';
import { BoostBolt } from './BoostBolt';
import BoostTopTimer from './BoostTopTimer';
import './boost.css';

const BoostLaunchAnimation = lazy(() => import('./BoostLaunchAnimation'));
const BoostSheet = lazy(() => import('./BoostSheet'));

const WINS_POLL_MS = 30_000;
const TOAST_MS = 3600;

interface Toast {
  id: number;
  title: string;
  body: string;
  tab?: 'liked' | 'chat';
}

interface Props {
  userId?: string | null;
  openPremium: () => void;
  openTab: (tab: 'liked' | 'chat') => void;
  /** Hide the header timer (terms / privacy screens, an open conversation). */
  timerHidden?: boolean;
}

/**
 * Mounted ONCE in MainApp. Keeps my boost state fresh, draws the launch animation, the header timer, the boost sheet
 * and the light "Boost got you this" toasts. Renders nothing until the backend answers (and for good without it).
 */
const BoostHost: React.FC<Props> = ({ userId, openPremium, openTab, timerHidden }) => {
  const { t } = useTranslation();
  const available = useBoostAvailable();
  const launch = useBoostLaunch();
  const sheetOpen = useBoostSheetOpen();
  const [toast, setToast] = useState<Toast | null>(null);
  const toastSeq = useRef(0);

  useEffect(() => {
    setBoostHandlers({ openPremium });
  }, [openPremium]);

  // Cold start from a boost push: the route carries ?boost=1 (MainApp strips it a few seconds later).
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('boost') === '1') requestBoostFocus();
    } catch {
      /* ignore */
    }
  }, []);

  // A boost push was tapped: when my state is known, offer the sheet if a boost can start (a running one already
  // shows the header timer; a used free boost just lands on Discover).
  const focus = useBoostFocusRequest();
  const statusNow = useBoostStatus();
  useEffect(() => {
    if (!focus) return;
    if (available === false) {
      clearBoostFocus();
      return;
    }
    if (available !== true || !statusNow) return;
    clearBoostFocus();
    const s = getBoostStatus();
    if (s && !s.active && s.canActivate) openBoostSheet();
  }, [focus, available, statusNow]);

  // State + wins on login, on resume, and wins every 30s while boosted (and a while after).
  useEffect(() => {
    setBoostUser(userId);
    if (!userId) return undefined;
    void loadBoost(true).then(() => loadBoostWins());
    let last = Date.now();
    const onResume = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = Date.now();
      if (now - last < 15_000) return;
      last = now;
      void loadBoost(true);
      void loadBoostWins();
    };
    document.addEventListener('visibilitychange', onResume);
    const resumeHandle = CapacitorApp.addListener('resume', onResume);
    const poll = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (shouldWatchWins()) void loadBoostWins();
    }, WINS_POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      resumeHandle.then((l) => l.remove()).catch(() => {});
      clearInterval(poll);
    };
  }, [userId]);

  // Toasts.
  useEffect(() => {
    const show = (next: Omit<Toast, 'id'>) => setToast({ ...next, id: ++toastSeq.current });
    const offWins = onNewBoostWins((fresh: BoostWin[]) => {
      const likes = fresh.filter((w) => w.kind === 'like').length;
      const messages = fresh.length - likes;
      const body =
        likes && messages
          ? t('boost.toast.both', 'New likes and messages while you were boosted')
          : messages
            ? t('boost.toast.messages', { count: messages, defaultValue: '{{count}} new messages while you were boosted' })
            : t('boost.toast.likes', { count: likes, defaultValue: '{{count}} new likes while you were boosted' });
      show({ title: t('boost.win.badge', 'Boost got you this'), body, tab: messages && !likes ? 'chat' : 'liked' });
    });
    const offEnded = onBoostEnded((ended) => {
      const c = countWinsForBoost(ended.boostId);
      const got =
        c.likes && c.messages
          ? t('boost.toast.endedBoth', 'It brought you new likes and messages.')
          : c.likes
            ? t('boost.toast.endedLikes', { count: c.likes, defaultValue: 'It brought you {{count}} likes.' })
            : c.messages
              ? t('boost.toast.endedMessages', { count: c.messages, defaultValue: 'It brought you {{count}} messages.' })
              : ended.isPremium
            ? t('boost.toast.endedPremium', 'Boost again whenever you like.')
            : t('boost.toast.endedFree', 'Your next free boost is tomorrow.');
      show({ title: t('boost.toast.ended', 'Your boost has ended'), body: got, tab: c.likes ? 'liked' : c.messages ? 'chat' : undefined });
    });
    return () => {
      offWins();
      offEnded();
    };
  }, [t]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast((cur) => (cur && cur.id === toast.id ? null : cur)), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  if (available !== true) return null;

  return (
    <>
      <BoostTopTimer hidden={timerHidden} />
      {launch && (
        <Suspense fallback={null}>
          <BoostLaunchAnimation key={launch.id} launch={launch} />
        </Suspense>
      )}
      {sheetOpen && (
        <Suspense fallback={null}>
          <BoostSheet />
        </Suspense>
      )}
      {toast &&
        createPortal(
          <div className="dl-under-popup dl-boost-pop-wrap" role="status" aria-live="polite">
            <button
              key={toast.id}
              type="button"
              className="dl-boost-pop dl-focus"
              onClick={() => {
                setToast(null);
                if (toast.tab) openTab(toast.tab);
              }}
            >
              <span className="dl-boost-pop-icon" aria-hidden="true">
                <BoostBolt size={14} tone="white" />
              </span>
              <span className="dl-boost-pop-text">
                <span className="dl-boost-pop-title">{toast.title}</span>
                <span className="dl-boost-pop-body">{toast.body}</span>
              </span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
};

export default BoostHost;
