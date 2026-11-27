import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Heart, MapPin, User, Trash2, X, Settings, Save, Pencil, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import ImageViewer from './ImageViewer';
import { useBackClose } from '@/utils/backStack';
import { ProfileDetailsPanel } from './profile-card/ProfileDetailsPanel';
import { ProfileSection } from './profile-card/ProfileSection';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { getCountriesList } from '@/constants/locationData';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import CachedImage from '@/components/common/CachedImage';
import { calculateProfileCompletion } from '@/utils/profileCompletion';
import { parseFavorites } from '@/constants/favorites';
import { withThumbnailPaths } from '@/utils/photoThumbnails';
import { calculateAge } from '@/utils/dateUtils';
import { formatHeightLabel } from '@/utils/profileFormat';

// Lazy, not a static import: PhotoCropModal needs its own isolated build
// chunk (see vite.config.ts) to avoid a circular-chunk crash.
const PhotoCropModal = React.lazy(() => import('@/components/profile/PhotoCropModal'));


// Admin-only numbers for one member (admin_user_activity).
interface AccountActivity {
  signed_up: string | null;
  last_active: string | null;
  last_sign_in?: string | null;
  logins: number;
  times_active?: number | null;
  photo_count?: number | null;
  profile_completion?: number | null;
  likes_received?: number | null;
  passes_received?: number | null;
  likes_given?: number | null;
  matches?: number | null;
  boost_until?: string | null;
  devices?: string[] | null;
}

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const formatAgo = (value?: string | null) => {
  if (!value) return '';
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 5) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
};

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: (wasEdited?: boolean) => void;
  userId: string;
  isAdmin?: boolean;
}

