import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Heart, Briefcase, GraduationCap, User, Trash2, X, Settings, Save, Pencil, Ruler, Baby, MessageCircle, Gift, PawPrint, Share2, Languages } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import ImageViewer from './ImageViewer';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { getCountriesList } from '@/constants/locationData';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import CachedImage from '@/components/common/CachedImage';
import { calculateProfileCompletion } from '@/utils/profileCompletion';
import {
  FAMILY_PLANS_OPTIONS,
  COMMUNICATION_STYLE_OPTIONS,
  LOVE_STYLE_OPTIONS,
  PETS_OPTIONS,
  SOCIAL_MEDIA_OPTIONS,
  traitLabel,
} from '@/constants/profileTraits';
import { favoriteEmoji, formatFavoriteLabel, parseFavorites } from '@/constants/favorites';

const formatHeightLabel = (cm: number) => {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}" (${cm} cm)`;
};
// Lazy, not a static import: PhotoCropModal needs its own isolated build
// chunk (see vite.config.ts) to avoid a circular-chunk crash.
const PhotoCropModal = React.lazy(() => import('@/components/profile/PhotoCropModal'));


interface UserProfileModalProps {
  isOpen: boolean;
  onClose: (wasEdited?: boolean) => void;
  userId: string;
  isAdmin?: boolean;
}

