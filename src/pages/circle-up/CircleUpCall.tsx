import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PhoneOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Placeholder for the real LiveKit video call (build-order step 3 - needs
// LIVEKIT_API_KEY/LIVEKIT_API_SECRET set up before the real Room/Track
// integration can connect). Everything up to here (queue, matching,
// preference-respecting pairing, mutual accept) is fully real and wired up;
// this screen just confirms the handoff works and lets a test run reach a
// clean end state.
const CircleUpCall = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) navigate('/circle-up');
  }, [sessionId, navigate]);

  const handleEnd = async () => {
    if (!sessionId || loading) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('circle_up_queue').delete().eq('user_id', user.id);
    }
    await supabase
      .from('circle_up_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString(), ended_reason: 'call_ended' })
      .eq('id', sessionId);
    navigate('/circle-up/ended');
  };

  return (
    <div className="h-[100dvh] w-full bg-black flex flex-col items-center justify-center px-6 gap-4">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center animate-pulse">
        <PhoneOff className="w-7 h-7 text-white" />
      </div>
      <p className="text-white font-semibold text-center">Video call connecting…</p>
      <p className="text-white/40 text-sm text-center max-w-xs">
        Both of you accepted — the live video screen goes here once video infrastructure is connected.
      </p>
      <button
        type="button"
        onClick={handleEnd}
        disabled={loading}
        className="mt-4 px-6 py-3 rounded-full bg-red-600 text-white font-semibold disabled:opacity-50"
      >
        End
      </button>
    </div>
  );
};

export default CircleUpCall;
