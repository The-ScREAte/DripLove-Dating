import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const REQUIRED_PHRASE = 'i want to unsubscribe';

const Unsubscribe: React.FC = () => {
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleUnsubscribe = async () => {
    setLoading(true);
    setError('');
    try {
      // Call the edge function to cancel subscription
      const { error } = await supabase.functions.invoke('cancel-paystack-subscription');
      if (error) throw error;
      toast({
        title: 'Subscription Cancelled',
        description: 'Your premium subscription has been cancelled. You will retain access until the end of your billing period.',
      });
      navigate('/profile');
    } catch (err: any) {
      setError(err.message || 'Failed to cancel subscription.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center border-4 border-red-300/60 relative animate-fade-in">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Cancel Subscription</h1>
        <p className="mb-4 text-gray-700">To confirm, type <span className="font-mono bg-gray-100 px-2 py-1 rounded">{REQUIRED_PHRASE}</span> below and click Unsubscribe.</p>
        <Input
          value={confirmation}
          onChange={e => setConfirmation(e.target.value)}
          placeholder="Type the phrase exactly..."
          className="mb-2"
        />
        {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
        <Button
          onClick={handleUnsubscribe}
          disabled={loading || confirmation.trim().toLowerCase() !== REQUIRED_PHRASE}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg mt-2"
        >
          {loading ? 'Cancelling...' : 'Unsubscribe'}
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate('/profile')}
          className="w-full mt-2"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default Unsubscribe;
