import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { nanoid } from 'nanoid';
import { Copy, ExternalLink, Trash2, Link as LinkIcon } from 'lucide-react';

interface RedirectLink {
  id: string;
  ios_url: string | null;
  android_url: string | null;
  web_url: string;
  created_at: string;
  clicks: number;
  last_clicked_at: string | null;
}

const RedirectLinkCreator = () => {
  const [iosLink, setIosLink] = useState('');
  const [androidLink, setAndroidLink] = useState('');
  const [webLink, setWebLink] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [redirectLinks, setRedirectLinks] = useState<RedirectLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Always use production domain
  const DOMAIN = 'https://driplove.love';

  useEffect(() => {
    fetchRedirectLinks();
  }, []);

  const fetchRedirectLinks = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('redirects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRedirectLinks(data || []);
    } catch (error) {
      console.error('Error fetching redirect links:', error);
      toast({
        title: 'Error',
        description: 'Failed to load redirect links',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const validateUrl = (url: string): boolean => {
    if (!url) return true; // Empty is OK for optional fields
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleCreateRedirect = async () => {
    // Validate web link (required)
    if (!webLink.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Web link is required',
        variant: 'destructive',
      });
      return;
    }

    // Validate URL formats
    if (!validateUrl(webLink)) {
      toast({
        title: 'Validation Error',
        description: 'Web link must be a valid URL',
        variant: 'destructive',
      });
      return;
    }

    if (iosLink && !validateUrl(iosLink)) {
      toast({
        title: 'Validation Error',
        description: 'iOS link must be a valid URL',
        variant: 'destructive',
      });
      return;
    }

    if (androidLink && !validateUrl(androidLink)) {
      toast({
        title: 'Validation Error',
        description: 'Android link must be a valid URL',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      // Generate unique ID
      const uniqueId = nanoid(8);

      // Insert into database
      const { data, error } = await supabase
        .from('redirects')
        .insert({
          id: uniqueId,
          ios_url: iosLink.trim() || null,
          android_url: androidLink.trim() || null,
          web_url: webLink.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Success
      const redirectUrl = `${DOMAIN}/r/${uniqueId}`;
      
      toast({
        title: 'Success!',
        description: 'Redirect link created successfully',
      });

      // Copy to clipboard
      await navigator.clipboard.writeText(redirectUrl);
      toast({
        title: 'Copied!',
        description: 'Redirect link copied to clipboard',
      });

      // Reset form
      setIosLink('');
      setAndroidLink('');
      setWebLink('');

      // Refresh list
      fetchRedirectLinks();
    } catch (error) {
      console.error('Error creating redirect:', error);
      toast({
        title: 'Error',
        description: 'Failed to create redirect link',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = async (id: string) => {
    const redirectUrl = `${DOMAIN}/r/${id}`;
    try {
      await navigator.clipboard.writeText(redirectUrl);
      toast({
        title: 'Copied!',
        description: 'Redirect link copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!confirm('Are you sure you want to delete this redirect link?')) return;

    try {
      const { error } = await supabase
        .from('redirects')
        .delete()
        .eq('id', id);

      if (error) throw error;

      fetchRedirectLinks();
    } catch (error) {
      console.error('Error deleting redirect:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete redirect link',
        variant: 'destructive',
      });
    }
  };

  const handleTestLink = (id: string) => {
    const redirectUrl = `${DOMAIN}/r/${id}`;
    window.open(redirectUrl, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Create New Redirect */}
      <Card className="bg-black border-pink-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <LinkIcon className="w-5 h-5 text-pink-500" />
            Create Redirect Link
          </CardTitle>
          <p className="text-sm text-gray-400 mt-1">
            Generate smart redirect links that detect user device and redirect accordingly
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ios-link" className="text-white">
              iOS Link <span className="text-gray-500">(Optional)</span>
            </Label>
            <Input
              id="ios-link"
              type="url"
              placeholder="https://apps.apple.com/app/..."
              value={iosLink}
              onChange={(e) => setIosLink(e.target.value)}
              className="bg-black/40 border-pink-500/30 text-white placeholder:text-gray-600"
            />
            <p className="text-xs text-gray-500">App Store link for iPhone/iPad users</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="android-link" className="text-white">
              Android Link <span className="text-gray-500">(Optional)</span>
            </Label>
            <Input
              id="android-link"
              type="url"
              placeholder="https://play.google.com/store/apps/..."
              value={androidLink}
              onChange={(e) => setAndroidLink(e.target.value)}
              className="bg-black/40 border-pink-500/30 text-white placeholder:text-gray-600"
            />
            <p className="text-xs text-gray-500">Play Store link for Android users</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="web-link" className="text-white">
              Web Link <span className="text-red-400">*</span>
            </Label>
            <Input
              id="web-link"
              type="url"
              placeholder="https://driplove.love"
              value={webLink}
              onChange={(e) => setWebLink(e.target.value)}
              className="bg-black/40 border-pink-500/30 text-white placeholder:text-gray-600"
            />
            <p className="text-xs text-gray-500">Fallback link for desktop/other devices (required)</p>
          </div>

          <Button
            onClick={handleCreateRedirect}
            disabled={isCreating || !webLink.trim()}
            className="w-full bg-gradient-to-r from-pink-600 to-rose-700 hover:from-pink-500 hover:to-rose-600 text-white"
          >
            {isCreating ? 'Creating...' : 'Create Redirect Link'}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Redirect Links */}
      <Card className="bg-black border-pink-500/30">
        <CardHeader>
          <CardTitle className="text-white">Existing Redirect Links</CardTitle>
          <p className="text-sm text-gray-400 mt-1">
            Manage and track your redirect links
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : redirectLinks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No redirect links created yet
            </div>
          ) : (
            <div className="space-y-4">
              {redirectLinks.map((link) => (
                <div
                  key={link.id}
                  className="border border-pink-500/20 rounded-lg p-4 space-y-3 hover:border-pink-500/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    {/* min-w-0 is load-bearing here: without it, a flex item
                        never shrinks below its content's natural width no
                        matter what break-all says, so the long destination
                        URLs below were forcing this whole column wider than
                        the card and pushing the delete button off-screen. */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <code className="text-xs sm:text-sm font-mono bg-pink-500/10 text-pink-200 px-2 py-1 rounded break-all">
                          {DOMAIN}/r/{link.id}
                        </code>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleCopyLink(link.id)}
                          className="h-7 w-7 shrink-0 text-gray-300 hover:text-white hover:bg-pink-500/15"
                          title="Copy link"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleTestLink(link.id)}
                          className="h-7 w-7 shrink-0 text-gray-300 hover:text-white hover:bg-pink-500/15"
                          title="Open link"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-xs">
                        {link.ios_url && (
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="font-semibold text-gray-400 shrink-0 min-w-[60px]">iOS:</span>
                            <span className="text-gray-300 break-all min-w-0">{link.ios_url}</span>
                          </div>
                        )}
                        {link.android_url && (
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="font-semibold text-gray-400 shrink-0 min-w-[60px]">Android:</span>
                            <span className="text-gray-300 break-all min-w-0">{link.android_url}</span>
                          </div>
                        )}
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="font-semibold text-gray-400 shrink-0 min-w-[60px]">Web:</span>
                          <span className="text-gray-300 break-all min-w-0">{link.web_url}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-gray-500 pt-1 flex-wrap">
                        <span>Clicks: {link.clicks}</span>
                        <span>Created: {new Date(link.created_at).toLocaleDateString()}</span>
                        {link.last_clicked_at && (
                          <span>Last clicked: {new Date(link.last_clicked_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDeleteLink(link.id)}
                      className="h-8 w-8 shrink-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      title="Delete link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RedirectLinkCreator;
