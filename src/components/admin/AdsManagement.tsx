import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Upload, Video, Image as ImageIcon, Play, Eye, Pause, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { compressImage } from '@/utils/imageCompression';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { optimizeImageUrl, getRawStorageUrl } from '@/utils/imageOptimizer';
import CropModal from '@/components/shared/CropModal';
// Lazy, not a static import: AdCard lives in the 'discover-tools' chunk while
// this file is in 'admin-tools' - a static import here creates a circular
// chunk dependency (discover-tools <-> admin-tools) that throws a
// "Cannot access '...' before initialization" TDZ error at load and blanks
// the whole app. A dynamic import is an async boundary Rollup doesn't fold
// into that same synchronous cycle.
const AdCard = React.lazy(() => import('@/components/discover/AdCard'));

// Matches the real card's own proportions (object-cover, full-bleed, no
// letterboxing) far more closely than a squarer frame would - this is what
// actually crops on Discover, so the crop preview needs to track it closely.
const AD_IMAGE_ASPECT = 9 / 16;

const LINK_AS_OPTIONS = [
  'Click here',
  'Learn more',
  'Shop now',
  'Sign up',
  'Visit site',
  'Download now',
  'Get started',
  'Join now',
];

interface Ad {
  id: string;
  image_url: string;
  video_url: string | null;
  media_type: string;
  name: string;
  about: string;
  link: string | null;
  link_as: string | null;
  created_at: string;
  target_countries: string[];
  is_active: boolean;
  created_by: string | null;
  business_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

interface AdvertiserApplication {
  id: string;
  business_name: string;
  contact_email: string;
  contact_phone: string;
  contact_phone_country: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

// Country options
const COUNTRY_OPTIONS = [
  { code: 'GH', name: 'Ghana' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'UG', name: 'Uganda' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'RW', name: 'Rwanda' },
];

const AdsManagement = () => {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewAd, setPreviewAd] = useState<Ad | null>(null);
  // The picked file is cropped BEFORE it ever gets uploaded - this holds a
  // local object URL for the cropper to work against while that happens.
  const [croppingFileUrl, setCroppingFileUrl] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    about: '',
    image_url: '',
    video_url: '',
    media_type: 'image',
    link: '',
    link_as: 'Click here',
    target_countries: [] as string[]
  });
  const { toast } = useToast();
  const [applications, setApplications] = useState<AdvertiserApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);

  useEffect(() => {
    fetchAds();
    fetchApplications();
  }, []);

  const fetchAds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAds((data as Ad[]) || []);
    } catch (error) {
      console.error('Error fetching ads:', error);
      toast({
        title: 'Error',
        description: 'Failed to load ads',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchApplications = async () => {
    setApplicationsLoading(true);
    try {
      const { data, error } = await supabase
        .from('advertiser_profiles')
        .select('id, business_name, contact_email, contact_phone, contact_phone_country, status, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setApplications((data as AdvertiserApplication[]) || []);
    } catch (error) {
      console.error('Error fetching advertiser applications:', error);
    } finally {
      setApplicationsLoading(false);
    }
  };

  const handleReviewApplication = async (id: string, status: 'approved' | 'rejected') => {
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { error } = await supabase
        .from('advertiser_profiles')
        .update({ status } as any)
        .eq('id', id);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (error) throw error;
      toast({ title: 'Success', description: `Advertiser ${status}` });
      fetchApplications();
    } catch (error) {
      console.error('Error reviewing advertiser application:', error);
      toast({ title: 'Error', description: 'Failed to update application', variant: 'destructive' });
    }
  };

  // Picking a file only stages it for cropping - nothing is uploaded until
  // the crop is confirmed (handleCroppedImageUpload below).
  const handleImageFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCroppingFileUrl(URL.createObjectURL(file));
  };

  const handleCroppedImageUpload = async (blob: Blob) => {
    setUploading(true);
    try {
      const compressedFile = await compressImage(new File([blob], 'crop.jpg', { type: 'image/jpeg' }));

      const mimeToExt: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif'
      };
      const fileExt = mimeToExt[compressedFile.type] || 'jpg';
      const fileName = `${Math.random().toString(36).slice(2)}.${fileExt}`;
      const filePath = `ads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(filePath, compressedFile, {
          contentType: compressedFile.type,
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('user-photos')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, image_url: publicUrl }));
      toast({
        title: 'Success',
        description: 'Image uploaded successfully'
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload image',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
      if (croppingFileUrl) URL.revokeObjectURL(croppingFileUrl);
      setCroppingFileUrl(null);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 50MB for video)
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'Video must be smaller than 50MB',
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `${Math.random().toString(36).slice(2)}.${fileExt}`;
      const filePath = `ads/videos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(filePath, file, {
          contentType: file.type,
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('user-photos')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, video_url: publicUrl }));
      toast({
        title: 'Success',
        description: 'Video uploaded successfully'
      });
    } catch (error) {
      console.error('Error uploading video:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload video',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const MAX_ABOUT_WORDS = 50;
  const countWords = (text: string): number => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  };
  // Truncates to the word limit rather than rejecting further typing - lets
  // the admin keep editing normally instead of hitting a wall mid-sentence.
  const limitWords = (text: string, max: number): string => {
    const words = text.split(/\s+/);
    if (words.length <= max) return text;
    return words.slice(0, max).join(' ');
  };

  // A bare domain like "www.example.com" has no protocol, so it fails
  // type="url" validation (and would 404 as a relative path if used as-is
  // in an href/window.open) - https:// is assumed if nothing else is given.
  const normalizeUrl = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const resetForm = () => {
    setFormData({ name: '', about: '', image_url: '', video_url: '', media_type: 'image', link: '', link_as: 'Click here', target_countries: [] });
    setEditingAdId(null);
  };

  const handleEditAd = (ad: Ad) => {
    setFormData({
      name: ad.name,
      about: ad.about,
      image_url: ad.image_url,
      video_url: ad.video_url || '',
      media_type: ad.media_type,
      link: ad.link || '',
      link_as: ad.link_as || 'Click here',
      target_countries: ad.target_countries || []
    });
    setEditingAdId(ad.id);
    setShowCreateForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.about) {
      toast({
        title: 'Error',
        description: 'Please fill all required fields',
        variant: 'destructive'
      });
      return;
    }

    if (formData.media_type === 'image' && !formData.image_url) {
      toast({
        title: 'Error',
        description: 'Please upload an image',
        variant: 'destructive'
      });
      return;
    }

    if (formData.media_type === 'video' && !formData.video_url) {
      toast({
        title: 'Error',
        description: 'Please upload a video',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        about: formData.about,
        image_url: formData.image_url || 'https://via.placeholder.com/400x300',
        video_url: formData.video_url || null,
        media_type: formData.media_type,
        link: formData.link ? normalizeUrl(formData.link) : null,
        link_as: formData.link_as || 'Click here',
        target_countries: formData.target_countries
      };

      const { error } = editingAdId
        ? await supabase.from('ads').update(payload as any).eq('id', editingAdId)
        : await supabase.from('ads').insert(payload as any);

      if (error) throw error;

      toast({
        title: 'Success',
        description: editingAdId ? 'Ad updated successfully' : 'Ad created successfully'
      });

      resetForm();
      setShowCreateForm(false);
      fetchAds();
    } catch (error) {
      console.error('Error saving ad:', error);
      toast({
        title: 'Error',
        description: editingAdId ? 'Failed to update ad' : 'Failed to create ad',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this ad?')) return;

    try {
      const { error } = await supabase
        .from('ads')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Ad deleted successfully'
      });

      fetchAds();
    } catch (error) {
      console.error('Error deleting ad:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete ad',
        variant: 'destructive'
      });
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('ads')
        .update({ is_active: !currentStatus } as any)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Ad ${!currentStatus ? 'resumed' : 'paused'} successfully`
      });

      fetchAds();
    } catch (error) {
      console.error('Error toggling ad status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update ad status',
        variant: 'destructive'
      });
    }
  };

  const groupedAds = ads.reduce<Record<string, Ad[]>>((groups, ad) => {
    const key = ad.business_name || 'DripLove (in-house)';
    (groups[key] = groups[key] || []).push(ad);
    return groups;
  }, {});

  return (
    <div className="space-y-6">
      {applications.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h3 className="text-lg font-semibold">Pending Advertiser Applications</h3>
            {applicationsLoading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : (
              applications.map((app) => (
                <div key={app.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{app.business_name}</p>
                    <p className="text-xs text-gray-500 truncate">{app.contact_email}</p>
                    <p className="text-xs text-gray-500">{app.contact_phone_country} {app.contact_phone}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleReviewApplication(app.id, 'approved')}>
                      Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleReviewApplication(app.id, 'rejected')}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <Collapsible
            open={showCreateForm}
            onOpenChange={(open) => {
              setShowCreateForm(open);
              if (!open) resetForm();
            }}
          >
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
              >
                <span className="text-base font-semibold">{editingAdId ? 'Edit Ad' : 'Create New Ad'}</span>
                {showCreateForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Title</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter ad name"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Short Description</label>
                <span className={`text-xs ${countWords(formData.about) >= MAX_ABOUT_WORDS ? 'text-orange-600' : 'text-gray-500'}`}>
                  {countWords(formData.about)}/{MAX_ABOUT_WORDS} words
                </span>
              </div>
              <Textarea
                value={formData.about}
                onChange={(e) => setFormData(prev => ({ ...prev, about: limitWords(e.target.value, MAX_ABOUT_WORDS) }))}
                placeholder="A short, one or two sentence description"
                rows={3}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Media Type</label>
              <Select 
                value={formData.media_type} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, media_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select media type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Image
                    </div>
                  </SelectItem>
                  <SelectItem value="video">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      Video
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.media_type === 'image' && (
              <div>
                <label className="block text-sm font-medium mb-2">Image</label>
                <div className="flex items-center gap-4">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFilePicked}
                    disabled={uploading}
                    className="flex-1"
                  />
                  {formData.image_url && (
                    <img
                      loading="lazy"
                      decoding="async"
                      src={getRawStorageUrl(formData.image_url)}
                      alt="Preview" 
                      className="w-20 h-20 object-cover rounded"
                    />
                  )}
                </div>
              </div>
            )}

            {formData.media_type === 'video' && (
              <div>
                <label className="block text-sm font-medium mb-2">Video (max 50MB)</label>
                <div className="flex items-center gap-4">
                  <Input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoUpload}
                    disabled={uploading}
                    className="flex-1"
                  />
                  {formData.video_url && (
                    <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center">
                      <Play className="w-8 h-8 text-gray-500" />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Link (Optional)</label>
              <Input
                value={formData.link}
                onChange={(e) => setFormData(prev => ({ ...prev, link: e.target.value }))}
                placeholder="e.g. www.example.com"
                type="text"
              />
              <p className="text-xs text-gray-500 mt-1">https:// is added automatically if you leave it off.</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Link Display Text</label>
              <Select
                value={formData.link_as}
                onValueChange={(value) => setFormData(prev => ({ ...prev, link_as: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select display text" />
                </SelectTrigger>
                <SelectContent>
                  {LINK_AS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Target Countries ({formData.target_countries.length} selected)
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                {COUNTRY_OPTIONS.map((country) => {
                  const isSelected = formData.target_countries.includes(country.code);
                  return (
                    <label
                      key={country.code}
                      className={`flex items-center gap-2 cursor-pointer text-sm p-2 rounded transition-colors ${
                        isSelected
                          ? 'bg-pink-50 border border-pink-300'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData(prev => ({ ...prev, target_countries: [...prev.target_countries, country.code] }));
                          } else {
                            setFormData(prev => ({ ...prev, target_countries: prev.target_countries.filter(c => c !== country.code) }));
                          }
                        }}
                        className="w-4 h-4 rounded-full border-2 border-pink-500 data-[state=checked]:bg-pink-600 data-[state=checked]:border-pink-600 data-[state=checked]:text-white"
                      />
                      <span className={isSelected ? 'font-medium' : ''}>
                        {country.name}
                      </span>
                    </label>
                  );
                })}
              </div>
              {formData.target_countries.length === 0 && (
                <p className="text-xs text-gray-500 mt-1 italic">
                  No countries selected (ad will show to all countries)
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading || uploading}
              className="w-full"
            >
              {loading ? (editingAdId ? 'Saving...' : 'Creating...') : (editingAdId ? 'Save Changes' : 'Create Ad')}
            </Button>
          </form>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold mb-4">My Ads</h3>
        {loading ? (
          <p className="text-center text-gray-500">Loading ads...</p>
        ) : ads.length === 0 ? (
          <p className="text-center text-gray-500">No ads yet</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedAds).map(([businessName, businessAds]) => (
              <div key={businessName}>
                <h4 className="text-sm font-semibold text-gray-500 mb-2">{businessName}</h4>
                <div className="grid gap-4">
                  {businessAds.map((ad) => (
              <Card key={ad.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex gap-3">
                    {ad.media_type === 'video' && ad.video_url ? (
                      <div className="w-12 h-12 shrink-0 bg-gray-100 rounded flex items-center justify-center relative">
                        <Video className="w-5 h-5 text-gray-500" />
                      </div>
                    ) : (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={optimizeImageUrl(ad.image_url, { width: 100, quality: 60 })}
                        alt={ad.name}
                        className="w-12 h-12 shrink-0 object-cover rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold truncate">{ad.name}</h4>
                        {!ad.is_active && (
                          <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded font-medium shrink-0">Paused</span>
                        )}
                      </div>
                  <div className="flex gap-1.5 mt-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPreviewAd(ad)}
                      title="Preview ad"
                      className="h-8 w-8"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditAd(ad)}
                      title="Edit ad"
                      className="h-8 w-8"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant={ad.is_active ? "outline" : "default"}
                      size="icon"
                      onClick={() => handleToggleActive(ad.id, ad.is_active)}
                      title={ad.is_active ? 'Pause' : 'Resume'}
                      className={`h-8 w-8 ${ad.is_active ? "text-orange-600 border-orange-300 hover:bg-orange-50" : "bg-green-600 hover:bg-green-700"}`}
                    >
                      {ad.is_active ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDelete(ad.id)}
                      title="Delete ad"
                      className="h-8 w-8"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal - renders the actual AdCard component used on Discover,
          not a hand-copied re-implementation, so this is a guaranteed exact
          match (colors, spacing, feathering, everything) rather than
          something that can quietly drift out of sync with the real card. */}
      <Dialog open={!!previewAd} onOpenChange={() => setPreviewAd(null)}>
        <DialogContent className="max-w-sm h-[80vh] p-0 bg-black border border-pink-500/30 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-white">Ad Preview</DialogTitle>
          </DialogHeader>
          {previewAd && (
            <div className="flex-1 min-h-0">
              <React.Suspense fallback={null}>
                <AdCard ad={previewAd} />
              </React.Suspense>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {croppingFileUrl && (
        <CropModal
          imageUrl={croppingFileUrl}
          aspect={AD_IMAGE_ASPECT}
          title="Crop Ad Image"
          helperText="This frame matches how the ad appears on Discover."
          onCancel={() => {
            URL.revokeObjectURL(croppingFileUrl);
            setCroppingFileUrl(null);
          }}
          onCropped={handleCroppedImageUpload}
        />
      )}
    </div>
  );
};

export default AdsManagement;
