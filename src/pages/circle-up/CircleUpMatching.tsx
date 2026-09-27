import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import HoppingLogo from '@/components/HoppingLogo';
import { fetchCircleProfilesByIds, CircleProfile } from '@/utils/circlePoolFetch';
import { calculateDistance } from '@/constants/locationData';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import { calculateAge } from '@/utils/discoverCache';
import { formatDistance } from '@/utils/distanceUnits';
import MatchPreviewCard, { CircleUpShareSettings, DEFAULT_SHARE_SETTINGS } from './MatchPreviewCard';
import CircleUpHeader from './CircleUpHeader';
import { readCircleUpLayoutPref } from './CircleUpPrepare';
import { fetchApprovedImages } from './circleUpProfileExtras';

type Phase = 'launching' | 'searching' | 'connecting' | 'deciding' | 'waiting_other';
type CandidateFilter = 'matched' | 'not_matched' | 'everyone';
// How far out the search had to reach to find this person. The pool widens
// automatically: nearby first, then unlocked countries, then the rest of
// your country, then abroad - so the screen never sits empty while people
// are live somewhere in the world.
type CandidateScope = 'nearby' | 'unlocked' | 'national' | 'abroad';

interface CandidateRow {
  candidate_id: string;
  is_matched: boolean;
  scope: CandidateScope;
  distance_km: number | null;
}

interface CandidateMeta {
  scope: CandidateScope;
  distanceKm: number | null;
}

const SCOPE_LABEL: Record<CandidateScope, string> = {
  nearby: 'Nearby',
  unlocked: 'Unlocked country',
  national: 'Elsewhere in your country',
  abroad: 'Abroad',
};

interface SessionRow {
  id: string;
  user_a: string;
  user_b: string;
  user_a_decision: 'pending' | 'accept' | 'pass';
  user_b_decision: 'pending' | 'accept' | 'pass';
  status: 'pending_accept' | 'accepted' | 'declined' | 'ended';
}

const POLL_INTERVAL_MS = 2500;
const CANDIDATE_POLL_INTERVAL_MS = 4000;
const CONNECT_COUNTDOWN_SECONDS = 5;
const DECIDE_COUNTDOWN_SECONDS = 10;
const WAITING_TIMEOUT_MS = 30000;
const LAUNCH_STEP_MS = 550;
// ~15s of searching with nobody visible before offering a way out, instead of
// leaving "Circling now..." spinning forever with no explanation.
const NO_MATCH_HINT_AFTER_ATTEMPTS = 6;

const FILTER_TABS: { key: CandidateFilter; label: string }[] = [
  { key: 'matched', label: 'Matched' },
  { key: 'not_matched', label: 'Not Matched' },
  { key: 'everyone', label: 'Everyone' },
];

