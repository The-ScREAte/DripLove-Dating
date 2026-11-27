import { lazy } from 'react';
import { registerPopup } from './instance';
import type { PopupRenderArgs } from './instance';
import MatchAnimation from '@/components/MatchAnimation';
import VerifyIdentityPrompt from '@/components/VerifyIdentityPrompt';
import StreakFlash from '@/components/StreakFlash';
import { AppUpdateDialog, type AppUpdatePayload } from '@/components/AppUpdatePopup';
import { isRatingAskAllowed } from '@/rating/ratingGate';
import { recordRatingMoment } from '@/rating/ratingMoments';
import NativeReviewAsk from '@/rating/NativeReviewAsk';
import { PaymentIssueDialog, type PaymentIssuePayload } from '@/components/premium/PaymentIssueDialog';
import { isVerifyPromptEligible } from '@/utils/verifyPromptStorage';
import IcebreakerToast, { type IcebreakerToastPayload } from '@/components/icebreaker/IcebreakerToast';
import { getIcebreakerHandlers, openIcebreakerInbox } from '@/components/icebreaker/store';
import FestiveGreeting from '@/components/FestiveGreeting';
import { festivalDue, markFestivalSeen } from './festive';
import type { PopupRecord } from './types';

// Heavy content loads only when its popup is actually due.
const PremiumUpgrade = lazy(() => import('@/components/PremiumUpgrade'));
const FreeTrialPopup = lazy(() => import('@/components/FreeTrialPopup'));

/**
 * EVERY app popup is registered here. To add one: registerPopup(definition, renderer) and call
 * requestPopup(id, payload) where the event happens. See README.md for the rules.
 */

const SCREENS_WITH_CALM = ['dripcheck', 'circle', 'liked', 'profile'] as const;

const readLegacy = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// ---- Match celebration (transactional) ---------------------------------------
interface MatchPayload {
  matchedUserId: string;
  matchedUserName: string;
  matchedUserImage?: string;
}
registerPopup<MatchPayload>(
  { id: 'match', tier: 'transactional', userInitiated: true, ignoreDataReady: true, ttlMs: 5 * 60_000 },
  ({ payload, close, services }: PopupRenderArgs<MatchPayload>) => {
    if (!payload) return null;
    // A match screen closing is a happy moment: tell the rating engine, which decides whether
    // (and after an afterglow) to request the 'rating-funnel' slot below.
    const askForRating = () => recordRatingMoment('match_celebrated');
    return (
      <MatchAnimation
        currentUserName={services.currentUserName}
        currentUserImage={services.currentUserImage ?? undefined}
        currentUserId={services.currentUser?.id ?? undefined}
        matchedUserName={payload.matchedUserName}
        matchedUserImage={payload.matchedUserImage}
        matchedUserId={payload.matchedUserId}
        onClose={() => {
          close('dismissed');
          askForRating();
        }}
        onStartChat={(userId) => {
          close('converted');
          askForRating();
          services.onNavigateToChat(userId);
        }}
      />
    );
  }
);

// ---- Premium upgrade page (the user tapped Upgrade / hit a locked feature) ----------
interface PremiumPayload {
  preselectedPlan?: 'premium';
}
registerPopup<PremiumPayload>(
  { id: 'premium-upgrade', tier: 'transactional', userInitiated: true, ignoreDataReady: true, ttlMs: 30_000 },
  ({ payload, close, services }: PopupRenderArgs<PremiumPayload>) => (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-black"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <PremiumUpgrade
        currentUser={services.currentUser ?? {}}
        onClose={() => close('dismissed')}
        preselectedPlan={payload?.preselectedPlan ?? 'premium'}
      />
    </div>
  )
);

// ---- Store-review ask (passive) -----------------------------------------------------
// Draws nothing: at the moment the coordinator decides the user is free, the NATIVE review API
// is called (Apple 5.6.1 / Google Play: no custom prompt, no pre-question, no reward). WHICH
// moments qualify and the cooldowns/yearly cap live in src/rating/ratingEngine.ts.
registerPopup<string>(
  {
    id: 'rating-funnel',
    tier: 'passive',
    screens: ['dripcheck', 'circle', 'liked', 'chat', 'profile'],
    // Re-checked at the moment it would appear, so a stale request never asks someone who already rated.
    eligible: (_env, trigger) => isRatingAskAllowed(trigger as Parameters<typeof isRatingAskAllowed>[0]),
    maxPerSession: 1,
  },
  ({ payload, close }) => <NativeReviewAsk trigger={payload} onDone={() => close('converted')} />
);

// ---- "Verify your face" nudge (engagement, once ever) -------------------------------
registerPopup(
  {
    id: 'verify-identity',
    tier: 'engagement',
    screens: ['dripcheck'],
    maxTotal: 1,
    ignoreDataReady: true,
    legacy: () => (isVerifyPromptEligible() ? null : { total: 1, lastShownAt: Date.now() }),
  },
  ({ close, services }) => (
    <VerifyIdentityPrompt
      open
      onClose={() => close('dismissed')}
      onVerifyNow={() => {
        close('converted');
        services.onNavigateToVerify();
      }}
    />
  )
);

