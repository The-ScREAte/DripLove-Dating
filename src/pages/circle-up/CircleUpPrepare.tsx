import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Mic, Video as VideoIcon, VideoOff, MicOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Standalone route (like /games) - no props from MainApp, so it resolves
// its own current user the same way useSubscription/useEnhancedSubscription
// already do elsewhere in this codebase.
const CircleUpPrepare = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [goingLive, setGoingLive] = useState(false);

  useEffect(() => {
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

  const handleReady = async () => {
    if (!userId || goingLive) return;
    setGoingLive(true);
    const { error } = await supabase
      .from('circle_up_queue')
      .upsert({ user_id: userId, status: 'waiting', session_id: null }, { onConflict: 'user_id' });
    if (error) {
      setGoingLive(false);
      return;
    }
    navigate('/circle-up/matching');
  };

  return (
    <div className="h-[100dvh] w-full bg-black flex flex-col">
      <div className="flex items-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={() => navigate('/?tab=circle')}
          className="p-2 -ml-2 text-white/70 hover:text-white"
          aria-label="Back to Circle"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="flex flex-col items-center px-6 pt-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-pink-500/30">
          <VideoIcon className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">Circle Up</h1>
        <p className="text-white/50 text-sm text-center">Go live and meet someone new in real time.</p>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-6 min-h-0">
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

      <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="rounded-2xl border border-pink-500/20 bg-white/[0.03] px-4 py-3 mb-4">
          <p className="text-white text-sm font-semibold mb-0.5">Prepare</p>
          <p className="text-white/50 text-xs">Get ready to go live and be matched with someone who fits your preferences.</p>
        </div>
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
