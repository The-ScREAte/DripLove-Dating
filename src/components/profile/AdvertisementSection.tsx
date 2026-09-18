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
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import CropModal from '@/components/shared/CropModal';
// Lazy, not a static import: AdCard lives in the 'discover-tools' chunk while
// this file is in 'profile-tools' - a static import here creates a circular
// chunk dependency (discover-tools <-> profile-tools) that throws a
// "Cannot access '...' before initialization" TDZ error at load and blanks
// the whole app. A dynamic import is an async boundary Rollup doesn't fold
// into that same synchronous cycle.
const AdCard = React.lazy(() => import('@/components/discover/AdCard'));
import { COUNTRY_DIAL_CODES, flagEmoji } from '@/utils/countryDialCodes';
import { Megaphone, Clock, XCircle, CreditCard, CheckCircle2 } from 'lucide-react';
import StripeCardStep from './StripeCardStep';
import PaymentMethodsManager from './PaymentMethodsManager';
import { estimateImpressions, formatImpressions, DEFAULT_AD_RATES, type AdRates } from '@/utils/adEstimator';
import { computeSpentSoFar, computeDeliveryProgress } from '@/utils/adSpend';
import { Rocket, TrendingUp } from 'lucide-react';

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
  budget_per_day: number | null;
  duration_days: number | null;
  total_budget: number | null;
  placement: 'standard' | 'featured' | 'premium' | null;
  impressions: number;
  clicks: number;
  estimated_impressions_max: number | null;
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
  // Campaign step (budget/duration/audience/placement) - only used for a
  // brand new ad, never when editing an existing one.
  budgetPerDay: '10', durationDays: '7', targetAgeMin: '', targetAgeMax: '',
  targetGenders: [] as string[], placement: 'standard' as 'standard' | 'featured' | 'premium',
};

const BUDGET_PRESETS = [1, 5, 10, 25, 50];
const DURATION_PRESETS = [1, 3, 7, 14, 30];
const GENDER_OPTIONS = ['Male', 'Female'];

const emptyOnboardingForm = {
  businessName: '', contactEmail: '', contactPhone: '', contactCountryCode: 'US', agreed: false,
};