// ---- Swipe tutorial (inline overlay owned by Discover; once per account) --------------
registerPopup({
  id: 'swipe-guide',
  tier: 'engagement',
  inline: true,
  screens: ['dripcheck'],
  maxTotal: 1,
  autoCloseMs: 25_000,
  ignoreDataReady: true,
  legacy: (userId) => (readLegacy(`driplove_swipe_guide_shown_${userId}`) ? { total: 1, lastShownAt: Date.now() } : null),
});

// ---- Free-trial offer (engagement) ---------------------------------------------------
interface FreeTrialPayload {
  userId: string;
  state: 'eligible' | 'trialEnded';
}
const FREE_TRIAL_LEGACY_KEY = 'driplove_free_trial_sheet_v2';
registerPopup<FreeTrialPayload>(
  {
    id: 'free-trial',
    tier: 'engagement',
    screens: SCREENS_WITH_CALM,
    eligible: (env) => env.isPremium !== true,
    keepWhenIneligible: false,
    minAppAgeMs: 10 * 60_000,
    cooldownMs: (p) => (p?.state === 'trialEnded' ? 21 : 3) * 24 * 60 * 60_000,
    maxPerSession: 1,
    ttlMs: 30 * 60_000,
    // Existing users keep their place in the 3-day cadence.
    legacy: (userId): Partial<PopupRecord> | null => {
      try {
        const raw = readLegacy(FREE_TRIAL_LEGACY_KEY);
        const rec = raw ? JSON.parse(raw)?.[userId] : null;
        return rec?.lastShownAt ? { lastShownAt: rec.lastShownAt, total: 1 } : null;
      } catch {
        return null;
      }
    },
  },
  ({ payload, close }) => <FreeTrialPopup userId={payload?.userId} onClose={() => close('dismissed')} />
);

// ---- Daily streak (engagement) + the same banner opened from a push tap (transactional) ----
interface StreakPayload {
  currentStreak: number;
  onClosed?: () => void;
}
const streakRenderer = ({ payload, close }: PopupRenderArgs<StreakPayload>) =>
  payload ? (
    <StreakFlash
      currentStreak={payload.currentStreak}
      onClose={() => {
        close('dismissed');
        payload.onClosed?.();
      }}
    />
  ) : null;
registerPopup<StreakPayload>(
  { id: 'streak-flash', tier: 'engagement', maxPerDay: 1, maxPerSession: 1, ignoreDataReady: true, ttlMs: 3 * 60_000 },
  streakRenderer
);
registerPopup<StreakPayload>(
  { id: 'streak-tap', tier: 'transactional', userInitiated: true, ignoreDataReady: true, ttlMs: 60_000 },
  streakRenderer
);

// ---- Festive greeting (engagement) ----------------------------------------------------------
// Only on the festival itself, once per person per festival; marked seen the moment it appears (so ignoring it never
// brings it back later). See ./festive.ts.
interface FestivePayload {
  userId: string;
  key: string;
}
registerPopup<FestivePayload>(
  {
    id: 'festive-greeting',
    tier: 'engagement',
    ignoreDataReady: true,
    ttlMs: 20 * 60_000,
    maxPerSession: 1,
    eligible: (_env, payload) => !!payload && festivalDue(payload.userId) === payload.key,
    onShown: (payload) => {
      if (payload && !payload.key.startsWith('preview-')) markFestivalSeen(payload.userId, payload.key);
    },
  },
  ({ close }) => <FestiveGreeting onClose={() => close('dismissed')} />
);

// ---- App update (engagement; native only) -----------------------------------------------
registerPopup<AppUpdatePayload>(
  { id: 'app-update', tier: 'engagement', maxPerSession: 1, ignoreDataReady: true, ttlMs: 30 * 60_000 },
  ({ payload, close }) =>
    payload ? <AppUpdateDialog {...payload} onClose={(converted) => close(converted ? 'converted' : 'dismissed')} /> : null
);

// ---- Payment issue (critical; native only) ----------------------------------------------
// A store renewal failed and the store is retrying (subscription status 'payment_pending'). Premium still works
// until the store's grace period ends, so this is a heads-up with one clear action, at most once a day.
registerPopup<PaymentIssuePayload>(
  { id: 'payment-issue', tier: 'critical', maxPerDay: 1, ignoreDataReady: true, ttlMs: 60_000 },
  ({ payload, close }) =>
    payload ? <PaymentIssueDialog {...payload} onClose={(converted) => close(converted ? 'converted' : 'dismissed')} /> : null
);

// ---- Someone broke the ice (transactional heads-up; the inbox row/badge is the durable record) ----
registerPopup<IcebreakerToastPayload>(
  { id: 'icebreaker-received', tier: 'transactional', screens: ['dripcheck', 'circle', 'liked', 'profile'], ignoreDataReady: true, ttlMs: 60_000, autoCloseMs: 9_000, maxPerSession: 6 },
  ({ payload, close }) => (
    <IcebreakerToast
      payload={payload}
      onClose={() => close('dismissed')}
      onView={() => {
        close('converted');
        getIcebreakerHandlers().openChat(null);
        openIcebreakerInbox();
      }}
    />
  )
);
