import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { AdRates } from '@/utils/adEstimator';

// Same countries offered in the ad targeting checkboxes, plus "default" (any
// country not listed here falls back to it).
const COUNTRY_LABELS: Record<string, string> = {
  default: 'Default (any other country)',
  GH: 'Ghana', NG: 'Nigeria', US: 'United States', GB: 'United Kingdom',
  CA: 'Canada', KE: 'Kenya', ZA: 'South Africa', UG: 'Uganda', TZ: 'Tanzania', RW: 'Rwanda',
};
const ROW_ORDER = ['default', 'GH', 'NG', 'US', 'GB', 'CA', 'KE', 'ZA', 'UG', 'TZ', 'RW'];

const AdRatesSettings: React.FC = () => {
  const { toast } = useToast();
  const [rates, setRates] = useState<AdRates>({ default: 1000 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('app_settings').select('value').eq('id', 'ad_rates').single();
        if (error) throw error;
        if (data?.value) setRates(data.value as AdRates);
      } catch (error) {
        console.error('Failed to load ad rates:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: rates, updated_at: new Date().toISOString() })
        .eq('id', 'ad_rates');
      if (error) throw error;
      toast({ title: 'Success', description: 'Ad rates updated.' });
    } catch (error) {
      console.error('Failed to save ad rates:', error);
      toast({ title: 'Error', description: 'Failed to save ad rates', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5" />
            Ad Rates
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
        <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            <h3 className="font-medium">Ad Rates</h3>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {expanded && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Impressions per $1 of budget, by country. This is what advertisers' estimated-reach numbers are computed from.
              </p>
              <Button size="sm" className="h-7 px-2.5 text-xs shrink-0 ml-2" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ROW_ORDER.map((code) => (
                <div key={code} className="flex items-center justify-between gap-2 border rounded-md px-2 py-1.5">
                  <span className="text-xs text-gray-600 truncate">{COUNTRY_LABELS[code]}</span>
                  <Input
                    type="number"
                    min={0}
                    value={rates[code] ?? ''}
                    placeholder={String(rates.default)}
                    onChange={(e) => setRates((prev) => ({ ...prev, [code]: Number(e.target.value) || 0 }))}
                    className="h-7 w-20 text-xs"
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AdRatesSettings;