// Only the columns "My Ads" actually renders - keeps this section's initial
// load light, since it's shown inline inside Profile rather than lazily.
const AD_LIST_COLUMNS = 'id, image_url, video_url, media_type, name, about, link, link_as, created_at, target_countries, is_active, created_by, budget_per_day, duration_days, total_budget, placement, impressions, clicks, estimated_impressions_max';

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
  // 'content' = title/media/link (existing fields), 'campaign' = the new
  // budget/duration/audience/placement step, shown only for a brand new ad
  // (editing skips straight to a plain content update, no re-charging).
  const [adStep, setAdStep] = useState<'content' | 'campaign'>('content');
  const [adRates, setAdRates] = useState<AdRates>(DEFAULT_AD_RATES);
  const [launchingCampaign, setLaunchingCampaign] = useState(false);
  const [expandedMyAdId, setExpandedMyAdId] = useState<string | null>(null);

  // Advertiser onboarding: null while loading, 'none' if they've never
  // applied, otherwise the row itself (pending/approved/rejected).
  const [advertiserProfile, setAdvertiserProfile] = useState<AdvertiserProfile | 'none' | null>(null);
  const [showOnboardingForm, setShowOnboardingForm] = useState(false);
  const [onboardingForm, setOnboardingForm] = useState(emptyOnboardingForm);
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);
  // 'info' = business/contact fields, 'payment' = the Stripe card step that
  // follows it (card is collected before the application is ever created -
  // see handleCardSaved). loadingPayment covers the round trip to create the
  // Stripe SetupIntent between the two steps.
  const [onboardingStep, setOnboardingStep] = useState<'info' | 'payment'>('info');
  // Shown once the advertiser account exists (pending or approved) - toggles
  // between the ad-management view and the card-management view.
  const [advertiserSection, setAdvertiserSection] = useState<'ads' | 'payment'>('ads');
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);

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

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('app_settings').select('value').eq('id', 'ad_rates').single();
        if (data?.value) setAdRates(data.value as AdRates);
      } catch (error) {
        console.error('Error fetching ad rates:', error);
      }
    })();
  }, []);

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

  // Shared by both Stripe edge function calls below - they both need the
  // caller's own access token forwarded so the function can verify who's
  // asking (and, for the card lookup, that the payment method is actually
  // theirs) rather than trusting the request blindly.
  const invokeAuthed = async <T,>(fn: string, body: Record<string, unknown>): Promise<T> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not signed in');
    const { data, error } = await supabase.functions.invoke(fn, {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) throw error;
    if (data && data.success === false) throw new Error(data.error || `${fn} failed`);
    return data as T;
  };

  // Step 1 -> 2: validates the business/contact fields, then asks Stripe for
  // a SetupIntent to collect the card against. Nothing is written to our own
  // database yet - the advertiser_profiles row is only created once the card
  // is actually saved (see handleCardSaved), so there's never a row with
  // business info but no payment method on file.
  const handleContinueToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) return;
    if (!onboardingForm.businessName || !onboardingForm.contactEmail || !onboardingForm.contactPhone) {
      toast({ title: 'Error', description: 'Please fill all required fields', variant: 'destructive' });
      return;
    }

    setLoadingPayment(true);
    try {
      const result = await invokeAuthed<{ clientSecret: string; customerId: string }>('stripe-setup-intent', {});
      setStripeClientSecret(result.clientSecret);
      setStripeCustomerId(result.customerId);
      setOnboardingStep('payment');
    } catch (error) {
      console.error('Error starting card setup:', error);
      toast({ title: 'Error', description: 'Failed to start payment setup. Please try again.', variant: 'destructive' });
    } finally {
      setLoadingPayment(false);
    }
  };

  // Step 2: the card itself was already confirmed with Stripe directly by
  // StripeCardStep by this point - this just looks up the brand/last4 for
  // display and creates the advertiser_profiles row (business info + card
  // on file, status pending) in one shot.
  const handleCardSaved = async (paymentMethodId: string) => {
    if (!currentUser?.id) return;
    const dial = COUNTRY_DIAL_CODES.find(c => c.code === onboardingForm.contactCountryCode)?.dial || '';

    setSubmittingOnboarding(true);
    try {
      const cardInfo = await invokeAuthed<{ brand: string | null; last4: string | null }>(
        'stripe-confirm-card-setup',
        { paymentMethodId }
      );

      const { error } = await supabase.from('advertiser_profiles').insert({
        id: currentUser.id,
        business_name: onboardingForm.businessName,
        contact_email: onboardingForm.contactEmail,
        contact_phone: onboardingForm.contactPhone,
        contact_phone_country: dial,
        status: 'pending',
        stripe_customer_id: stripeCustomerId,
        stripe_payment_method_id: paymentMethodId,
        card_brand: cardInfo.brand,
        card_last4: cardInfo.last4,
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
      setOnboardingStep('info');
      setStripeClientSecret(null);
      setStripeCustomerId(null);
      fetchAdvertiserProfile();
    } catch (error) {
      console.error('Error submitting advertiser application:', error);
      toast({ title: 'Error', description: 'Failed to save your card and submit your application', variant: 'destructive' });
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
    setAdStep('content');
  };

  const handleEditAd = (ad: Ad) => {
    setFormData({
      ...emptyForm,
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

  // Editing an existing ad updates its content only - never re-charges or
  // touches campaign fields, so it stays a plain, direct save like before.
  // A brand NEW ad instead moves on to the campaign step (see
  // handleLaunchCampaign) rather than inserting anything here.
  const handleContentSubmit = async (e: React.FormEvent) => {
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

    if (!editingAdId) {
      setAdStep('campaign');
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
        target_countries: formData.target_countries,
      };

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { error } = await supabase.from('ads').update(payload as any).eq('id', editingAdId).eq('created_by', currentUser.id);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (error) throw error;

      toast({ title: 'Ad updated', description: 'Your changes were saved and will need review before going live again.' });
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

  // Charges the advertiser's card on file for the FULL campaign budget
  // (budgetPerDay x durationDays) upfront, then creates the ad row - content
  // still has to clear admin review (is_active stays false) before it's
  // actually shown, same gate as before, just with billing now attached.
  const handleLaunchCampaign = async () => {
    if (!currentUser?.id) return;
    if (advertiserProfile === 'none' || advertiserProfile === null || advertiserProfile.status !== 'approved') return;

    const budgetPerDay = Number(formData.budgetPerDay);
    const durationDays = Number(formData.durationDays);
    if (!budgetPerDay || budgetPerDay <= 0) {
      toast({ title: 'Error', description: 'Please choose a daily budget', variant: 'destructive' });
      return;
    }
    if (!durationDays || durationDays <= 0) {
      toast({ title: 'Error', description: 'Please choose a duration', variant: 'destructive' });
      return;
    }

    setLaunchingCampaign(true);
    try {
      const charge = await invokeAuthed<{ paymentIntentId: string; totalBudget: number }>(
        'stripe-charge-campaign',
        { budgetPerDay, durationDays }
      );

      const estimate = estimateImpressions(budgetPerDay, durationDays, formData.target_countries, adRates);

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
        is_active: false,
        budget_per_day: budgetPerDay,
        duration_days: durationDays,
        total_budget: charge.totalBudget,
        placement: formData.placement,
        target_age_min: formData.targetAgeMin ? Number(formData.targetAgeMin) : null,
        target_age_max: formData.targetAgeMax ? Number(formData.targetAgeMax) : null,
        target_genders: formData.targetGenders,
        estimated_impressions_min: estimate.totalMin,
        estimated_impressions_max: estimate.totalMax,
        stripe_payment_intent_id: charge.paymentIntentId,
      };

      const { error } = await supabase.from('ads').insert(payload);
      if (error) throw error;

      notifyAdmin({
        type: 'ad_submitted',
        adName: formData.name,
        adAbout: formData.about,
        businessName: advertiserProfile.business_name,
        contactEmail: advertiserProfile.contact_email,
        contactPhone: `${advertiserProfile.contact_phone_country} ${advertiserProfile.contact_phone}`,
      });

      toast({
        title: 'Campaign launched!',
        description: `$${charge.totalBudget.toFixed(2)} charged. Your ad will go live once it's reviewed.`,
      });
      resetForm();
      setAdStep('content');
      setShowCreateForm(false);
      fetchAds();
    } catch (error) {
      console.error('Error launching campaign:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to launch your campaign',
        variant: 'destructive',
      });
    } finally {
      setLaunchingCampaign(false);
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
    return <p className="text-center text-white/60 text-sm py-4">Loading...</p>;
  }

  if (advertiserProfile === 'none' && !showOnboardingForm) {
    return (
      <div className="text-center py-4 space-y-3">
        <Megaphone className="w-8 h-8 text-pink-400 mx-auto" />
        <h3 className="text-white font-semibold">Setup to advertise on DripLove</h3>
        <p className="text-xs text-white/60 max-w-xs mx-auto">
          Get access to millions of users on DripLove all over the world and reach a larger, specific audience.
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

  if (advertiserProfile === 'none' && showOnboardingForm && onboardingStep === 'payment' && stripeClientSecret) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-white font-semibold">Add a Payment Method</h3>
          <p className="text-xs text-white/60 mt-1">
            Add a payment method to use for your advertisement with {onboardingForm.businessName}. Payment is
            securely processed and stored by Stripe - DripLove never sees or stores your card details.
          </p>
        </div>

        <div className="rounded-lg border border-pink-500/20 bg-pink-500/5 p-3">
          <p className="text-xs text-white/80 leading-relaxed">
            Your card will not be charged today. Once your advertiser account is approved, charges for each
            ad will be made to this card based on the ad's price and the number of days it runs, in
            accordance with the Terms and Conditions accepted below.
          </p>
        </div>

        <label className="flex items-start gap-2 text-xs text-white/80 cursor-pointer">
          <Checkbox
            checked={onboardingForm.agreed}
            onCheckedChange={(checked) => setOnboardingForm(prev => ({ ...prev, agreed: checked === true }))}
            className="mt-0.5 border-pink-500 data-[state=checked]:bg-pink-600 data-[state=checked]:border-pink-600"
          />
          I accept the Terms and Conditions, including that my card will be charged for each ad based on its
          price and the number of days it runs.
        </label>

        <StripeCardStep
          clientSecret={stripeClientSecret}
          submitting={submittingOnboarding}
          canSubmit={onboardingForm.agreed}
          onCardSaved={handleCardSaved}
          onBack={() => setOnboardingStep('info')}
        />
      </div>
    );
  }

  if (advertiserProfile === 'none' && showOnboardingForm) {
    return (
      <form onSubmit={handleContinueToPayment} className="space-y-4">
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

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setShowOnboardingForm(false)} className="flex-1 bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white">
            Cancel
          </Button>
          <Button type="submit" disabled={loadingPayment} className="flex-1 bg-pink-600 hover:bg-pink-700 text-white">
            {loadingPayment ? 'Loading...' : 'Continue'}
          </Button>
        </div>
      </form>
    );
  }

  if (advertiserProfile !== 'none' && advertiserProfile.status === 'pending') {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={advertiserSection === 'ads' ? 'default' : 'outline'}
            onClick={() => setAdvertiserSection('ads')}
            className={advertiserSection === 'ads' ? 'flex-1 bg-pink-600 hover:bg-pink-700 text-white' : 'flex-1 bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white'}
          >
            Add Ads
          </Button>
          <Button
            type="button"
            variant={advertiserSection === 'payment' ? 'default' : 'outline'}
            onClick={() => setAdvertiserSection('payment')}
            className={advertiserSection === 'payment' ? 'flex-1 bg-pink-600 hover:bg-pink-700 text-white' : 'flex-1 bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white'}
          >
            <CreditCard className="w-4 h-4 mr-1.5" />
            Payment
          </Button>
        </div>

        {advertiserSection === 'payment' ? (
          <PaymentMethodsManager />
        ) : (
          <div className="text-center py-4 space-y-2">
            <Clock className="w-8 h-8 text-pink-400 mx-auto" />
            <h3 className="text-white font-semibold">Application under review</h3>
            <p className="text-xs text-white/60 max-w-xs mx-auto">
              We're reviewing your advertiser application for {advertiserProfile.business_name}.
              You'll be able to start creating ads once it's approved.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (advertiserProfile !== 'none' && advertiserProfile.status === 'rejected') {
    return (
      <div className="text-center py-4 space-y-2">
        <XCircle className="w-8 h-8 text-red-400 mx-auto" />
        <h3 className="text-white font-semibold">Application not approved</h3>
        <p className="text-xs text-white/60 max-w-xs mx-auto">
          Your advertiser application wasn't approved. Contact driploveofficial@gmail.com for details.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={advertiserSection === 'ads' ? 'default' : 'outline'}
            onClick={() => setAdvertiserSection('ads')}
            className={advertiserSection === 'ads' ? 'flex-1 bg-pink-600 hover:bg-pink-700 text-white' : 'flex-1 bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white'}
          >
            Add Ads
          </Button>
          <Button
            type="button"
            variant={advertiserSection === 'payment' ? 'default' : 'outline'}
            onClick={() => setAdvertiserSection('payment')}
            className={advertiserSection === 'payment' ? 'flex-1 bg-pink-600 hover:bg-pink-700 text-white' : 'flex-1 bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white'}
          >
            <CreditCard className="w-4 h-4 mr-1.5" />
            Payment
          </Button>
        </div>

        {advertiserSection === 'payment' && <PaymentMethodsManager />}

        {advertiserSection === 'ads' && (
        <>
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
              {adStep === 'content' ? (
              <form onSubmit={handleContentSubmit} className="space-y-4">
                <p className="text-xs text-white/80 bg-pink-500/10 border border-pink-500/20 rounded-lg p-2.5">
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
                    <span className={`text-xs ${countWords(formData.about) >= MAX_ABOUT ? 'text-orange-400' : 'text-white/60'}`}>
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
                          src={getDetailImageUrl(formData.image_url)}
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
                  <p className="text-xs text-white/60 mt-1">https:// is added automatically if you leave it off.</p>
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

                {editingAdId && (
                  <div>
                    <Label className="block text-sm font-medium mb-2 text-white">
                      Target Countries ({formData.target_countries.length} selected)
                    </Label>
                    <p className="text-xs text-white/60 mb-2">Available to all countries if none are selected.</p>
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
                            <span className={isSelected ? 'font-medium text-white' : 'text-white'}>{country.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Button type="submit" disabled={loading || uploading} className="w-full bg-pink-600 hover:bg-pink-700 text-white">
                  {loading ? 'Saving...' : editingAdId ? 'Save Changes' : 'Continue'}
                </Button>
              </form>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-white font-semibold flex items-center gap-1.5"><Rocket className="w-4 h-4 text-pink-400" />Set Up Your Campaign</h3>
                    <p className="text-xs text-white/60 mt-1">"{formData.name}" is ready. Now choose your budget, duration, audience and placement.</p>
                  </div>

                  <div>
                    <Label className="block text-sm font-medium mb-2 text-white">1. How much do you want to spend per day?</Label>
                    <div className="flex flex-wrap gap-2">
                      {BUDGET_PRESETS.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, budgetPerDay: String(amount) }))}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                            Number(formData.budgetPerDay) === amount ? 'bg-pink-600 border-pink-600 text-white' : 'border-pink-500/30 text-white/80 hover:bg-pink-500/10'
                          }`}
                        >
                          ${amount}/day
                        </button>
                      ))}
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={formData.budgetPerDay}
                      onChange={(e) => setFormData(prev => ({ ...prev, budgetPerDay: e.target.value }))}
                      placeholder="Custom amount"
                      className="mt-2 bg-black border-pink-500/30 text-white"
                    />
                  </div>

                  <div>
                    <Label className="block text-sm font-medium mb-2 text-white">2. How long do you want to advertise? (target, not a cutoff)</Label>
                    <div className="flex flex-wrap gap-2">
                      {DURATION_PRESETS.map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, durationDays: String(days) }))}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                            Number(formData.durationDays) === days ? 'bg-pink-600 border-pink-600 text-white' : 'border-pink-500/30 text-white/80 hover:bg-pink-500/10'
                          }`}
                        >
                          {days} {days === 1 ? 'day' : 'days'}
                        </button>
                      ))}
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={formData.durationDays}
                      onChange={(e) => setFormData(prev => ({ ...prev, durationDays: e.target.value }))}
                      placeholder="Custom days"
                      className="mt-2 bg-black border-pink-500/30 text-white"
                    />
                  </div>

                  <div>
                    <Label className="block text-sm font-medium mb-2 text-white">3. Who do you want to reach?</Label>
                    <p className="text-xs text-white/60 mb-2">Countries - available everywhere if none are selected.</p>
                    <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border border-pink-500/20 rounded-md mb-3">
                      {COUNTRY_OPTIONS.map((country) => {
                        const isSelected = formData.target_countries.includes(country.code);
                        return (
                          <label key={country.code} className={`flex items-center gap-2 cursor-pointer text-sm p-1.5 rounded transition-colors ${isSelected ? 'bg-pink-500/10 border border-pink-500/30' : 'hover:bg-neutral-800'}`}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                setFormData(prev => ({
                                  ...prev,
                                  target_countries: checked ? [...prev.target_countries, country.code] : prev.target_countries.filter(c => c !== country.code),
                                }));
                              }}
                              className="w-4 h-4 rounded-full border-2 border-pink-500 data-[state=checked]:bg-pink-600 data-[state=checked]:border-pink-600 data-[state=checked]:text-white"
                            />
                            <span className={isSelected ? 'font-medium text-white' : 'text-white'}>{country.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 mb-3">
                      <Input
                        type="number"
                        min={13}
                        value={formData.targetAgeMin}
                        onChange={(e) => setFormData(prev => ({ ...prev, targetAgeMin: e.target.value }))}
                        placeholder="Min age"
                        className="bg-black border-pink-500/30 text-white"
                      />
                      <Input
                        type="number"
                        min={13}
                        value={formData.targetAgeMax}
                        onChange={(e) => setFormData(prev => ({ ...prev, targetAgeMax: e.target.value }))}
                        placeholder="Max age"
                        className="bg-black border-pink-500/30 text-white"
                      />
                    </div>
                    <div className="flex gap-2">
                      {GENDER_OPTIONS.map((gender) => {
                        const isSelected = formData.targetGenders.includes(gender);
                        return (
                          <button
                            key={gender}
                            type="button"
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              targetGenders: isSelected ? prev.targetGenders.filter(g => g !== gender) : [...prev.targetGenders, gender],
                            }))}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${isSelected ? 'bg-pink-600 border-pink-600 text-white' : 'border-pink-500/30 text-white/80 hover:bg-pink-500/10'}`}
                          >
                            {gender}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <Label className="block text-sm font-medium mb-2 text-white">4. Where should your ad appear?</Label>
                    <div className="flex gap-2">
                      {(['standard', 'featured', 'premium'] as const).map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, placement: tier }))}
                          className={`flex-1 px-3 py-1.5 rounded-full text-sm font-medium border capitalize ${
                            formData.placement === tier ? 'bg-pink-600 border-pink-600 text-white' : 'border-pink-500/30 text-white/80 hover:bg-pink-500/10'
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(() => {
                    const estimate = estimateImpressions(
                      Number(formData.budgetPerDay) || 0,
                      Number(formData.durationDays) || 0,
                      formData.target_countries,
                      adRates
                    );
                    const totalBudget = (Number(formData.budgetPerDay) || 0) * (Number(formData.durationDays) || 0);
                    return (
                      <div className="rounded-lg border border-pink-500/20 bg-pink-500/5 p-3 space-y-1.5">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-white"><TrendingUp className="w-4 h-4 text-pink-400" />Your Campaign</p>
                        <p className="text-xs text-white/80">Budget: ${formData.budgetPerDay || 0}/day &middot; Duration: ~{formData.durationDays || 0} days &middot; Total: ${totalBudget.toFixed(2)}</p>
                        <p className="text-xs text-white/80">
                          Estimated daily impressions: {formatImpressions(estimate.dailyMin)}&ndash;{formatImpressions(estimate.dailyMax)}
                        </p>
                        <p className="text-xs text-white/80">
                          Estimated total impressions: {formatImpressions(estimate.totalMin)}&ndash;{formatImpressions(estimate.totalMax)}
                        </p>
                        <p className="text-[11px] text-white/40">
                          This is an estimate, not a guarantee. Duration is a target, not a cutoff - DripLove keeps showing your ad to matching users until it delivers the impressions your budget paid for, even if that takes longer than {formData.durationDays || 0} days.
                        </p>
                      </div>
                    );
                  })()}

                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setAdStep('content')} disabled={launchingCampaign} className="flex-1 bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white">
                      Back
                    </Button>
                    <Button type="button" onClick={handleLaunchCampaign} disabled={launchingCampaign} className="flex-1 bg-pink-600 hover:bg-pink-700 text-white">
                      {launchingCampaign ? 'Launching...' : 'Launch Campaign'}
                    </Button>
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div>
            <Label className="block text-sm font-medium mb-2 text-white">My Ads</Label>
            {loading ? (
              <p className="text-center text-white/60 text-sm py-4">Loading...</p>
            ) : ads.length === 0 ? (
              <p className="text-center text-white/60 text-sm py-4">You haven't created any ads yet</p>
            ) : (
              <div className="grid gap-2">
                {ads.map((ad) => {
                  const hasCampaign = ad.total_budget != null;
                  const isExpanded = expandedMyAdId === ad.id;
                  const spentSoFar = computeSpentSoFar(ad);
                  const progress = computeDeliveryProgress(ad);
                  return (
                  <Card key={ad.id} className="bg-black border-pink-500/20">
                    <CardContent className="pt-3 pb-3">
                      <div
                        className={`flex gap-3 ${hasCampaign ? 'cursor-pointer' : ''}`}
                        onClick={() => hasCampaign && setExpandedMyAdId(isExpanded ? null : ad.id)}
                      >
                        {ad.media_type === 'video' && ad.video_url ? (
                          <div className="w-12 h-12 shrink-0 bg-neutral-900 rounded flex items-center justify-center">
                            <Video className="w-5 h-5 text-white/60" />
                          </div>
                        ) : (
                          <img
                            loading="lazy" decoding="async"
                            src={getDetailImageUrl(ad.image_url)}
                            alt={ad.name}
                            className="w-12 h-12 shrink-0 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-white truncate">{ad.name}</h4>
                            <span
                              className={`flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${
                                ad.is_active ? 'bg-green-500/15 text-green-400' : 'bg-orange-500/15 text-orange-400'
                              }`}
                              title={ad.is_active ? 'Live' : 'Pending review'}
                            >
                              {ad.is_active ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            </span>
                            {hasCampaign && (
                              isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-white/40 ml-auto shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-white/40 ml-auto shrink-0" />
                            )}
                          </div>
                          {hasCampaign && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-white/60">
                              <span>💰 ${spentSoFar.toFixed(2)} of ${(ad.total_budget || 0).toFixed(2)}</span>
                              <span>👁 {formatImpressions(ad.impressions || 0)}</span>
                              <span>🖱 {formatImpressions(ad.clicks || 0)}</span>
                            </div>
                          )}
                          <div className="flex gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
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

                      {hasCampaign && isExpanded && (
                        <div className="mt-3 pt-3 border-t border-pink-500/10 space-y-2">
                          <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                            <div className="h-full bg-pink-500 rounded-full transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-white/80">
                            <div>
                              <p className="text-white/40">Spent so far</p>
                              <p className="text-white font-medium">${spentSoFar.toFixed(2)} <span className="text-white/40 font-normal">/ ${(ad.total_budget || 0).toFixed(2)}</span></p>
                            </div>
                            <div>
                              <p className="text-white/40">Views (impressions)</p>
                              <p className="text-white font-medium">{formatImpressions(ad.impressions || 0)}</p>
                            </div>
                            <div>
                              <p className="text-white/40">Clicks</p>
                              <p className="text-white font-medium">{formatImpressions(ad.clicks || 0)}</p>
                            </div>
                            <div>
                              <p className="text-white/40">CTR</p>
                              <p className="text-white font-medium">{ad.impressions ? (((ad.clicks || 0) / ad.impressions) * 100).toFixed(1) : '0.0'}%</p>
                            </div>
                          </div>
                          <p className="text-[11px] text-white/40">
                            {progress >= 1
                              ? 'This campaign has delivered its full budget of impressions.'
                              : `${Math.round(progress * 100)}% delivered so far (${formatImpressions(ad.impressions || 0)} of ~${formatImpressions(ad.estimated_impressions_max || 0)} estimated). Duration is a target, not a cutoff - it keeps running until it delivers.`}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
        )}
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
