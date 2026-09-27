import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

const CircleUpEnded = () => {
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  return (
    <div className="h-[100dvh] w-full bg-black flex flex-col items-center justify-center px-6 gap-6">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-white font-bold text-xl">Connection ended</h1>
        <p className="text-white/40 text-sm">Hope that was a good one.</p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setFeedback('up')}
          className={`w-12 h-12 rounded-full border flex items-center justify-center ${feedback === 'up' ? 'bg-pink-500 border-pink-500 text-white' : 'bg-white/5 border-white/15 text-white/60'}`}
          aria-label="Enjoyed it"
        >
          <ThumbsUp className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setFeedback('down')}
          className={`w-12 h-12 rounded-full border flex items-center justify-center ${feedback === 'down' ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/15 text-white/60'}`}
          aria-label="Not for me"
        >
          <ThumbsDown className="w-5 h-5" />
        </button>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3 mt-4">
        <button
          type="button"
          onClick={() => navigate('/circle-up')}
          className="w-full py-3.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold"
        >
          Return to Circle Up
        </button>
        <button
          type="button"
          onClick={() => navigate('/?tab=dripcheck')}
          className="w-full py-3.5 rounded-full border border-white/20 text-white font-medium"
        >
          Keep Exploring
        </button>
      </div>
    </div>
  );
};

export default CircleUpEnded;
