import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Smartphone, Download, RefreshCw } from 'lucide-react';

interface AppUpdateConfig {
  id: string;
  is_enabled: boolean;
  current_version: string;
  target_platform: string;
  play_store_url: string;
  app_store_url: string;
  universal_link: string;
  update_message: string;
}

const AppUpdateSettings = () => {
  const [config, setConfig] = useState<AppUpdateConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_update_config')
        .select('*')
        .limit(1)
        .single();

      if (error) throw error;
      setConfig(data as AppUpdateConfig);
    } catch (error) {
      console.error('Error fetching app update config:', error);
      toast({
        title: 'Error',
        description: 'Failed to load app update settings',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_update_config')
        .update({
          is_enabled: config.is_enabled,
          current_version: config.current_version,
          target_platform: config.target_platform,
          play_store_url: config.play_store_url,
          app_store_url: config.app_store_url,
          universal_link: config.universal_link,
          update_message: config.update_message,
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id);

      if (error) throw error;

      toast({
        title: 'Saved',
        description: 'App update settings saved successfully'
      });
    } catch (error) {
      console.error('Error saving app update config:', error);
      toast({
        title: 'Error',
        description: 'Failed to save app update settings',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">No app update configuration found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Download className="w-5 h-5" />
          App Update Prompt
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div>
            <Label className="text-sm font-medium">Enable Update Prompt</Label>
            <p className="text-xs text-muted-foreground">
              Show update prompt to users on older app versions
            </p>
          </div>
          <Switch
            checked={config.is_enabled}
            onCheckedChange={(checked) => setConfig({ ...config, is_enabled: checked })}
          />
        </div>

        {/* Current Version */}
        <div className="space-y-2">
          <Label htmlFor="current_version">Current App Version</Label>
          <Input
            id="current_version"
            value={config.current_version}
            onChange={(e) => setConfig({ ...config, current_version: e.target.value })}
            placeholder="e.g., 1.2.0"
          />
          <p className="text-xs text-muted-foreground">
            Users with a version lower than this will see the update prompt
          </p>
        </div>

        {/* Target Platform */}
        <div className="space-y-2">
          <Label>Target Platform</Label>
          <Select
            value={config.target_platform}
            onValueChange={(value) => setConfig({ ...config, target_platform: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">
                <span className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  Both iOS & Android
                </span>
              </SelectItem>
              <SelectItem value="ios">
                <span className="flex items-center gap-2">
                  🍎 iOS Only
                </span>
              </SelectItem>
              <SelectItem value="android">
                <span className="flex items-center gap-2">
                  🤖 Android Only
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Update Message */}
        <div className="space-y-2">
          <Label htmlFor="update_message">Update Message</Label>
          <Textarea
            id="update_message"
            value={config.update_message}
            onChange={(e) => setConfig({ ...config, update_message: e.target.value })}
            placeholder="A new version is available! Update now for the best experience."
            rows={3}
          />
        </div>

        {/* Store URLs */}
        <div className="space-y-3 p-3 border rounded-lg">
          <h4 className="font-medium text-sm">Store Links</h4>
          
          <div className="space-y-2">
            <Label htmlFor="play_store_url" className="text-xs">Play Store URL (Android)</Label>
            <Input
              id="play_store_url"
              value={config.play_store_url}
              onChange={(e) => setConfig({ ...config, play_store_url: e.target.value })}
              placeholder="https://play.google.com/store/apps/..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="app_store_url" className="text-xs">App Store URL (iOS)</Label>
            <Input
              id="app_store_url"
              value={config.app_store_url}
              onChange={(e) => setConfig({ ...config, app_store_url: e.target.value })}
              placeholder="https://apps.apple.com/..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="universal_link" className="text-xs">Universal Link (Optional - redirects to correct store)</Label>
            <Input
              id="universal_link"
              value={config.universal_link}
              onChange={(e) => setConfig({ ...config, universal_link: e.target.value })}
              placeholder="https://driplove.love/r/..."
            />
          </div>
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>

        {/* Status Info */}
        {config.is_enabled && (
          <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-xs text-green-800 dark:text-green-200">
              ✅ Update prompt is <strong>active</strong>. Users on versions below {config.current_version} 
              {config.target_platform === 'both' ? ' on iOS and Android' : 
               config.target_platform === 'ios' ? ' on iOS' : ' on Android'} will see the update prompt.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AppUpdateSettings;