const CircleUpMatching = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLon, setMyLon] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('launching');
  const [launchCount, setLaunchCount] = useState(1);
  const [candidate, setCandidate] = useState<CircleProfile | null>(null);
  const [candidateShareSettings, setCandidateShareSettings] = useState<CircleUpShareSettings>(DEFAULT_SHARE_SETTINGS);
  const [candidateExtraPhotos, setCandidateExtraPhotos] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(CONNECT_COUNTDOWN_SECONDS);
  const [decideCountdown, setDecideCountdown] = useState(DECIDE_COUNTDOWN_SECONDS);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [isPremium, setIsPremium] = useState(false);

  // Who's actually browsable right now, replacing the old blind auto-pairing -
  // this is the live "who's available" grid.
  const [candidates, setCandidates] = useState<CircleProfile[]>([]);
  const [candidateMeta, setCandidateMeta] = useState<Record<string, CandidateMeta>>({});
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [filter, setFilter] = useState<CandidateFilter>('everyone');
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const filterRef = useRef<CandidateFilter>('everyone');

  const pollTimerRef = useRef<number | null>(null);
  const candidatePollTimerRef = useRef<number | null>(null);
  const waitingTimeoutRef = useRef<number | null>(null);
  // Guards every async continuation (poll results, realtime callbacks)
  // against firing after cancel/unmount - this screen has several
  // overlapping timers and a realtime subscription all racing each other.
  const activeRef = useRef(true);

  const clearPollTimer = () => {
    if (pollTimerRef.current) { window.clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
  };
  const clearCandidatePollTimer = () => {
    if (candidatePollTimerRef.current) { window.clearTimeout(candidatePollTimerRef.current); candidatePollTimerRef.current = null; }
  };
  const clearWaitingTimeout = () => {
    if (waitingTimeoutRef.current) { window.clearTimeout(waitingTimeoutRef.current); waitingTimeoutRef.current = null; }
  };

  // Shared by both the passive "someone else picked me" poll and the
  // explicit "I picked them" action below - whichever gets a real session
  // first wins, and both stop their own loops the moment this succeeds.
  // Returns false (and does nothing else) if the matched profile can't be
  // loaded yet, so the caller knows to keep polling instead of getting stuck.
  const enterConnecting = useCallback(async (newSessionId: string, matchedUserId: string): Promise<boolean> => {
    const [profiles, shareRes, imagesByUser] = await Promise.all([
      fetchCircleProfilesByIds([matchedUserId]),
      supabase.from('circle_up_queue').select('share_settings').eq('user_id', matchedUserId).single(),
      fetchApprovedImages([matchedUserId]),
    ]);
    if (!activeRef.current) return true;
    if (profiles.length === 0) return false;

    clearPollTimer();
    clearCandidatePollTimer();
    setCandidate(profiles[0]);
    setCandidateShareSettings((shareRes.data?.share_settings as CircleUpShareSettings) || DEFAULT_SHARE_SETTINGS);
    // The first (main) photo is already the card's own background - only
    // the rest count as "extra" for the gallery.
    setCandidateExtraPhotos((imagesByUser[matchedUserId] || []).slice(1));
    setSessionId(newSessionId);
    setPhase('connecting');
    return true;
  }, []);

  // Passive check only - does NOT auto-pick anyone. Lets someone sitting in
  // the browse grid still get pulled in the instant another user's
  // handleSelectCandidate picks them.
  const checkSession = useCallback(async (uid: string) => {
    if (!activeRef.current) return;
    const { data, error } = await supabase.rpc('circle_up_check_session', { p_user_id: uid });
    if (!activeRef.current) return;
    const row = Array.isArray(data) ? data[0] : data;
    if (!error && row?.session_id && row?.matched_user_id) {
      const entered = await enterConnecting(row.session_id, row.matched_user_id);
      if (entered) return;
    }
    setPollAttempts((n) => n + 1);
    pollTimerRef.current = window.setTimeout(() => checkSession(uid), POLL_INTERVAL_MS);
  }, [enterConnecting]);

  // Live "who's available" grid - always reads the latest filter via
  // filterRef so a tab switch takes effect on the very next tick instead of
  // a stale closure from when the loop started.
  const fetchCandidates = useCallback(async (uid: string) => {
    if (!activeRef.current) return;
    const { data, error } = await supabase.rpc('circle_up_list_candidates', {
      p_user_id: uid,
      p_filter: filterRef.current,
    });
    if (!activeRef.current) return;
    const rows = (Array.isArray(data) ? data : []) as CandidateRow[];
    if (!error && rows.length > 0) {
      const ids = rows.map((r) => r.candidate_id);
      const profiles = await fetchCircleProfilesByIds(ids);
      if (!activeRef.current) return;
      // The RPC already returns nearest-tier-first (nearby, then unlocked
      // countries, then rest of country, then abroad); fetchCircleProfilesByIds
      // doesn't preserve that order, so it's reapplied here.
      const order = new Map(ids.map((id, i) => [id, i]));
      const meta: Record<string, CandidateMeta> = {};
      rows.forEach((r) => { meta[r.candidate_id] = { scope: r.scope, distanceKm: r.distance_km }; });
      setCandidateMeta(meta);
      setCandidates([...profiles].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
    } else {
      setCandidates([]);
      setCandidateMeta({});
    }
    candidatePollTimerRef.current = window.setTimeout(() => fetchCandidates(uid), CANDIDATE_POLL_INTERVAL_MS);
  }, []);

  const changeFilter = (next: CandidateFilter) => {
    if (next === filterRef.current || !userId) return;
    setFilter(next);
    filterRef.current = next;
    if (phase === 'searching') {
      clearCandidatePollTimer();
      fetchCandidates(userId);
    }
  };

  const handleSelectCandidate = async (target: CircleProfile) => {
    if (!userId || selectingId) return;
    setSelectingId(target.id);
    setSelectError(null);
    const { data, error } = await supabase.rpc('circle_up_request_session', {
      p_user_id: userId,
      p_target_id: target.id,
    });
    if (!activeRef.current) return;
    setSelectingId(null);
    const row = Array.isArray(data) ? data[0] : data;
    if (!error && row?.session_id && row?.matched_user_id) {
      const entered = await enterConnecting(row.session_id, row.matched_user_id);
      if (entered) return;
    }
    // Target left, got picked by someone else first, or went stale - the
    // background grid poll will refresh the list on its own next tick.
    setSelectError(`${target.first_name} is no longer available.`);
    window.setTimeout(() => { if (activeRef.current) setSelectError(null); }, 3000);
  };

  // Resets my own queue row to a fresh 'waiting' state (session_id cleared)
  // so the checkSession/fetchCandidates loops actually search for someone
  // new instead of just handing back the pairing that just ended.
  const resetOwnQueueAndSearch = useCallback(async (uid: string) => {
    if (!activeRef.current) return;
    await supabase.from('circle_up_queue').upsert({ user_id: uid, status: 'waiting', session_id: null }, { onConflict: 'user_id' });
    if (!activeRef.current) return;
    setCandidate(null);
    setCandidateShareSettings(DEFAULT_SHARE_SETTINGS);
    setCandidateExtraPhotos([]);
    setSessionId(null);
    setPollAttempts(0);
    setPhase('searching');
    checkSession(uid);
    fetchCandidates(uid);
  }, [checkSession, fetchCandidates]);

  useEffect(() => {
    activeRef.current = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/'); return; }
      const [{ data: profile }, { data: subRows }] = await Promise.all([
        supabase.from('profiles').select('latitude,longitude').eq('id', user.id).single(),
        supabase.rpc('get_current_subscription_status', { p_user_id: user.id }),
      ]);
      if (!activeRef.current) return;
      setUserId(user.id);
      setMyLat(profile?.latitude ?? null);
      setMyLon(profile?.longitude ?? null);
      const subRow = Array.isArray(subRows) ? subRows[0] : subRows;
      setIsPremium(!!subRow && subRow.plan_name === 'premium' && !!subRow.is_active);

      // "1, 2, 3" launch beat before the search itself starts - purely a
      // brief, deliberate transition so tapping Ready feels like it did
      // something, not an instant jump into a spinner.
      for (const n of [1, 2, 3]) {
        if (!activeRef.current) return;
        setLaunchCount(n);
        await new Promise((resolve) => window.setTimeout(resolve, LAUNCH_STEP_MS));
      }
      if (!activeRef.current) return;
      setPhase('searching');
      checkSession(user.id);
      fetchCandidates(user.id);
    })();

    return () => {
      activeRef.current = false;
      clearPollTimer();
      clearCandidatePollTimer();
      clearWaitingTimeout();
    };
  }, [navigate, checkSession, fetchCandidates]);

  // 5-second "Finding Your Match" countdown, purely cosmetic
  // anticipation-building once a candidate is found - not the search itself.
  useEffect(() => {
    if (phase !== 'connecting') return;
    setCountdown(CONNECT_COUNTDOWN_SECONDS);
    const interval = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          window.clearInterval(interval);
          if (activeRef.current) setPhase('deciding');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  // 10-second Accept/Pass window - not responding counts as a Pass, same as
  // the other person moving on if you never answer. handlePassRef always
  // points at the latest handlePass (defined further down, closes over
  // sessionId/userId) so this effect doesn't need it as a dependency.
  const handlePassRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (phase !== 'deciding') return;
    setDecideCountdown(DECIDE_COUNTDOWN_SECONDS);
    const interval = window.setInterval(() => {
      setDecideCountdown((c) => {
        if (c <= 1) {
          window.clearInterval(interval);
          handlePassRef.current();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  // Source of truth for the other side's decision once matched - both
  // Pass and Accept race against this exact same subscription on the
  // other person's device.
  useEffect(() => {
    if (!sessionId || !userId) return;
    const channel = supabase
      .channel(`circle-up-session:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'circle_up_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          if (!activeRef.current) return;
          const row = payload.new as SessionRow;
          const myDecision = row.user_a === userId ? row.user_a_decision : row.user_b_decision;
          const otherDecision = row.user_a === userId ? row.user_b_decision : row.user_a_decision;

          if (row.status === 'declined' || otherDecision === 'pass') {
            clearWaitingTimeout();
            resetOwnQueueAndSearch(userId);
            return;
          }
          if (myDecision === 'accept' && otherDecision === 'accept') {
            clearWaitingTimeout();
            navigate(`/circle-up/call?session=${sessionId}&layout=${readCircleUpLayoutPref()}`);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, userId, navigate, resetOwnQueueAndSearch]);

  const handlePass = async () => {
    if (!sessionId || !userId) return;
    clearWaitingTimeout();
    const { data: row } = await supabase.from('circle_up_sessions').select('user_a').eq('id', sessionId).single();
    const myField = row?.user_a === userId ? 'user_a_decision' : 'user_b_decision';
    await supabase
      .from('circle_up_sessions')
      .update({ [myField]: 'pass', status: 'declined', ended_at: new Date().toISOString(), ended_reason: 'passed' })
      .eq('id', sessionId);
    resetOwnQueueAndSearch(userId);
  };
  handlePassRef.current = handlePass;

  const handleAccept = async () => {
    if (!sessionId || !userId) return;
    const { data: row } = await supabase
      .from('circle_up_sessions')
      .select('user_a,user_b,user_a_decision,user_b_decision')
      .eq('id', sessionId)
      .single();
    if (!row) return;
    const iAmUserA = row.user_a === userId;
    const myField = iAmUserA ? 'user_a_decision' : 'user_b_decision';
    const otherDecision = iAmUserA ? row.user_b_decision : row.user_a_decision;

    await supabase.from('circle_up_sessions').update({ [myField]: 'accept' }).eq('id', sessionId);

    if (otherDecision === 'accept') {
      await supabase
        .from('circle_up_sessions')
        .update({ status: 'accepted', accepted_at: new Date().toISOString(), livekit_room_name: `circleup-${sessionId}` })
        .eq('id', sessionId)
        .eq('status', 'pending_accept');
      navigate(`/circle-up/call?session=${sessionId}&layout=${readCircleUpLayoutPref()}`);
      return;
    }

    setPhase('waiting_other');
    waitingTimeoutRef.current = window.setTimeout(() => {
      if (!activeRef.current) return;
      resetOwnQueueAndSearch(userId);
    }, WAITING_TIMEOUT_MS);
  };

  const handleCancel = async () => {
    clearPollTimer();
    clearCandidatePollTimer();
    clearWaitingTimeout();
    const uid = userId;
    const sid = sessionId;
    activeRef.current = false;
    if (sid) {
      await supabase
        .from('circle_up_sessions')
        .update({ status: 'declined', ended_at: new Date().toISOString(), ended_reason: 'cancelled' })
        .eq('id', sid);
    }
    if (uid) {
      await supabase.from('circle_up_queue').delete().eq('user_id', uid);
    }
    navigate('/circle-up');
  };

  const distanceKm =
    candidate && myLat != null && myLon != null && candidate.latitude != null && candidate.longitude != null
      ? Math.round(calculateDistance(myLat, myLon, candidate.latitude, candidate.longitude))
      : null;

  // The person shown large in the circle right now. featuredIndex just keeps
  // counting up as you tap "show someone else", wrapping around the live
  // list, so it stays valid however the list shrinks or grows between polls.
  const featured = candidates.length > 0 ? candidates[featuredIndex % candidates.length] : null;
  const featuredAge = featured ? calculateAge(featured.date_of_birth) : null;
  const featuredMeta = featured ? candidateMeta[featured.id] : undefined;
  const featuredWhere = featured
    ? [
        featuredMeta?.distanceKm != null
          ? `${formatDistance(featuredMeta.distanceKm, featured.country_code)} away`
          : [featured.city, featured.country].filter(Boolean).join(', '),
        featuredMeta && featuredMeta.scope !== 'nearby' ? SCOPE_LABEL[featuredMeta.scope] : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';



  return (
    <div className="h-[100dvh] w-full bg-black flex flex-col">
      <CircleUpHeader onBack={handleCancel} backLabel="Cancel" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0 py-4">
        {phase === 'launching' && (
          <div className="flex flex-col items-center gap-3">
            <span key={launchCount} className="text-6xl font-bold text-white animate-in zoom-in-50 duration-300">
              {launchCount}
            </span>
            <p className="text-white/40 text-sm">Going live…</p>
          </div>
        )}

        {phase === 'searching' && (
          <div className="flex flex-col items-center gap-4 w-full max-w-sm">
            {!featured ? (
              <>
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-pink-500/25 border-t-pink-500 animate-spin" />
                  <HoppingLogo size={44} />
                </div>
                <p className="text-white font-semibold text-center">Circling now to find you a match…</p>
                <p className="text-white/40 text-sm text-center">
                  We start with people near you and keep widening the search — across your country, then abroad.
                </p>
              </>
            ) : (
              <>
                {/* The person themselves fills the circle now, instead of a
                    logo spinning over an empty ring - you see who you're
                    about to meet before you accept. */}
                <div className="relative w-40 h-40">
                  <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 opacity-70 blur-[2px]" />
                  <div className="relative w-full h-full rounded-full overflow-hidden border-2 border-white/20 bg-neutral-800">
                    {featured.firstImage ? (
                      <img
                        src={getDetailImageUrl(featured.firstImage)}
                        alt={featured.first_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-pink-500/30 to-purple-600/30" />
                    )}
                    {selectingId === featured.id && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <span className="absolute bottom-1 right-1 px-2 py-0.5 rounded-full bg-black/70 border border-white/15 text-[10px] text-white/80">
                    Live
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1 -mt-1">
                  <p className="text-white font-bold text-lg">
                    {featured.first_name}
                    {featuredAge ? `, ${featuredAge}` : ''}
                  </p>
                  <p className="text-white/45 text-xs text-center">{featuredWhere}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectCandidate(featured)}
                  disabled={!!selectingId}
                  className="w-full py-3.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold shadow-lg shadow-pink-500/25 disabled:opacity-50"
                >
                  Accept
                </button>

                {candidates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setFeaturedIndex((i) => i + 1)}
                    disabled={!!selectingId}
                    className="text-white/50 text-xs underline disabled:opacity-40"
                  >
                    Show someone else ({candidates.length - 1} more live)
                  </button>
                )}

                {candidates.length > 1 && (
                  <div className="flex items-center gap-3 w-full overflow-x-auto py-1">
                    {candidates.map((c, i) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setFeaturedIndex(i)}
                        disabled={!!selectingId}
                        className="flex flex-col items-center gap-1 shrink-0 disabled:opacity-40"
                      >
                        <div
                          className={`w-12 h-12 rounded-full overflow-hidden border-2 bg-neutral-800 ${
                            c.id === featured.id ? 'border-pink-500' : 'border-white/15'
                          }`}
                        >
                          {c.firstImage ? (
                            <img src={getDetailImageUrl(c.firstImage)} alt={c.first_name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-pink-500/30 to-purple-600/30" />
                          )}
                        </div>
                        <span className="text-white/60 text-[10px] truncate w-12 text-center">{c.first_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {selectError && <p className="text-pink-400 text-xs text-center">{selectError}</p>}

            <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-full p-1">
              {FILTER_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => changeFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    filter === key ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'text-white/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {pollAttempts >= NO_MATCH_HINT_AFTER_ATTEMPTS && candidates.length === 0 && (
              <div className="w-full rounded-2xl border border-pink-500/20 bg-white/[0.03] p-4 mt-1 flex flex-col items-center gap-3">
                <p className="text-white/60 text-xs text-center">
                  No one is live right now — near you or abroad. Still looking, and you can also:
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/?tab=profile')}
                  className="w-full py-2.5 rounded-full border border-white/20 text-white text-sm font-medium"
                >
                  Expand your visibility in preferences
                </button>
                {!isPremium && (
                  <button
                    type="button"
                    onClick={() => navigate('/?tab=profile')}
                    className="w-full py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-medium"
                  >
                    Go Premium for a wider circle
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {phase === 'connecting' && candidate && (
          <div className="flex flex-col items-center gap-6 w-full">
            <h2 className="text-white font-bold text-lg">Finding Your Match</h2>
            <p className="text-white/40 text-sm text-center -mt-4">We're connecting you with someone who fits your preferences.</p>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-pink-500/40 bg-neutral-800">
                <div className="w-full h-full bg-gradient-to-br from-pink-500/30 to-purple-600/30" />
              </div>
              <Heart className="w-6 h-6 text-pink-500 fill-pink-500" />
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-pink-500/40 bg-neutral-800">
                {candidate.firstImage && (
                  <img src={getDetailImageUrl(candidate.firstImage)} alt={candidate.first_name} className="w-full h-full object-cover" />
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-pink-500/20 bg-white/[0.03] px-6 py-3 flex items-center gap-3">
              <span className="text-white/60 text-sm">Connecting…</span>
              <span className="text-2xl font-bold text-pink-400 tabular-nums">{String(countdown).padStart(2, '0')}</span>
            </div>
          </div>
        )}

        {phase === 'deciding' && candidate && (
          <div className="w-full flex flex-col items-center gap-4">
            <h2 className="text-white font-bold text-lg">New Match</h2>
            <p className="text-white/40 text-sm -mt-3">Do you want to connect?</p>
            <MatchPreviewCard
              profile={candidate}
              distanceKm={distanceKm}
              shareSettings={candidateShareSettings}
              extraPhotos={candidateExtraPhotos}
            />
            <div className="flex items-center gap-6 mt-1">
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePass}
                  className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/15"
                  aria-label="Pass"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <span className="text-white/50 text-xs font-medium tabular-nums w-5 text-center">{decideCountdown}s</span>
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAccept}
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-pink-500/30"
                  aria-label="Accept"
                >
                  <Heart className="w-6 h-6 fill-white" />
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === 'waiting_other' && candidate && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-pink-500/40 bg-neutral-800">
              {candidate.firstImage && (
                <img src={getDetailImageUrl(candidate.firstImage)} alt={candidate.first_name} className="w-full h-full object-cover" />
              )}
            </div>
            <div className="w-10 h-10 rounded-full border-2 border-pink-500/30 border-t-pink-500 animate-spin" />
            <p className="text-white font-semibold">Waiting for {candidate.first_name}…</p>
            <button type="button" onClick={handleCancel} className="text-white/40 text-sm underline">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CircleUpMatching;
