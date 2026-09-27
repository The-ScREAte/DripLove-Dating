import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Video as VideoIcon, VideoOff, MicOff, Columns2, PictureInPicture2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchCircleProfilesByIds, CircleProfile } from '@/utils/circlePoolFetch';
import { Switch } from '@/components/ui/switch';
import CircleUpHeader from './CircleUpHeader';
import MatchPreviewCard, { CircleUpShareSettings, DEFAULT_SHARE_SETTINGS } from './MatchPreviewCard';

export type CircleUpLayoutPref = 'floating' | 'split';
const LAYOUT_PREF_KEY = 'driplove_circle_up_layout_pref';

export const readCircleUpLayoutPref = (): CircleUpLayoutPref => {
  try {
    const raw = window.localStorage.getItem(LAYOUT_PREF_KEY);
    return raw === 'split' ? 'split' : 'floating';
  } catch {
    return 'floating';
  }
};

// Standalone route (like /games) - no props from MainApp, so it resolves
// its own current user the same way useSubscription/useEnhancedSubscription
// already do elsewhere in this codebase.
const CircleUpPrepare = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<CircleProfile | null>(null);
  const [permissionState, setPermissionState] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [goingLive, setGoingLive] = useState(false);
  const [shareSettings, setShareSettings] = useState<CircleUpShareSettings>(DEFAULT_SHARE_SETTINGS);
  const [layoutPref, setLayoutPref] = useState<CircleUpLayoutPref>('floating');

  useEffect(() => {
    setLayoutPref(readCircleUpLayoutPref());

    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/');
        return;
      }
      if (cancelled) return;
      setUserId(user.id);

      // Clear any stale queue/session state from a previous visit that
      // ended without a clean cancel (app kill, crash, back-swipe).
      await supabase.from('circle_up_queue').delete().eq('user_id', user.id);

      const profiles = await fetchCircleProfilesByIds([user.id]);
      if (!cancelled && profiles.length > 0) setMyProfile(profiles[0]);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPermissionState('granted');
      } catch {
        if (!cancelled) setPermissionState('denied');
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [navigate]);

  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
  };

  const chooseLayout = (pref: CircleUpLayoutPref) => {
    setLayoutPref(pref);
    try { window.localStorage.setItem(LAYOUT_PREF_KEY, pref); } catch { /* device storage unavailable, not critical */ }
  };

  const handleReady = async () => {
    if (!userId || goingLive) return;
    setGoingLive(true);
    const { error } = await supabase
      .from('circle_up_queue')
      .upsert({ user_id: userId, status: 'waiting', session_id: null, share_settings: shareSettings }, { onConflict: 'user_id' });
    if (error) {
      setGoingLive(false);
      return;
    }
    navigate('/circle-up/matching');
  };

  return (
    <div className="h-[100dvh] w-full bg-black flex flex-col">
      <CircleUpHeader onBack={() => navigate('/?tab=circle')} backLabel="Back to Circle" />

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex flex-col items-center px-6 pt-2 pb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center mb-3 shadow-lg shadow-pink-500/30">
            <VideoIcon className="w-7 h-7 text-white" />
          </div>
          <p className="text-white/50 text-sm text-center">Go live and meet someone new in real time.</p>
        </div>

        <div className="flex items-center justify-center px-6 pb-6">
          <div className="relative w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden bg-neutral-900 border border-pink-500/20">
            {permissionState === 'granted' && camOn && (
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover scale-x-[-1]" />
            )}
            {permissionState === 'checking' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {permissionState === 'denied' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <VideoOff className="w-8 h-8 text-white/40" />
                <p className="text-white/60 text-sm">Camera and microphone access is needed to go live. Enable it in your device settings.</p>
              </div>
            )}
            {(permissionState !== 'granted' || !camOn) && permissionState !== 'checking' && permissionState !== 'denied' && (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                <VideoOff className="w-8 h-8 text-white/30" />
              </div>
            )}

            {permissionState === 'granted' && (
              <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`w-11 h-11 rounded-full flex items-center justify-center border ${micOn ? 'bg-white/10 border-white/20 text-white' : 'bg-white text-black border-white'}`}
                  aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button
                  type="button"
                  onClick={toggleCam}
                  className={`w-11 h-11 rounded-full flex items-center justify-center border ${camOn ? 'bg-white/10 border-white/20 text-white' : 'bg-white text-black border-white'}`}
                  aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
                >
                  {camOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {myProfile && (
          <div className="px-6 pb-6">
            <p className="text-white/40 text-xs font-medium uppercase tracking-wide mb-2">Your profile</p>
            <div className="flex items-center gap-3 rounded-2xl border border-pink-500/20 bg-white/[0.03] p-3">
              <div className="w-14 flex-shrink-0">
                <MatchPreviewCard profile={myProfile} distanceKm={null} shareSettings={shareSettings} size="compact" />
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">This is what your match will see</p>
                <p className="text-white/40 text-xs">Based on the sharing choices below</p>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 pb-6">
          <p className="text-white/40 text-xs font-medium uppercase tracking-wide mb-2">Share with your match</p>
          <div className="rounded-2xl border border-pink-500/20 bg-white/[0.03] divide-y divide-white/[0.06]">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-white text-sm">Age</span>
              <Switch
                checked={shareSettings.age}
                onCheckedChange={(v) => setShareSettings((s) => ({ ...s, age: v }))}
                className="data-[state=checked]:bg-pink-500"
              />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-white text-sm">Location &amp; distance</span>
              <Switch
                checked={shareSettings.location}
                onCheckedChange={(v) => setShareSettings((s) => ({ ...s, location: v }))}
                className="data-[state=checked]:bg-pink-500"
              />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-white text-sm">Interests</span>
              <Switch
                checked={shareSettings.interests}
                onCheckedChange={(v) => setShareSettings((s) => ({ ...s, interests: v }))}
                className="data-[state=checked]:bg-pink-500"
              />
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <p className="text-white/40 text-xs font-medium uppercase tracking-wide mb-2">Video call view</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => chooseLayout('floating')}
              className={`flex flex-col items-center gap-2 rounded-2xl border px-4 py-3 ${
                layoutPref === 'floating' ? 'border-pink-500 bg-pink-500/10' : 'border-white/15 bg-white/[0.03]'
              }`}
            >
              <PictureInPicture2 className={`w-5 h-5 ${layoutPref === 'floating' ? 'text-pink-400' : 'text-white/50'}`} />
              <span className={`text-xs font-medium ${layoutPref === 'floating' ? 'text-white' : 'text-white/60'}`}>
                Little on top
              </span>
            </button>
            <button
              type="button"
              onClick={() => chooseLayout('split')}
              className={`flex flex-col items-center gap-2 rounded-2xl border px-4 py-3 ${
                layoutPref === 'split' ? 'border-pink-500 bg-pink-500/10' : 'border-white/15 bg-white/[0.03]'
              }`}
            >
              <Columns2 className={`w-5 h-5 ${layoutPref === 'split' ? 'text-pink-400' : 'text-white/50'}`} />
              <span className={`text-xs font-medium ${layoutPref === 'split' ? 'text-white' : 'text-white/60'}`}>
                Split screen
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 bg-black border-t border-white/5">
        <button
          type="button"
          onClick={handleReady}
          disabled={permissionState !== 'granted' || goingLive}
          className="w-full py-3.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-base disabled:opacity-40 transition-opacity"
        >
          {goingLive ? 'Getting ready…' : 'Ready'}
        </button>
      </div>
    </div>
  );
};

export default CircleUpPrepare;
