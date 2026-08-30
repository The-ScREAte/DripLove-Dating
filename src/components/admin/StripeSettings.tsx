import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CreditCard } from 'lucide-react';

const TEST_CARDS = [
  { number: '4242 4242 4242 4242', note: 'Succeeds' },
  { number: '4000 0000 0000 9995', note: 'Declines' },
  { number: '4000 0025 0000 3155', note: 'Requires authentication' },
];

const StripeSettings = () => {
  const [stripeMode, setStripeMode] = useState<'test' | 'live'>('test');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadStripeMode();
  }, []);

  const loadStripeMode = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('id', 'stripe_mode')
        .single();

      if (error) throw error;

      const valueObj = data?.value as { mode?: 'test' | 'live' } | null;
      if (valueObj?.mode) {
        setStripeMode(valueObj.mode);
      }
    } catch (error) {
      console.error('Failed to load Stripe mode:', error);
      toast({ title: 'Error', description: 'Failed to load Stripe settings', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSetMode = async (newMode: 'test' | 'live') => {
    if (newMode === stripeMode || saving) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: { mode: newMode }, updated_at: new Date().toISOString() })
        .eq('id', 'stripe_mode');

      if (error) throw error;

      setStripeMode(newMode);
      toast({ title: 'Success', description: `Payment mode switched to ${newMode}.` });
    } catch (error) {
      console.error('Failed to update Stripe mode:', error);
      toast({ title: 'Error', description: 'Failed to update Stripe mode', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="w-5 h-5" />
            Payment Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            <h3 className="font-medium">Payment Mode</h3>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${stripeMode === 'live' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
              {stripeMode.toUpperCase()}
            </span>
          </div>
          {/* A real sliding toggle, not two separate buttons - the pink
              highlight animates left/right to whichever side is active. */}
          <button
            type="button"
            role="switch"
            aria-checked={stripeMode === 'live'}
            disabled={saving}
            onClick={() => handleSetMode(stripeMode === 'test' ? 'live' : 'test')}
            className="relative w-32 h-9 rounded-full bg-gray-200 disabled:opacity-60 shrink-0"
          >
            <span
              className="absolute top-1 bottom-1 w-[60px] rounded-full bg-pink-600 shadow transition-transform duration-200 ease-out"
              style={{ transform: stripeMode === 'live' ? 'translateX(60px)' : 'translateX(4px)' }}
            />
            <span className="relative z-10 grid grid-cols-2 h-full text-xs font-semibold">
              <span className={stripeMode === 'test' ? 'text-white flex items-center justify-center' : 'text-gray-600 flex items-center justify-center'}>Test</span>
              <span className={stripeMode === 'live' ? 'text-white flex items-center justify-center' : 'text-gray-600 flex items-center justify-center'}>Live</span>
            </span>
          </button>
        </div>

        {stripeMode === 'test' && (
          <div className="text-xs text-gray-500 border rounded-lg p-3 space-y-1">
            <p className="font-medium text-gray-600">Stripe test cards:</p>
            {TEST_CARDS.map((card) => (
              <p key={card.number}>
                <span className="font-mono">{card.number}</span> — {card.note} (any future date, any CVC, any ZIP)
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StripeSettings;