const UserProfileModal = ({ isOpen, onClose, userId, isAdmin = false }: UserProfileModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [wasEdited, setWasEdited] = useState(false);
  const [userImages, setUserImages] = useState<string[]>([]);
  const [deletingImageIndex, setDeletingImageIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [croppingImageUrl, setCroppingImageUrl] = useState<string | null>(null);
  
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
          .remove([filePath]);
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

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-black border-pink-500/30 text-white">
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-black border-pink-500/30 text-white">
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-black border-pink-500/30 text-white">
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
            <Button
              variant="outline"
              size="icon"
              onClick={handleClose}
              aria-label={t('common.close')}
              className="h-8 w-8 bg-black border-pink-500/40 text-white hover:bg-pink-900/30"
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsEditingPreferences(true)}
                          className="h-7 text-xs bg-black border-pink-500/40 text-white hover:bg-pink-900/30"
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
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
                            className="h-7 text-xs bg-black border-pink-500/40 text-white hover:bg-pink-900/30"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSavePreferences}
                            disabled={savingPreferences}
                            className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
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
                              <SelectTrigger className="h-8 text-xs bg-black/40 border-pink-500/30 text-white">
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
                              <SelectTrigger className="h-8 text-xs bg-black/40 border-pink-500/30 text-white">
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
                            <SelectTrigger className="h-8 text-xs bg-black/40 border-pink-500/30 text-white">
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
                          <Input
                            type="date"
                            value={editedDateOfBirth}
                            onChange={(e) => setEditedDateOfBirth(e.target.value)}
                            className="h-8 text-xs bg-black/40 border-pink-500/30 text-white"
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
                              <SelectTrigger className="h-8 text-xs bg-black/40 border-pink-500/30 text-white">
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
                            <Input
                              type="text"
                              value={editedCity}
                              onChange={(e) => setEditedCity(e.target.value)}
                              placeholder="Enter city"
                              className="h-8 text-xs bg-black/40 border-pink-500/30 text-white"
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-medium text-gray-400 mb-1 block">Min Age</label>
                            <Input
                              type="number"
                              value={editedMinAge}
                              onChange={(e) => setEditedMinAge(e.target.value)}
                              min="18"
                              max="99"
                              className="h-8 text-xs bg-black/40 border-pink-500/30 text-white"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-400 mb-1 block">Max Age</label>
                            <Input
                              type="number"
                              value={editedMaxAge}
                              onChange={(e) => setEditedMaxAge(e.target.value)}
                              min="18"
                              max="99"
                              className="h-8 text-xs bg-black/40 border-pink-500/30 text-white"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-400 mb-1 block">Max Distance (km)</label>
                            <Input
                              type="number"
                              value={editedMaxDistance}
                              onChange={(e) => setEditedMaxDistance(e.target.value)}
                              min="1"
                              max="500"
                              className="h-8 text-xs bg-black/40 border-pink-500/30 text-white"
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
                              <SelectTrigger className="h-8 text-xs bg-black/40 border-pink-500/30 text-white">
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
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold text-white mb-4 flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      {t('userProfileModal.photos', { count: userImages.length })}
                    </h3>
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
                  </CardContent>
                </Card>
              )}

              {/* Bio */}
              {profile?.bio && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <p className="text-gray-200 text-center italic">"{profile.bio}"</p>
                  </CardContent>
                </Card>
              )}
              
              {/* Basic Info */}
              <Card className="bg-black border-pink-500/20">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-3 flex items-center text-white">
                    <Heart className="w-4 h-4 mr-2 text-blue-400" />
                    {t('userProfileModal.sections.lookingFor')}
                  </h3>
                  <div className="space-y-2">
                    {profile?.preference && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">{t('userProfileModal.lookingFor.interestedIn')}</span>
                        <Badge variant="secondary" className="capitalize bg-blue-950/40 text-blue-300 border-blue-700/40">{profile.preference}</Badge>
                      </div>
                    )}
                    {profile?.relationship_intent && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">{t('userProfileModal.lookingFor.lookingFor')}</span>
                        <Badge variant="secondary" className="capitalize bg-blue-950/40 text-blue-300 border-blue-700/40">{profile.relationship_intent}</Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Lifestyle */}
              {(profile?.smoking || profile?.drinking || profile?.exercise_level || profile?.sleeping_schedule) && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 text-white">{t('userProfileModal.sections.lifestyle')}</h3>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                      {profile?.smoking && (
                        <div>
                          <span className="text-gray-400">{t('userProfileModal.lifestyle.smoking')}</span>
                          <span className="block font-medium text-white">{profile.smoking}</span>
                        </div>
                      )}
                      {profile?.drinking && (
                        <div>
                          <span className="text-gray-400">{t('userProfileModal.lifestyle.drinking')}</span>
                          <span className="block font-medium text-white">{profile.drinking}</span>
                        </div>
                      )}
                      {profile?.exercise_level && (
                        <div>
                          <span className="text-gray-400">{t('userProfileModal.lifestyle.exercise')}</span>
                          <span className="block font-medium text-white">{profile.exercise_level}</span>
                        </div>
                      )}
                      {profile?.sleeping_schedule && (
                        <div>
                          <span className="text-gray-400">{t('userProfileModal.lifestyle.sleep')}</span>
                          <span className="block font-medium text-white">{profile.sleeping_schedule}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Family Plans */}
              {profile?.family_plans && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center text-white">
                      <Baby className="w-4 h-4 mr-2 text-blue-400" />
                      Family Plans
                    </h3>
                    <p className="text-gray-200">{traitLabel(FAMILY_PLANS_OPTIONS, profile.family_plans)}</p>
                  </CardContent>
                </Card>
              )}

              {/* Work & Education */}
              {(profile?.occupation || profile?.industry || profile?.education_level) && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center text-white">
                      <Briefcase className="w-4 h-4 mr-2 text-blue-400" />
                      {t('userProfileModal.sections.workEducation')}
                    </h3>
                    <div className="space-y-3">
                      {profile?.occupation && (
                        <div>
                          <span className="text-gray-400">{t('userProfileModal.workEducation.occupation')}</span>
                          <span className="block font-medium text-white">{profile.occupation}</span>
                        </div>
                      )}
                      {profile?.industry && (
                        <div>
                          <span className="text-gray-400">{t('userProfileModal.workEducation.industry')}</span>
                          <span className="block font-medium text-white">{profile.industry}</span>
                        </div>
                      )}
                      {profile?.education_level && (
                        <div>
                          <span className="text-gray-400 flex items-center">
                            <GraduationCap className="w-4 h-4 mr-1" /> {t('userProfileModal.workEducation.education')}
                          </span>
                          <span className="block font-medium text-white">{profile.education_level}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Personality Traits */}
              {(typeof profile?.introvert_extrovert === 'number' || typeof profile?.spontaneous_planner === 'number' || typeof profile?.messy_organized === 'number') && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 text-white">{t('userProfileModal.sections.personality')}</h3>
                    <div className="space-y-3">
                      {typeof profile?.introvert_extrovert === 'number' && (
                        <div>
                          <div className="flex justify-between text-sm mb-1 text-gray-300">
                            <span>{t('userProfileModal.personality.introvert')}</span>
                            <span>{t('userProfileModal.personality.extrovert')}</span>
                          </div>
                          <div className="w-full bg-neutral-800 rounded-full h-2">
                            <div 
                              className="bg-blue-400 h-2 rounded-full" 
                              style={{ width: `${profile.introvert_extrovert}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                      {typeof profile?.spontaneous_planner === 'number' && (
                        <div>
                          <div className="flex justify-between text-sm mb-1 text-gray-300">
                            <span>{t('userProfileModal.personality.planner')}</span>
                            <span>{t('userProfileModal.personality.spontaneous')}</span>
                          </div>
                          <div className="w-full bg-neutral-800 rounded-full h-2">
                            <div 
                              className="bg-blue-400 h-2 rounded-full" 
                              style={{ width: `${profile.spontaneous_planner}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                      {typeof profile?.messy_organized === 'number' && (
                        <div>
                          <div className="flex justify-between text-sm mb-1 text-gray-300">
                            <span>{t('userProfileModal.personality.organized')}</span>
                            <span>{t('userProfileModal.personality.messy')}</span>
                          </div>
                          <div className="w-full bg-neutral-800 rounded-full h-2">
                            <div 
                              className="bg-blue-400 h-2 rounded-full" 
                              style={{ width: `${profile.messy_organized}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Communication Style */}
              {profile?.communication_style && profile.communication_style.length > 0 && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center text-white">
                      <MessageCircle className="w-4 h-4 mr-2 text-blue-400" />
                      Communication Style
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.communication_style.map((value: string) => (
                        <Badge key={value} variant="outline" className="bg-blue-950/40 text-blue-300 border-blue-700/40">
                          {traitLabel(COMMUNICATION_STYLE_OPTIONS, value)}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Love Style */}
              {profile?.love_style && profile.love_style.length > 0 && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center text-white">
                      <Gift className="w-4 h-4 mr-2 text-blue-400" />
                      Love Style
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.love_style.map((value: string) => (
                        <Badge key={value} variant="outline" className="bg-blue-950/40 text-blue-300 border-blue-700/40">
                          {traitLabel(LOVE_STYLE_OPTIONS, value)}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Fun Questions */}
              {(profile?.fun_fact || profile?.perfect_first_date || profile?.last_googled) && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 text-white">{t('userProfileModal.sections.funFacts')}</h3>
                    <div className="space-y-4">
                      {profile?.fun_fact && (
                        <div>
                          <span className="text-gray-400 font-medium">{t('userProfileModal.funFacts.funFact')}</span>
                          <p className="text-gray-200">{profile.fun_fact}</p>
                        </div>
                      )}
                      {profile?.perfect_first_date && (
                        <div>
                          <span className="text-gray-400 font-medium">{t('userProfileModal.funFacts.perfectDate')}</span>
                          <p className="text-gray-200">{profile.perfect_first_date}</p>
                        </div>
                      )}
                      {profile?.last_googled && (
                        <div>
                          <span className="text-gray-400 font-medium">{t('userProfileModal.funFacts.lastGoogled')}</span>
                          <p className="text-gray-200">{profile.last_googled}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Interests */}
              {profile?.interests && profile.interests.length > 0 && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 text-white">{t('userProfileModal.sections.interests')}</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.interests.map((interest: string) => (
                        <Badge key={interest} variant="outline" className="bg-blue-950/40 text-blue-300 border-blue-700/40">
                          {interest}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Favorites */}
              {favorites.length > 0 && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 text-white">{t('matches.favorites', 'Favorites')}</h3>
                    <div className="flex flex-wrap gap-2">
                      {favorites.map((favorite, index) => (
                        <Badge key={index} variant="outline" className="bg-blue-950/40 text-blue-300 border-blue-700/40 gap-1">
                          <span>{favoriteEmoji(favorite.category)}</span>
                          <span>{formatFavoriteLabel(favorite)}</span>
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Pets */}
              {profile?.pets && profile.pets.length > 0 && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center text-white">
                      <PawPrint className="w-4 h-4 mr-2 text-blue-400" />
                      Pets
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.pets.map((value: string) => (
                        <Badge key={value} variant="outline" className="bg-blue-950/40 text-blue-300 border-blue-700/40">
                          {traitLabel(PETS_OPTIONS, value)}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Languages spoken */}
              {profile?.languages && profile.languages.length > 0 && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center text-white">
                      <Languages className="w-4 h-4 mr-2 text-blue-400" />
                      Languages
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.languages.map((lang: string) => (
                        <Badge key={lang} variant="outline" className="bg-blue-950/40 text-blue-300 border-blue-700/40">
                          {lang}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Social Media */}
              {profile?.social_media && (
                <Card className="bg-black border-pink-500/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center text-white">
                      <Share2 className="w-4 h-4 mr-2 text-blue-400" />
                      Social Media
                    </h3>
                    <p className="text-gray-200">{traitLabel(SOCIAL_MEDIA_OPTIONS, profile.social_media)}</p>
                  </CardContent>
                </Card>
              )}
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
