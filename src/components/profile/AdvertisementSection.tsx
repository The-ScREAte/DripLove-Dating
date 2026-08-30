import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Video, Image as ImageIcon, Eye, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { compressImage } from '@/utils/imageCompression';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { optimizeImageUrl } from '@/utils/imageOptimizer';
import CropModal from '@/components/shared/CropModal';
// Lazy, not a static import: AdCard lives in the 'discover-tools' chunk while
// this file is in 'profile-tools' - a static import here creates a circular
// chunk dependency (discover-tools <-> profile-tools) that throws a
// "Cannot access '...' before initialization" TDZ error at load and blanks
// the whole app. A dynamic import is an async boundary Rollup doesn't fold
// into that same synchronous cycle.
const AdCard = React.lazy(() => import('@/components/discover/AdCard'));
import { COUNTRY_DIAL_CODES, flagEmoji } from '@/utils/countryDialCodes';
import { Megaphone, Clock, XCircle } from 'lucide-react';

// Same frame Discover's real card actually crops to (object-cover, full-bleed).
const AD_IMAGE_ASPECT = 9 / 16;
const MAX_ABOUT_WORDS = 50;

const LINK_AS_OPTIONS = [
  'Click here', 'Learn more', 'Shop now', 'Sign up', 'Visit site', 'Download now', 'Get started', 'Join now',
];

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
}