const UserProfileModal = ({ isOpen, onClose, userId, isAdmin = false }: UserProfileModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  // Android back closes the dialog (Radix already handles Escape on the web).
  useBackClose(isOpen, () => onClose(), { escape: false });
  const [profile, setProfile] = useState<any>(null);
  const [wasEdited, setWasEdited] = useState(false);
  const [userImages, setUserImages] = useState<string[]>([]);
  const [deletingImageIndex, setDeletingImageIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [croppingImageUrl, setCroppingImageUrl] = useState<string | null>(null);
  const [activity, setActivity] = useState<AccountActivity | null>(null);
  
  // Admin editing state
  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
  const [editedGender, setEditedGender] = useState('');
  const [editedPreference, setEditedPreference] = useState('');
  const [editedCountry, setEditedCountry] = useState('');
  const [editedCity, setEditedCity] = useState('');
  const [editedMinAge, setEditedMinAge] = useState('');
  const [editedMaxAge, setEditedMaxAge] = useState('');
  const [editedMaxDistance, setEditedMaxDistance] = useState('');
  const [editedRelationshipIntent, setEditedRelationshipIntent] = useState('');
  const [editedUnlockedCountries, setEditedUnlockedCountries] = useState<string[]>([]);
  const [editedDateOfBirth, setEditedDateOfBirth] = useState('');
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Delete image from DB and storage
  const handleDeleteImage = async (imageUrl: string, index: number) => {
    if (!userId || !imageUrl) return;
    setDeletingImageIndex(index);
    try {
      // Delete from DB
      const { error: dbError } = await supabase
        .from('user_images')
        .delete()
        .eq('user_id', userId)
        .eq('image_url', imageUrl);
      if (dbError) throw dbError;

      // Delete from storage. Files are stored as `<userId>/<file>`, so taking just
      // the last URL segment (as this used to) drops the userId prefix and silently
      // fails to match the real object path, leaking the file in storage forever.
      // Mirror the path resolution used in profile/ImageManagement.tsx.
      const urlParts = imageUrl.split('/');
      const bucketIndex = urlParts.findIndex(part => part === 'user-photos');
      if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
        const filePath = urlParts.slice(bucketIndex + 1).join('/');
        const { error: storageError } = await supabase.storage
          .from('user-photos')
          .remove(withThumbnailPaths([filePath]));
        if (storageError) throw storageError;
      }

      // Refresh images
      fetchUserImages();
    } catch (error) {
      console.error('Error deleting image:', error);
    } finally {
      setDeletingImageIndex(null);
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserProfile();
      fetchUserImages();
    }
  }, [isOpen, userId]);

  useEffect(() => {
    if (!isOpen || !userId || !isAdmin) return;
    let cancelled = false;
    setActivity(null);
    supabase.rpc('admin_user_activity' as never, { p_user_id: userId } as never).then(({ data, error }) => {
      if (cancelled || error || !data) return;
      setActivity(data as unknown as AccountActivity);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, userId, isAdmin]);

  // Reset editing state when profile changes
  useEffect(() => {
    if (profile) {
      setEditedGender(profile.gender || '');
      setEditedPreference(profile.preference || '');
      setEditedCountry(profile.country || '');
      setEditedCity(profile.city || '');
      setEditedMinAge(profile.min_age?.toString() || '18');
      setEditedMaxAge(profile.max_age?.toString() || '99');
      setEditedMaxDistance(profile.max_distance?.toString() || '250');
      setEditedRelationshipIntent(profile.relationship_intent || '');
      setEditedUnlockedCountries(profile.unlocked_countries || []);
      setEditedDateOfBirth(profile.date_of_birth || '');
    }
  }, [profile]);

  const fetchUserProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Profile fetch error:', error);
        throw error;
      }
      
      setProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserImages = async () => {
    if (!userId) return;
    
    try {
      const { data: images, error } = await supabase
        .from('user_images')
        .select('image_url, is_approved')
        .eq('user_id', userId)
        .eq('is_approved', true)
        .order('image_order', { ascending: true });

      if (error) {
        if (!error.message.includes('does not exist') && !error.message.includes('relation')) {
          console.error('Error fetching user images:', error);
        }
        return;
      }
      
      setUserImages(images?.map(img => img.image_url) || []);
    } catch (error) {
      console.error('Error fetching user images:', error);
    }
  };

  const handleSavePreferences = async () => {
    if (!userId) return;
    setSavingPreferences(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          gender: editedGender || null,
          preference: editedPreference || null,
          country: editedCountry || null,
          city: editedCity || null,
          min_age: parseInt(editedMinAge) || 18,
          max_age: parseInt(editedMaxAge) || 99,
          max_distance: parseInt(editedMaxDistance) || 250,
          relationship_intent: editedRelationshipIntent || null,
          unlocked_countries: editedUnlockedCountries,
          date_of_birth: editedDateOfBirth || null,
        })
        .eq('id', userId);

      if (error) throw error;

      // Update local profile state
      setProfile((prev: any) => ({
        ...prev,
        gender: editedGender,
        preference: editedPreference,
        country: editedCountry,
        city: editedCity,
        min_age: parseInt(editedMinAge) || 18,
        max_age: parseInt(editedMaxAge) || 99,
        max_distance: parseInt(editedMaxDistance) || 250,
        relationship_intent: editedRelationshipIntent,
        unlocked_countries: editedUnlockedCountries,
        date_of_birth: editedDateOfBirth,
      }));

      setIsEditingPreferences(false);
      setWasEdited(true);
      toast({
        title: 'Success',
        description: 'User preferences updated successfully',
      });
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast({
        title: 'Error',
        description: 'Failed to update preferences',
        variant: 'destructive',
      });
    } finally {
      setSavingPreferences(false);
    }
  };

  // Same "earned" verified badge shown everywhere else (>=85% profile
  // completion) - not a face-verification flag.
  const showVerifiedBadge = profile ? calculateProfileCompletion(profile, userImages).showVerifiedBadge : false;

  const favorites = parseFavorites(profile?.favorites);

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
    setIsImageViewerOpen(true);
  };

  const handleClose = () => {
    setIsEditingPreferences(false);
    onClose(wasEdited);
    setWasEdited(false);
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-black border-pink-500/30 text-white outline-none focus:outline-none focus-visible:outline-none">
          <DialogHeader>
            <DialogTitle className="text-white">{t('userProfileModal.loading')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
            <span className="ml-3 text-gray-300">{t('userProfileModal.loading')}</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!profile && !loading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-black border-pink-500/30 text-white outline-none focus:outline-none focus-visible:outline-none">
          <DialogHeader>
            <DialogTitle className="text-white">{t('userProfileModal.unavailable')}</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-300 mb-2">{t('userProfileModal.notFound')}</p>
            <p className="text-sm text-gray-400">{t('userProfileModal.unavailable')}</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-black border-pink-500/30 text-white outline-none focus:outline-none focus-visible:outline-none">
          {/* Absolutely positioned (not a normal grid row) so the close button
              doesn't reserve its own gap-4 row above the avatar - it just
              floats in the corner instead of pushing everything else down. */}
          <DialogHeader className="absolute top-3 right-3 z-20 space-y-0">
            {/* Visually hidden, not removed - Radix requires a DialogTitle for
                accessibility (it's what aria-labelledby points at), but showing
                it here duplicated the name that's already the hero heading
                right below the avatar just beneath it. */}
            <DialogTitle className="sr-only">
              {profile?.first_name} {profile?.last_name}
            </DialogTitle>
            <Button variant="line" size="iconSm" className="text-white"
              onClick={handleClose}
              aria-label={t('common.close')}
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>
          
          <div className="space-y-6">
              {/* Header with main image and basic info */}
              <div className="text-center">
              {userImages.length > 0 ? (
                <div className="relative w-24 h-24 mx-auto mb-4">
                  <CachedImage loading="lazy" decoding="async"
                    src={getDetailImageUrl(userImages[0])}
                    alt={`${profile?.first_name} ${profile?.last_name}`}
                    className="w-24 h-24 rounded-full object-cover cursor-pointer hover:opacity-90 transition-opacity border-4 border-pink-500/40"
                    onClick={() => handleImageClick(0)}
                  />
                  {isAdmin && (
                    <>
                      <button
                        className="absolute top-1 left-1 bg-pink-600 text-white rounded-full p-1 shadow hover:bg-pink-700 focus:outline-none flex items-center justify-center"
                        title="Crop photo"
                        onClick={() => setCroppingImageUrl(userImages[0])}
                        disabled={deletingImageIndex === 0}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 shadow hover:bg-red-700 focus:outline-none flex items-center justify-center"
                        title="Delete image"
                        onClick={() => handleDeleteImage(userImages[0], 0)}
                        disabled={deletingImageIndex === 0}
                      >
                        {deletingImageIndex === 0 ? (
                          <span className="w-4 h-4">...</span>
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <Avatar className="w-24 h-24 mx-auto mb-4 border-4 border-pink-500/40">
                  <AvatarFallback className="bg-pink-950 text-pink-300 text-2xl">
                    {profile?.first_name?.charAt(0)}{profile?.last_name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              )}

                <div className="flex items-center justify-center gap-2">
                  <h2 className="text-2xl font-bold text-white">
                    {profile?.first_name} {profile?.last_name}
                  </h2>
                  {showVerifiedBadge && (
                    <img
                      loading="lazy"
                      decoding="async"
                      src="/images/verified.svg"
                      alt="Verified profile"
                      title="Verified profile"
                      className="w-6 h-6"
                    />
                  )}
                </div>

                {(isEditingPreferences ? editedDateOfBirth : profile?.date_of_birth) && (
                  <p className="text-gray-300 mb-2">
                    {t('userProfileModal.yearsOld', { age: calculateAge(isEditingPreferences ? editedDateOfBirth : profile.date_of_birth) })}
                  </p>
                )}

                {(profile?.city || profile?.country) && (
                  <div className="flex items-center justify-center text-gray-300 mb-4">
                    <MapPin className="w-4 h-4 mr-1" />
                    <span>
                      {profile?.city}{profile?.city && profile?.country && ', '}{profile?.country}
                      {typeof profile?.height_cm === 'number' && profile.height_cm > 0 && (
                        <span className="ml-2">• {formatHeightLabel(profile.height_cm)}</span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Admin: account activity */}
              {isAdmin && (() => {
                // Falls back to the profile row until admin_user_activity is available.
                const a: AccountActivity = activity ?? {
                  signed_up: profile.created_at ?? null,
                  last_active: profile.last_login_at ?? null,
                  logins: profile.login_count ?? 0,
                  times_active: profile.active_session_count ?? null,
                };
                const seen = a.likes_received != null || a.passes_received != null
                  ? (a.likes_received ?? 0) + (a.passes_received ?? 0)
                  : null;
                const rows: Array<[string, string]> = [
                  ['Signed up', formatDateTime(a.signed_up)],
                  ['Last active', a.last_active ? `${formatDateTime(a.last_active)} (${formatAgo(a.last_active)})` : 'Never'],
                  ...(a.last_sign_in ? [['Last sign-in', formatDateTime(a.last_sign_in)] as [string, string]] : []),
                  ['Logins', String(a.logins ?? 0)],
                  ...(a.times_active != null ? [['Times active', String(a.times_active)] as [string, string]] : []),
                  ...(a.profile_completion != null ? [['Profile complete', `${a.profile_completion}%`] as [string, string]] : []),
                  ...(a.photo_count != null ? [['Photos', String(a.photo_count)] as [string, string]] : []),
                  ...(seen != null ? [['Seen by', `${seen} (${a.likes_received ?? 0} likes, ${a.passes_received ?? 0} passes)`] as [string, string]] : []),
                  ...(a.likes_given != null ? [['Likes given', String(a.likes_given)] as [string, string]] : []),
                  ...(a.matches != null ? [['Matches', String(a.matches)] as [string, string]] : []),
                  ...(a.devices ? [['Devices', a.devices.length ? a.devices.join(', ') : 'None (no push)'] as [string, string]] : []),
                  ...(a.boost_until ? [['Feed boost', `Until ${formatDateTime(a.boost_until)}`] as [string, string]] : []),
                ];
                return (
                  <Card className="border-2 border-emerald-700/40 bg-emerald-950/30">
                    <CardContent className="pt-6">
                      <h3 className="font-semibold flex items-center text-emerald-300 mb-3">
                        <Activity className="w-4 h-4 mr-2" />
                        Account activity
                      </h3>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {rows.map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <div className="text-xs text-gray-400">{label}</div>
                            <div className="text-white break-words">{value}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-3">
                        Logins count each sign-in (including signing in again after logging out). Times active counts each return to the app after 30+ minutes away.
                      </p>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Admin Preferences Section */}
              {isAdmin && (
                <Card className="border-2 border-blue-700/40 bg-blue-950/30">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold flex items-center text-blue-300">
                        <Settings className="w-4 h-4 mr-2" />
                        User Preferences (Admin Edit)
                      </h3>
                      {!isEditingPreferences ? (
                        <Button variant="line" size="sm" className="text-white"
                          onClick={() => setIsEditingPreferences(true)}
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button variant="line" size="sm" className="text-white"
                            onClick={() => {
                              setIsEditingPreferences(false);
                              // Reset to original values
                              setEditedGender(profile?.gender || '');
                              setEditedPreference(profile?.preference || '');
                              setEditedCountry(profile?.country || '');
                              setEditedCity(profile?.city || '');
                              setEditedMinAge(profile?.min_age?.toString() || '18');
                              setEditedMaxAge(profile?.max_age?.toString() || '99');
                              setEditedMaxDistance(profile?.max_distance?.toString() || '250');
                              setEditedRelationshipIntent(profile?.relationship_intent || '');
                              setEditedUnlockedCountries(profile?.unlocked_countries || []);
                              setEditedDateOfBirth(profile?.date_of_birth || '');
                            }}
                          >
                            Cancel
                          </Button>
                          <Button variant="primary" size="sm"
                            onClick={handleSavePreferences}
                            disabled={savingPreferences}
                          >
                            <Save className="w-3 h-3 mr-1" />
                            {savingPreferences ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {isEditingPreferences ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-gray-400 mb-1 block">Gender</label>
                            <Select value={editedGender} onValueChange={setEditedGender}>
                              <SelectTrigger tone="dark">
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                              <SelectContent className="bg-black border-pink-500/30 text-white">
                                <SelectItem value="male" className="text-xs">Male</SelectItem>
                                <SelectItem value="female" className="text-xs">Female</SelectItem>
                                <SelectItem value="other" className="text-xs">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-400 mb-1 block">Looking For</label>
                            <Select value={editedPreference} onValueChange={setEditedPreference}>
                              <SelectTrigger tone="dark">
                                <SelectValue placeholder="Select preference" />
                              </SelectTrigger>
                              <SelectContent className="bg-black border-pink-500/30 text-white">
                                <SelectItem value="male" className="text-xs">Male</SelectItem>
                                <SelectItem value="female" className="text-xs">Female</SelectItem>
                                <SelectItem value="everyone" className="text-xs">Everyone</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-gray-400 mb-1 block">Relationship Intent</label>
                          <Select value={editedRelationshipIntent} onValueChange={setEditedRelationshipIntent}>
                            <SelectTrigger tone="dark">
                              <SelectValue placeholder="Select intent" />
                            </SelectTrigger>
                            <SelectContent className="bg-black border-pink-500/30 text-white">
                              <SelectItem value="serious" className="text-xs">Serious</SelectItem>
                              <SelectItem value="long-term" className="text-xs">Long-term</SelectItem>
                              <SelectItem value="casual" className="text-xs">Casual</SelectItem>
                              <SelectItem value="open_to_anything" className="text-xs">Open to Anything</SelectItem>
                              <SelectItem value="not-sure" className="text-xs">Not Sure</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Date of Birth */}
                        <div>
                          <label className="text-xs font-medium text-gray-400 mb-1 block">Date of Birth</label>
                          <Input tone="dark"
                            type="date"
                            value={editedDateOfBirth}
                            onChange={(e) => setEditedDateOfBirth(e.target.value)}
                           
                          />
                          {editedDateOfBirth && (
                            <p className="text-[10px] text-gray-400 mt-1">
                              Age: {calculateAge(editedDateOfBirth)} years old
                            </p>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-gray-400 mb-1 block">Country</label>
                            <Select value={editedCountry} onValueChange={setEditedCountry}>
                              <SelectTrigger tone="dark">
                                <SelectValue placeholder="Select country" />
                              </SelectTrigger>
                              <SelectContent className="max-h-60 bg-black border-pink-500/30 text-white">
                                {getCountriesList().map(country => (
                                  <SelectItem key={country.code} value={country.name} className="text-xs">
                                    {country.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-400 mb-1 block">City</label>
                            <Input tone="dark"
                              type="text"
                              value={editedCity}
                              onChange={(e) => setEditedCity(e.target.value)}
                              placeholder="Enter city"
                             
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-medium text-gray-400 mb-1 block">Min Age</label>
                            <Input tone="dark"
                              type="number"
                              value={editedMinAge}
                              onChange={(e) => setEditedMinAge(e.target.value)}
                              min="18"
                              max="99"
                             
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-400 mb-1 block">Max Age</label>
                            <Input tone="dark"
                              type="number"
                              value={editedMaxAge}
                              onChange={(e) => setEditedMaxAge(e.target.value)}
                              min="18"
                              max="99"
                             
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-400 mb-1 block">Max Distance (km)</label>
                            <Input tone="dark"
                              type="number"
                              value={editedMaxDistance}
                              onChange={(e) => setEditedMaxDistance(e.target.value)}
                              min="1"
                              max="500"
                             
                            />
                          </div>
                        </div>

                        {/* Unlocked Countries */}
                        <div>
                          <label className="text-xs font-medium text-gray-400 mb-1 block">Unlocked Countries (Premium)</label>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {editedUnlockedCountries.map((code: string) => {
                              const country = getCountriesList().find(c => c.code === code);
                              return (
                                <Badge key={code} variant="secondary" className="text-xs flex items-center gap-1">
                                  {country?.name || code}
                                  <button
                                    onClick={() => setEditedUnlockedCountries(prev => prev.filter(c => c !== code))}
                                    className="ml-1 hover:text-red-500"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </Badge>
                              );
                            })}
                            {editedUnlockedCountries.length === 0 && (
                              <span className="text-xs text-gray-400">No countries unlocked</span>
                            )}
                          </div>
                          {editedUnlockedCountries.length < 3 && (
                            <Select 
                              value="" 
                              onValueChange={(code) => {
                                if (code && !editedUnlockedCountries.includes(code)) {
                                  setEditedUnlockedCountries(prev => [...prev, code]);
                                }
                              }}
                            >
                              <SelectTrigger tone="dark">
                                <SelectValue placeholder="Add country..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-60 bg-black border-pink-500/30 text-white">
                                {getCountriesList()
                                  .filter(c => !editedUnlockedCountries.includes(c.code))
                                  .map(country => (
                                    <SelectItem key={country.code} value={country.code} className="text-xs">
                                      {country.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-400 text-xs">Gender:</span>
                            <p className="font-medium capitalize text-white">{profile?.gender || 'Not set'}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-xs">Looking For:</span>
                            <p className="font-medium capitalize text-white">{profile?.preference || 'Not set'}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-xs">Relationship Intent:</span>
                            <p className="font-medium capitalize text-white">{profile?.relationship_intent?.replace(/_/g, ' ') || 'Not set'}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-xs">Age Range:</span>
                            <p className="font-medium text-white">{profile?.min_age || 18} - {profile?.max_age || 99}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-xs">Country:</span>
                            <p className="font-medium text-white">{profile?.country || 'Not set'}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-xs">City:</span>
                            <p className="font-medium text-white">{profile?.city || 'Not set'}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-xs">Max Distance:</span>
                            <p className="font-medium text-white">{profile?.max_distance || 250} km</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-xs">Unlocked Countries:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {profile?.unlocked_countries?.length > 0 ? (
                                profile.unlocked_countries.map((code: string) => {
                                  const country = getCountriesList().find(c => c.code === code);
                                  return (
                                    <Badge key={code} variant="outline" className="text-[10px] px-1.5 py-0">
                                      {country?.name || code}
                                    </Badge>
                                  );
                                })
                              ) : (
                                <span className="text-xs text-gray-400">None</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Photo Gallery */}
              {userImages.length > 1 && (
                <ProfileSection
                  title={t('userProfileModal.photos', { count: userImages.length })}
                  icon={<User />}
                >
                    <div className="grid grid-cols-3 gap-2">
                      {userImages.slice(0, 6).map((image, index) => (
                        <div key={index} className="relative group">
                          <CachedImage
                            loading="lazy"
                            decoding="async"
                            src={getDetailImageUrl(image)}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => handleImageClick(index)}
                          />
                          {isAdmin && (
                            <div className="absolute top-1 right-1 flex gap-1 opacity-80 group-hover:opacity-100">
                              <button
                                className="bg-pink-600 text-white rounded-full p-1 shadow hover:bg-pink-700 focus:outline-none flex items-center justify-center"
                                title="Crop photo"
                                onClick={() => setCroppingImageUrl(image)}
                                disabled={deletingImageIndex === index}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                className="bg-red-600 text-white rounded-full p-1 shadow hover:bg-red-700 focus:outline-none flex items-center justify-center"
                                title="Delete image"
                                onClick={() => handleDeleteImage(image, index)}
                                disabled={deletingImageIndex === index}
                              >
                                {deletingImageIndex === index ? (
                                  <span className="w-4 h-4">...</span>
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                </ProfileSection>
              )}

              {/* Interested in - the one "looking for" fact the shared panel doesn't carry */}
              {profile?.preference && (
                <ProfileSection title={t('userProfileModal.lookingFor.interestedIn').replace(/\s*[:：]\s*$/, '')} icon={<Heart />}>
                  <Badge variant="brand" className="px-3 py-1 text-sm capitalize">{profile.preference}</Badge>
                </ProfileSection>
              )}

              {/* Details - the same panel Discover, Liked Me and the preview use */}
              <ProfileDetailsPanel
                profile={{ ...profile, favorites: parseFavorites(profile?.favorites) }}
                showFunQuestions
                className="px-0 pb-0 pt-0"
              />
            </div>
        </DialogContent>
      </Dialog>

      {/* Image Viewer */}
      <ImageViewer
        isOpen={isImageViewerOpen}
        onClose={() => setIsImageViewerOpen(false)}
        images={userImages}
        initialIndex={selectedImageIndex}
      />

      {croppingImageUrl && (
        <React.Suspense fallback={null}>
          <PhotoCropModal
            imageUrl={croppingImageUrl}
            userId={userId}
            onClose={() => setCroppingImageUrl(null)}
            onSaved={() => {
              setCroppingImageUrl(null);
              fetchUserImages();
            }}
          />
        </React.Suspense>
      )}
    </>
  );
};

export default UserProfileModal;
