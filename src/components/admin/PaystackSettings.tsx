import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CreditCard, AlertCircle } from 'lucide-react';

const PaystackSettings = () => {
  const [paystackMode, setPaystackMode] = useState<'test' | 'live'>('test');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadPaystackMode();
  }, []);

  const loadPaystackMode = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('id', 'paystack_mode')
        .single();

      if (error) throw error;

      if (data?.value?.mode) {
        setPaystackMode(data.value.mode);
      }
    } catch (error) {
      console.error('Failed to load Paystack mode:', error);
      toast({
        title: 'Error',
        description: 'Failed to load Paystack settings',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    const newMode = paystackMode === 'test' ? 'live' : 'test';
    setSaving(true);

    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ 
          value: { mode: newMode },
          updated_at: new Date().toISOString()
        })
        .eq('id', 'paystack_mode');

      if (error) throw error;

      setPaystackMode(newMode);
      toast({
        title: 'Success',
        description: `Paystack switched to ${newMode} mode. All payment transactions will now use ${newMode} keys.`,
      });
    } catch (error) {
      console.error('Failed to update Paystack mode:', error);
      toast({
        title: 'Error',
        description: 'Failed to update Paystack mode',
        variant: 'destructive'
      });
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
            Paystack Settings
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="w-5 h-5" />
          Paystack Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex-1">
            <h3 className="font-medium">Payment Mode</h3>
            <p className="text-sm text-gray-600 mt-1">
              Current mode: <span className={`font-semibold ${paystackMode === 'live' ? 'text-green-600' : 'text-orange-600'}`}>
                {paystackMode.toUpperCase()}
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {paystackMode === 'test' 
                ? 'Test mode - No real charges. Use test cards for testing.' 
                : 'Live mode - Real transactions. Customers will be charged.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Test</span>
            <Switch
              checked={paystackMode === 'live'}
              onCheckedChange={handleToggle}
              disabled={saving}
            />
            <span className="text-sm text-gray-600">Live</span>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-800">
            <p className="font-medium">Important:</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Test mode uses test API keys (pk_test_... / sk_test_...)</li>
              <li>Live mode uses live API keys (pk_live_... / sk_live_...)</li>
              <li>Always test thoroughly before switching to live mode</li>
              <li>Mode change affects all users immediately</li>
            </ul>
          </div>
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          <p>• Public keys are configured in environment variables</p>
          <p>• Secret keys are securely stored in Supabase function secrets</p>
          <p>• Edge Functions automatically use the correct key based on this setting</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PaystackSettings;