interface AdvertiserProfile {
  business_name: string;
  contact_email: string;
  contact_phone: string;
  contact_phone_country: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface AdvertisementSectionProps {
  currentUser: { id: string } | null;
  /** Set when the section was opened from outside (e.g. tapping "Advertise"
   * on an ad card in Discover) - opens the create form immediately. */
  startWithForm?: boolean;
}

const emptyForm = {
  name: '', about: '', image_url: '', video_url: '', media_type: 'image',
  link: '', link_as: 'Click here', target_countries: [] as string[],
};

const emptyOnboardingForm = {
  businessName: '', contactEmail: '', contactPhone: '', contactCountryCode: 'GH', agreed: false,
};

// Only the columns "My Ads" actually renders - keeps this section's initial
// load light, since it's shown inline inside Profile rather than lazily.
const AD_LIST_COLUMNS = 'id, image_url, video_url, media_type, name, about, link, link_as, created_at, target_countries, is_active, created_by';

const AdvertisementSection: React.FC<AdvertisementSectionProps> = ({ currentUser, startWithForm }) => {
  const { toast } = useToast();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewAd, setPreviewAd] = useState<Ad | null>(null);
  const [croppingFileUrl, setCroppingFileUrl] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(!!startWithForm);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  // Advertiser onboarding: null while loading, 'none' if they've never
  // applied, otherwise the row itself (pending/approved/rejected).
  const [advertiserProfile, setAdvertiserProfile] = useState<AdvertiserProfile | 'none' | null>(null);
  const [showOnboardingForm, setShowOnboardingForm] = useState(false);
  const [onboardingForm, setOnboardingForm] = useState(emptyOnboardingForm);
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);

  const fetchAdvertiserProfile = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const { data, error } = await supabase
        .from('advertiser_profiles')
        .select('business_name, contact_email, contact_phone, contact_phone_country, status')
        .eq('id', currentUser.id)
        .maybeSingle();
      if (error) throw error;
      setAdvertiserProfile((data as AdvertiserProfile | null) || 'none');
    } catch (error) {
      console.error('Error fetching advertiser profile:', error);
      setAdvertiserProfile('none');
    }
  }, [currentUser?.id]);

  const fetchAds = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ads')
        .select(AD_LIST_COLUMNS)
        .eq('created_by', currentUser.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAds((data as unknown as Ad[]) || []);
    } catch (error) {
      console.error('Error fetching your ads:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchAdvertiserProfile();
  }, [fetchAdvertiserProfile]);

  useEffect(() => {
    if (advertiserProfile !== 'none' && advertiserProfile !== null && advertiserProfile.status === 'approved') {
      fetchAds();
    }
  }, [advertiserProfile, fetchAds]);

  // Best-effort - the DB write is what actually matters, so a failed email
  // (e.g. SMTP not configured yet) never blocks the user's submission.
  const notifyAdmin = async (payload: Record<string, unknown>) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await supabase.functions.invoke('notify-ad-admin', {
        body: payload,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    } catch (error) {
      console.error('Error notifying admin:', error);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) return;
    if (!onboardingForm.businessName || !onboardingForm.contactEmail || !onboardingForm.contactPhone) {
      toast({ title: 'Error', description: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    if (!onboardingForm.agreed) {
      toast({ title: 'Error', description: 'Please accept the terms and conditions to continue', variant: 'destructive' });
      return;
    }

    const dial = COUNTRY_DIAL_CODES.find(c => c.code === onboardingForm.contactCountryCode)?.dial || '';

    setSubmittingOnboarding(true);
    try {
      const { error } = await supabase.from('advertiser_profiles').insert({
        id: currentUser.id,
        business_name: onboardingForm.businessName,
        contact_email: onboardingForm.contactEmail,
        contact_phone: onboardingForm.contactPhone,
        contact_phone_country: dial,
        status: 'pending',
      });
      if (error) throw error;

      notifyAdmin({
        type: 'advertiser_signup',
        businessName: onboardingForm.businessName,
        contactEmail: onboardingForm.contactEmail,
        contactPhone: onboardingForm.contactPhone,
        contactPhoneCountry: dial,
      });

      toast({ title: 'Application submitted', description: "We'll review your details and email you once you're approved to start posting ads." });
      setShowOnboardingForm(false);
      fetchAdvertiserProfile();
    } catch (error) {
      console.error('Error submitting advertiser application:', error);
      toast({ title: 'Error', description: 'Failed to submit your application', variant: 'destructive' });
    } finally {
      setSubmittingOnboarding(false);
    }
  };

  const MAX_ABOUT = MAX_ABOUT_WORDS;
  const countWords = (text: string) => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  };
  const limitWords = (text: string, max: number) => {
    const words = text.split(/\s+/);
    return words.length <= max ? text : words.slice(0, max).join(' ');
  };
  const normalizeUrl = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingAdId(null);
  };

  const handleEditAd = (ad: Ad) => {
    setFormData({
      name: ad.name, about: ad.about, image_url: ad.image_url, video_url: ad.video_url || '',
      media_type: ad.media_type, link: ad.link || '', link_as: ad.link_as || 'Click here',
      target_countries: ad.target_countries || [],
    });
    setEditingAdId(ad.id);
    setShowCreateForm(true);
  };

  const handleImageFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCroppingFileUrl(URL.createObjectURL(file));
  };

  const handleCroppedImageUpload = async (blob: Blob) => {
    if (!currentUser?.id) return;
    setUploading(true);
    try {
      const compressedFile = await compressImage(new File([blob], 'crop.jpg', { type: 'image/jpeg' }));
      const fileName = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).substring(2)}.jpg`;
      const filePath = `ads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(filePath, compressedFile, { contentType: 'image/jpeg', cacheControl: '3600' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('user-photos').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, image_url: publicUrl }));
    } catch (error) {
      console.error('Error uploading ad image:', error);
      toast({ title: 'Error', description: 'Failed to upload image', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (croppingFileUrl) URL.revokeObjectURL(croppingFileUrl);
      setCroppingFileUrl(null);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser?.id) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Error', description: 'Video must be smaller than 50MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop() || 'mp4';
      const filePath = `ads/videos/${currentUser.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(filePath, file, { contentType: file.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('user-photos').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, video_url: publicUrl }));
    } catch (error) {
      console.error('Error uploading ad video:', error);
      toast({ title: 'Error', description: 'Failed to upload video', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) return;

    if (!formData.name || !formData.about) {
      toast({ title: 'Error', description: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    if (formData.media_type === 'image' && !formData.image_url) {
      toast({ title: 'Error', description: 'Please upload an image', variant: 'destructive' });
      return;
    }
    if (formData.media_type === 'video' && !formData.video_url) {
      toast({ title: 'Error', description: 'Please upload a video', variant: 'destructive' });
      return;
    }

    if (advertiserProfile === 'none' || advertiserProfile === null || advertiserProfile.status !== 'approved') return;

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
        target_countries: formData.target_countries,
        created_by: currentUser.id,
        business_name: advertiserProfile.business_name,
        contact_email: advertiserProfile.contact_email,
        contact_phone: advertiserProfile.contact_phone,
        contact_phone_country: advertiserProfile.contact_phone_country,
        // The database enforces this too (a trigger forces it false/unchanged
        // for anyone who isn't an admin) - set explicitly here so the intent
        // is obvious without relying on that alone.
        is_active: false,
      };

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { error } = editingAdId
        ? await supabase.from('ads').update(payload as any).eq('id', editingAdId).eq('created_by', currentUser.id)
        : await supabase.from('ads').insert(payload as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (error) throw error;

      if (!editingAdId) {
        notifyAdmin({
          type: 'ad_submitted',
          adName: formData.name,
          adAbout: formData.about,
          businessName: advertiserProfile.business_name,
          contactEmail: advertiserProfile.contact_email,
          contactPhone: `${advertiserProfile.contact_phone_country} ${advertiserProfile.contact_phone}`,
        });
      }

      toast({
        title: editingAdId ? 'Ad updated' : 'Ad submitted',
        description: editingAdId
          ? 'Your changes were saved and will need review before going live again.'
          : "Your ad has been submitted and will go live once it's reviewed.",
      });
      resetForm();
      setShowCreateForm(false);
      fetchAds();
    } catch (error) {
      console.error('Error saving ad:', error);
      toast({ title: 'Error', description: 'Failed to save your ad', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!currentUser?.id || !confirm('Delete this ad?')) return;
    try {
      const { error } = await supabase.from('ads').delete().eq('id', id).eq('created_by', currentUser.id);
      if (error) throw error;
      fetchAds();
    } catch (error) {
      console.error('Error deleting ad:', error);
      toast({ title: 'Error', description: 'Failed to delete ad', variant: 'destructive' });
    }
  };

  if (advertiserProfile === null) {
    return <p className="text-center text-gray-400 text-sm py-4">Loading...</p>;
  }

  if (advertiserProfile === 'none' && !showOnboardingForm) {
    return (
      <div className="text-center py-4 space-y-3">
        <Megaphone className="w-8 h-8 text-pink-400 mx-auto" />
        <h3 className="text-white font-semibold">Setup to advertise on DripLove</h3>
        <p className="text-xs text-gray-400 max-w-xs mx-auto">
          Tell us about your business and get approved to run ads to DripLove's users.
        </p>
        <Button
          type="button"
          onClick={() => setShowOnboardingForm(true)}
          className="bg-pink-600 hover:bg-pink-700 text-white"
        >
          Advertise Now
        </Button>
      </div>
    );
  }

  if (advertiserProfile === 'none' && showOnboardingForm) {
    return (
      <form onSubmit={handleOnboardingSubmit} className="space-y-4">
        <div>
          <Label className="block text-sm font-medium mb-2 text-white">Business / Company Name</Label>
          <Input
            value={onboardingForm.businessName}
            onChange={(e) => setOnboardingForm(prev => ({ ...prev, businessName: e.target.value }))}
            placeholder="e.g. Meetup Events Ltd"
            className="bg-black border-pink-500/30 text-white"
            required
          />
        </div>

        <div>
          <Label className="block text-sm font-medium mb-2 text-white">Contact Email</Label>
          <Input
            type="email"
            value={onboardingForm.contactEmail}
            onChange={(e) => setOnboardingForm(prev => ({ ...prev, contactEmail: e.target.value }))}
            placeholder="you@business.com"
            className="bg-black border-pink-500/30 text-white"
            required
          />
        </div>

        <div>
          <Label className="block text-sm font-medium mb-2 text-white">Contact Phone</Label>
          <div className="flex gap-2">
            <Select
              value={onboardingForm.contactCountryCode}
              onValueChange={(value) => setOnboardingForm(prev => ({ ...prev, contactCountryCode: value }))}
            >
              <SelectTrigger className="w-32 bg-black border-pink-500/30 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black border-pink-500/30 max-h-72">
                {COUNTRY_DIAL_CODES.map((c) => (
                  <SelectItem key={c.code} className="text-white focus:bg-pink-500/15 focus:text-white" value={c.code}>
                    {flagEmoji(c.code)} {c.dial}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="tel"
              value={onboardingForm.contactPhone}
              onChange={(e) => setOnboardingForm(prev => ({ ...prev, contactPhone: e.target.value }))}
              placeholder="Phone number"
              className="flex-1 bg-black border-pink-500/30 text-white"
              required
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
          <Checkbox
            checked={onboardingForm.agreed}
            onCheckedChange={(checked) => setOnboardingForm(prev => ({ ...prev, agreed: checked === true }))}
            className="mt-0.5 border-pink-500 data-[state=checked]:bg-pink-600 data-[state=checked]:border-pink-600"
          />
          I accept the Terms and Conditions.
        </label>

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setShowOnboardingForm(false)} className="flex-1 bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white">
            Cancel
          </Button>
          <Button type="submit" disabled={submittingOnboarding} className="flex-1 bg-pink-600 hover:bg-pink-700 text-white">
            {submittingOnboarding ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </form>
    );
  }

  if (advertiserProfile !== 'none' && advertiserProfile.status === 'pending') {
    return (
      <div className="text-center py-4 space-y-2">
        <Clock className="w-8 h-8 text-pink-400 mx-auto" />
        <h3 className="text-white font-semibold">Application under review</h3>
        <p className="text-xs text-gray-400 max-w-xs mx-auto">
          We're reviewing your advertiser application for {advertiserProfile.business_name}.
          You'll be able to start creating ads once it's approved.
        </p>
      </div>
    );
  }

  if (advertiserProfile !== 'none' && advertiserProfile.status === 'rejected') {
    return (
      <div className="text-center py-4 space-y-2">
        <XCircle className="w-8 h-8 text-red-400 mx-auto" />
        <h3 className="text-white font-semibold">Application not approved</h3>
        <p className="text-xs text-gray-400 max-w-xs mx-auto">
          Your advertiser application wasn't approved. Contact driploveofficial@gmail.com for details.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
          <Collapsible
            open={showCreateForm}
            onOpenChange={(open) => { setShowCreateForm(open); if (!open) resetForm(); }}
          >
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-between bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white">
                <span className="text-sm font-semibold">{editingAdId ? 'Edit Ad' : 'Create Ad'}</span>
                {showCreateForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-xs text-gray-300 bg-pink-500/10 border border-pink-500/20 rounded-lg p-2.5">
                  Ads are reviewed before they go live. You'll see the status on each of your ads below. Within some few hours.
                </p>

                <div>
                  <Label className="block text-sm font-medium mb-2 text-white">Title</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter ad title"
                    className="bg-black border-pink-500/30 text-white"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium text-white">Short Description</Label>
                    <span className={`text-xs ${countWords(formData.about) >= MAX_ABOUT ? 'text-orange-400' : 'text-gray-400'}`}>
                      {countWords(formData.about)}/{MAX_ABOUT} words
                    </span>
                  </div>
                  <Textarea
                    value={formData.about}
                    onChange={(e) => setFormData(prev => ({ ...prev, about: limitWords(e.target.value, MAX_ABOUT) }))}
                    placeholder="A short, one or two sentence description"
                    rows={3}
                    className="bg-black border-pink-500/30 text-white"
                    required
                  />
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-2 text-white">Media Type</Label>
                  <Select
                    value={formData.media_type}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, media_type: value }))}
                  >
                    <SelectTrigger className="bg-black border-pink-500/30 text-white">
                      <SelectValue placeholder="Select media type" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-pink-500/30">
                      <SelectItem className="text-white focus:bg-pink-500/15 focus:text-white" value="image">
                        <div className="flex items-center gap-2"><ImageIcon className="w-4 h-4" />Image</div>
                      </SelectItem>
                      <SelectItem className="text-white focus:bg-pink-500/15 focus:text-white" value="video">
                        <div className="flex items-center gap-2"><Video className="w-4 h-4" />Video</div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.media_type === 'image' && (
                  <div>
                    <Label className="block text-sm font-medium mb-2 text-white">Image</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFilePicked}
                        disabled={uploading}
                        className="flex-1 bg-black border-pink-500/30 text-white file:text-white"
                      />
                      {formData.image_url && (
                        <img
                          loading="lazy" decoding="async"
                          src={optimizeImageUrl(formData.image_url, { width: 100, quality: 60 })}
                          alt="Preview"
                          className="w-14 h-14 object-cover rounded"
                        />
                      )}
                    </div>
                  </div>
                )}

                {formData.media_type === 'video' && (
                  <div>
                    <Label className="block text-sm font-medium mb-2 text-white">Video (max 50MB)</Label>
                    <Input
                      type="file"
                      accept="video/*"
                      onChange={handleVideoUpload}
                      disabled={uploading}
                      className="bg-black border-pink-500/30 text-white file:text-white"
                    />
                  </div>
                )}

                <div>
                  <Label className="block text-sm font-medium mb-2 text-white">Link (Optional)</Label>
                  <Input
                    value={formData.link}
                    onChange={(e) => setFormData(prev => ({ ...prev, link: e.target.value }))}
                    placeholder="e.g. www.example.com"
                    className="bg-black border-pink-500/30 text-white"
                  />
                  <p className="text-xs text-gray-400 mt-1">https:// is added automatically if you leave it off.</p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-2 text-white">Link Display Text</Label>
                  <Select
                    value={formData.link_as}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, link_as: value }))}
                  >
                    <SelectTrigger className="bg-black border-pink-500/30 text-white">
                      <SelectValue placeholder="Select display text" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-pink-500/30">
                      {LINK_AS_OPTIONS.map((option) => (
                        <SelectItem key={option} className="text-white focus:bg-pink-500/15 focus:text-white" value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-2 text-white">
                    Target Countries ({formData.target_countries.length} selected)
                  </Label>
                  <p className="text-xs text-gray-400 mb-2">Available to all countries if none are selected.</p>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-pink-500/20 rounded-md">
                    {COUNTRY_OPTIONS.map((country) => {
                      const isSelected = formData.target_countries.includes(country.code);
                      return (
                        <label
                          key={country.code}
                          className={`flex items-center gap-2 cursor-pointer text-sm p-2 rounded transition-colors ${
                            isSelected ? 'bg-pink-500/10 border border-pink-500/30' : 'hover:bg-neutral-800'
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              setFormData(prev => ({
                                ...prev,
                                target_countries: checked
                                  ? [...prev.target_countries, country.code]
                                  : prev.target_countries.filter(c => c !== country.code),
                              }));
                            }}
                            className="w-4 h-4 rounded-full border-2 border-pink-500 data-[state=checked]:bg-pink-600 data-[state=checked]:border-pink-600 data-[state=checked]:text-white"
                          />
                          <span className={isSelected ? 'font-medium text-white' : 'text-gray-200'}>{country.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <Button type="submit" disabled={loading || uploading} className="w-full bg-pink-600 hover:bg-pink-700 text-white">
                  {loading ? (editingAdId ? 'Saving...' : 'Submitting...') : (editingAdId ? 'Save Changes' : 'Submit Ad')}
                </Button>
              </form>
            </CollapsibleContent>
          </Collapsible>

          <div>
            <Label className="block text-sm font-medium mb-2 text-white">My Ads</Label>
            {loading ? (
              <p className="text-center text-gray-400 text-sm py-4">Loading...</p>
            ) : ads.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">You haven't created any ads yet</p>
            ) : (
              <div className="grid gap-2">
                {ads.map((ad) => (
                  <Card key={ad.id} className="bg-black border-pink-500/20">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex gap-3">
                        {ad.media_type === 'video' && ad.video_url ? (
                          <div className="w-12 h-12 shrink-0 bg-neutral-900 rounded flex items-center justify-center">
                            <Video className="w-5 h-5 text-gray-400" />
                          </div>
                        ) : (
                          <img
                            loading="lazy" decoding="async"
                            src={optimizeImageUrl(ad.image_url, { width: 100, quality: 60 })}
                            alt={ad.name}
                            className="w-12 h-12 shrink-0 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-white truncate">{ad.name}</h4>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                              ad.is_active ? 'bg-green-500/15 text-green-400' : 'bg-orange-500/15 text-orange-400'
                            }`}>
                              {ad.is_active ? 'Live' : 'Pending review'}
                            </span>
                          </div>
                          <div className="flex gap-1.5 mt-2">
                            <Button variant="outline" size="icon" onClick={() => setPreviewAd(ad)} title="Preview ad" className="h-8 w-8 bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => handleEditAd(ad)} title="Edit ad" className="h-8 w-8 bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => handleDelete(ad.id)} title="Delete ad" className="h-8 w-8">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
      </div>

      {/* Preview Modal - renders the real AdCard component for a guaranteed
          exact match with how it looks on Discover. */}
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
          onCancel={() => { URL.revokeObjectURL(croppingFileUrl); setCroppingFileUrl(null); }}
          onCropped={handleCroppedImageUpload}
        />
      )}
    </>
  );
};

export default AdvertisementSection;
