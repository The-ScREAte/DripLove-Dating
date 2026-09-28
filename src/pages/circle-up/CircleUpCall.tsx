import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mic, MicOff, PhoneOff, Video as VideoIcon, VideoOff, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { CircleUpLayoutPref } from './CircleUpPrepare';

// Live one-to-one video call.
//
// Peer-to-peer WebRTC with public STUN servers, and Supabase Realtime
// (broadcast on a channel scoped to this session id) carrying the offer,
// answer and ICE candidates between the two devices. That combination works
// the same in a desktop browser, the published web app, the Android
// WebView and the iOS WKWebView, so it doesn't matter where either person
// is signed in - no third-party video service or extra keys needed.
//
// Role is decided by the session row, not by who arrives first: user_a
// always creates the offer, user_b always answers. Both sides announce
// themselves when they join, so whoever arrives second unblocks the other.

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302'] },
];

type CallState = 'preparing' | 'connecting' | 'live' | 'failed';

const VALID_LAYOUTS: CircleUpLayoutPref[] = ['floating', 'split-h', 'split-v'];

const CircleUpCall = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const layoutParam = searchParams.get('layout') || 'floating';
  const layout: CircleUpLayoutPref = (VALID_LAYOUTS as string[]).includes(layoutParam)
    ? (layoutParam as CircleUpLayoutPref)
    : 'floating';

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeRef = useRef(true);
  const offerSentRef = useRef(false);
  const joinEchoedRef = useRef(false);
  const endingRef = useRef(false);
  // ICE candidates can arrive before the remote description is set; they'd
  // be rejected, so they wait here until there's something to attach to.
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  const [callState, setCallState] = useState<CallState>('preparing');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteLive, setRemoteLive] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const cleanup = useCallback(() => {
    activeRef.current = false;
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const endCall = useCallback(
    async (reason: string) => {
      if (endingRef.current) return;
      endingRef.current = true;
      const sid = sessionId;
      cleanup();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from('circle_up_queue').delete().eq('user_id', user.id);
      if (sid) {
        await supabase
          .from('circle_up_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString(), ended_reason: reason })
          .eq('id', sid)
          .neq('status', 'ended');
      }
      navigate('/circle-up/matching');
    },
    [sessionId, cleanup, navigate]
  );

  useEffect(() => {
    if (!sessionId) {
      navigate('/circle-up');
      return;
    }
    activeRef.current = true;
    endingRef.current = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/'); return; }

      const { data: session } = await supabase
        .from('circle_up_sessions')
        .select('id,user_a,user_b,status')
        .eq('id', sessionId)
        .single();
      if (!activeRef.current) return;
      if (!session) { navigate('/circle-up'); return; }

      const isCaller = session.user_a === user.id;

      // 1. Camera and microphone.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        if (activeRef.current) {
          setCallState('failed');
          setErrorText('Camera and microphone access is needed for the call. Enable it in your device settings and try again.');
        }
        return;
      }
      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // 2. Peer connection.
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;

      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((t) => {
          if (!remoteStream.getTracks().some((existing) => existing.id === t.id)) {
            remoteStream.addTrack(t);
          }
        });
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        if (activeRef.current) setRemoteLive(true);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'ice',
            payload: { from: user.id, candidate: event.candidate.toJSON() },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (!activeRef.current) return;
        const s = pc.connectionState;
        if (s === 'connected') setCallState('live');
        else if (s === 'failed') {
          setCallState('failed');
          setErrorText('The connection dropped. Check your internet and try again.');
        }
      };

      const drainPendingIce = async () => {
        const queued = pendingIceRef.current;
        pendingIceRef.current = [];
        for (const c of queued) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* stale candidate */ }
        }
      };

      const sendOffer = async () => {
        if (offerSentRef.current || !channelRef.current) return;
        offerSentRef.current = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channelRef.current.send({
          type: 'broadcast',
          event: 'sdp',
          payload: { from: user.id, description: offer },
        });
      };

      // 3. Signalling channel.
      const channel = supabase.channel(`circle-up-call:${sessionId}`, {
        config: { broadcast: { self: false } },
      });
      channelRef.current = channel;

      channel
        .on('broadcast', { event: 'join' }, ({ payload }) => {
          if (!activeRef.current || payload?.from === user.id) return;
          // Echo once so whoever joined first also learns the other side
          // is here, whatever order the two devices arrived in.
          if (!joinEchoedRef.current) {
            joinEchoedRef.current = true;
            channel.send({ type: 'broadcast', event: 'join', payload: { from: user.id } });
          }
          if (isCaller) sendOffer();
        })
        .on('broadcast', { event: 'sdp' }, async ({ payload }) => {
          if (!activeRef.current || payload?.from === user.id || !payload?.description) return;
          const description = payload.description as RTCSessionDescriptionInit;
          if (description.type === 'offer') {
            if (isCaller) return;
            await pc.setRemoteDescription(new RTCSessionDescription(description));
            await drainPendingIce();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({ type: 'broadcast', event: 'sdp', payload: { from: user.id, description: answer } });
          } else if (description.type === 'answer' && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(description));
            await drainPendingIce();
          }
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          if (!activeRef.current || payload?.from === user.id || !payload?.candidate) return;
          if (!pc.remoteDescription) {
            pendingIceRef.current.push(payload.candidate);
            return;
          }
          try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { /* stale candidate */ }
        })
        .on('broadcast', { event: 'bye' }, ({ payload }) => {
          if (!activeRef.current || payload?.from === user.id) return;
          endCall('partner_left');
        })
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'circle_up_sessions', filter: `id=eq.${sessionId}` },
          (payload) => {
            if (!activeRef.current) return;
            const row = payload.new as { status?: string };
            if (row.status === 'ended' || row.status === 'declined') endCall('partner_left');
          }
        )
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED' || !activeRef.current) return;
          setCallState('connecting');
          channel.send({ type: 'broadcast', event: 'join', payload: { from: user.id } });
        });
    })();

    return () => {
      activeRef.current = false;
      pcRef.current?.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sessionId, navigate, endCall]);

  // Call timer, starts only once the two sides are actually connected.
  useEffect(() => {
    if (callState !== 'live') return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [callState]);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
  };

  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
  };

  const handleHangUp = () => {
    channelRef.current?.send({ type: 'broadcast', event: 'bye', payload: { from: 'me' } });
    endCall('call_ended');
  };

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const remotePane = (
    <div className="relative w-full h-full bg-neutral-900 overflow-hidden">
      <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
      {!remoteLive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900">
          <div className="w-10 h-10 rounded-full border-2 border-pink-500/30 border-t-pink-500 animate-spin" />
          <p className="text-white/50 text-sm">Connecting you both…</p>
        </div>
      )}
    </div>
  );

  const localPane = (
    <div className="relative w-full h-full bg-neutral-800 overflow-hidden">
      <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
      {!camOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          <VideoOff className="w-6 h-6 text-white/40" />
        </div>
      )}
    </div>
  );

  if (callState === 'failed') {
    return (
      <div className="h-[100dvh] w-full bg-black flex flex-col items-center justify-center px-8 gap-4">
        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
          <VideoOff className="w-7 h-7 text-white/60" />
        </div>
        <p className="text-white font-semibold text-center">Call could not start</p>
        <p className="text-white/45 text-sm text-center max-w-xs">{errorText}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 px-6 py-3 rounded-full bg-white/10 border border-white/20 text-white font-medium flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Try again
        </button>
        <button type="button" onClick={() => endCall('failed')} className="text-white/40 text-sm underline">
          Back to Circle Up
        </button>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-black flex flex-col">
      <div className="relative flex-1 min-h-0">
        {layout === 'floating' && (
          <>
            {remotePane}
            <div className="absolute bottom-4 right-4 w-28 h-40 rounded-2xl overflow-hidden ring-2 ring-white/20 shadow-lg">
              {localPane}
            </div>
          </>
        )}
        {layout === 'split-h' && (
          <div className="w-full h-full flex flex-col gap-[2px]">
            <div className="flex-1 min-h-0">{remotePane}</div>
            <div className="flex-1 min-h-0">{localPane}</div>
          </div>
        )}
        {layout === 'split-v' && (
          <div className="w-full h-full flex gap-[2px]">
            <div className="flex-1 min-w-0">{remotePane}</div>
            <div className="flex-1 min-w-0">{localPane}</div>
          </div>
        )}

        <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
          <span className="px-3 py-1 rounded-full bg-black/55 border border-white/10 text-white/75 text-xs font-medium tabular-nums">
            {callState === 'live' ? clock : 'Connecting…'}
          </span>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-center gap-5 py-6 bg-black">
        <button
          type="button"
          onClick={toggleMic}
          aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
          className={`w-14 h-14 rounded-full flex items-center justify-center border ${
            micOn ? 'bg-white/10 border-white/20 text-white' : 'bg-white text-black border-white'
          }`}
        >
          {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
        </button>

        <button
          type="button"
          onClick={handleHangUp}
          aria-label="End call"
          className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-600/30"
        >
          <PhoneOff className="w-7 h-7" />
        </button>

        <button
          type="button"
          onClick={toggleCam}
          aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
          className={`w-14 h-14 rounded-full flex items-center justify-center border ${
            camOn ? 'bg-white/10 border-white/20 text-white' : 'bg-white text-black border-white'
          }`}
        >
          {camOn ? <VideoIcon className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
};

export default CircleUpCall;
