import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import HoppingLogo from '@/components/HoppingLogo';
import { fetchCircleProfilesByIds, CircleProfile } from '@/utils/circlePoolFetch';
import { calculateDistance } from '@/constants/locationData';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import MatchPreviewCard, { CircleUpShareSettings, DEFAULT_SHARE_SETTINGS } from './MatchPreviewCard';
import CircleUpHeader from './CircleUpHeader';
import { readCircleUpLayoutPref } from './CircleUpPrepare';
import { fetchApprovedImages } from './circleUpProfileExtras';

type Phase = 'launching' | 'searching' | 'connecting' | 'deciding' | 'waiting_other';

interface SessionRow {
  id: string;
  user_a: string;
  user_b: string;
  user_a_decision: 'pending' | 'accept' | 'pass';
  user_b_decision: 'pending' | 'accept' | 'pass';
  status: 'pending_accept' | 'accepted' | 'declined' | 'ended';
}

const POLL_INTERVAL_MS = 2500;
const CONNECT_COUNTDOWN_SECONDS = 5;
const DECIDE_COUNTDOWN_SECONDS = 10;
const WAITING_TIMEOUT_MS = 30000;
const LAUNCH_STEP_MS = 550;

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

  const pollTimerRef = useRef<number | null>(null);
  const waitingTimeoutRef = useRef<number | null>(null);
  // Guards every async continuation (poll results, realtime callbacks)
  // against firing after cancel/unmount - this screen has several
  // overlapping timers and a realtime subscription all racing each other.
  const activeRef = useRef(true);

  const clearPollTimer = () => {
    if (pollTimerRef.current) { window.clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
  };
  const clearWaitingTimeout = () => {
    if (waitingTimeoutRef.current) { window.clearTimeout(waitingTimeoutRef.current); waitingTimeoutRef.current = null; }
  };

  // Resets my own queue row to a fresh 'waiting' state (session_id cleared)
  // so the next circle_up_find_match call actually searches for someone
  // new instead of just handing back the pairing that just ended.
  const resetOwnQueueAndSearch = useCallback(async (uid: string) => {
    if (!activeRef.current) return;
    await supabase.from('circle_up_queue').upsert({ user_id: uid, status: 'waiting', session_id: null }, { onConflict: 'user_id' });
    if (!activeRef.current) return;
    setCandidate(null);
    setCandidateShareSettings(DEFAULT_SHARE_SETTINGS);
    setCandidateExtraPhotos([]);
    setSessionId(null);
    setPhase('searching');
    pollForMatch(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollForMatch = useCallback(async (uid: string) => {
    if (!activeRef.current) return;
    const { data, error } = await supabase.rpc('circle_up_find_match', { p_user_id: uid });
    if (!activeRef.current) return;
    const row = Array.isArray(data) ? data[0] : data;
    if (!error && row?.session_id && row?.matched_user_id) {
      const [profiles, shareRes, imagesByUser] = await Promise.all([
        fetchCircleProfilesByIds([row.matched_user_id]),
        supabase.from('circle_up_queue').select('share_settings').eq('user_id', row.matched_user_id).single(),
        fetchApprovedImages([row.matched_user_id]),
      ]);
      if (!activeRef.current) return;
      if (profiles.length === 0) {
        pollTimerRef.current = window.setTimeout(() => pollForMatch(uid), POLL_INTERVAL_MS);
        return;
      }
      setCandidate(profiles[0]);
      setCandidateShareSettings((shareRes.data?.share_settings as CircleUpShareSettings) || DEFAULT_SHARE_SETTINGS);
      // The first (main) photo is already the card's own background - only
      // the rest count as "extra" for the gallery.
      setCandidateExtraPhotos((imagesByUser[row.matched_user_id] || []).slice(1));
      setSessionId(row.session_id);
      setPhase('connecting');
      return;
    }
    pollTimerRef.current = window.setTimeout(() => pollForMatch(uid), POLL_INTERVAL_MS);
  }, []);

  useEffect(() => {
    activeRef.current = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/'); return; }
      const { data: profile } = await supabase.from('profiles').select('latitude,longitude').eq('id', user.id).single();
      if (!activeRef.current) return;
      setUserId(user.id);
      setMyLat(profile?.latitude ?? null);
      setMyLon(profile?.longitude ?? null);

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
      pollForMatch(user.id);
    })();

    return () => {
      activeRef.current = false;
      clearPollTimer();
      clearWaitingTimeout();
    };
  }, [navigate, pollForMatch]);

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

  return (
    <div className="h-[100dvh] w-full bg-black flex flex-col">
      <CircleUpHeader onBack={handleCancel} backLabel="Cancel" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        {phase === 'launching' && (
          <div className="flex flex-col items-center gap-3">
            <span key={launchCount} className="text-6xl font-bold text-white animate-in zoom-in-50 duration-300">
              {launchCount}
            </span>
            <p className="text-white/40 text-sm">Going live…</p>
          </div>
        )}

        {phase === 'searching' && (
          <div className="flex flex-col items-center gap-5">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-pink-500/25 border-t-pink-500 animate-spin" />
              <HoppingLogo size={44} />
            </div>
            <p className="text-white font-semibold">Circling now to find you a match…</p>
            <p className="text-white/40 text-sm text-center">We'll connect you the moment someone who fits your preferences is online.</p>
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
