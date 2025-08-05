import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Heart, ArrowLeft, Upload, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { initialFormData } from '@/constants/formData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { occupationOptions, industryOptions } from '@/constants/professionOptions';
import LocationInput from '@/components/forms/LocationInput';
import { moderateImage, ModerationResult } from '@/utils/photoModeration';
import { compressImage } from '@/utils/imageCompression';

interface ProfileCompletionFormProps {
  user: any;
  onComplete: () => void;
  onCancel: () => void;
}

interface ImageUpload {
  file: File;
  preview: string;
  moderationResult?: ModerationResult;
  status: 'uploading' | 'moderating' | 'approved' | 'pending' | 'rejected';
}

const ProfileCompletionForm = ({ user, onComplete, onCancel }: ProfileCompletionFormProps) => {
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<ImageUpload[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Restore images from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('profilecompletion_images');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setImages(parsed.map((img: any) => ({
          file: null,
          preview: img.preview,
          moderationResult: img.moderationResult,
          status: img.status
        })));
      } catch {}
    }
  }, []);

  // Save images to sessionStorage whenever they change
  useEffect(() => {
    const serializable = images.map(img => ({
      preview: img.preview,
      moderationResult: img.moderationResult,
      status: img.status
    }));
    sessionStorage.setItem('profilecompletion_images', JSON.stringify(serializable));
  }, [images]);

  useEffect(() => {
    // Pre-fill form with user data from OAuth if available
    if (user) {
      setFormData(prev => ({
        ...prev,
        email: user.email || '',
        firstName: user.user_metadata?.first_name || user.user_metadata?.name?.split(' ')[0] || '',
        lastName: user.user_metadata?.last_name || user.user_metadata?.name?.split(' ').slice(1).join(' ') || '',
      }));
    }
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error when user starts typing
    if (errors[e.target.name]) {
      setErrors(prev => ({ ...prev, [e.target.name]: '' }));
    }
  };

  const handleSelectChange = (field: string, value: string) => {
    setFormData({
      ...formData,
      [field]: value
    });
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleLocationChange = (location: {
    country: string;
    countryCode: string;
    city: string;
    zipCode: string;
    latitude?: number;
    longitude?: number;
    isCustomCity?: boolean;
  }) => {
    setFormData(prev => ({
      ...prev,
      country: location.country,
      countryCode: location.countryCode,
      city: location.city,
      zipCode: location.zipCode,
      latitude: location.latitude,
      longitude: location.longitude,
      isCustomCity: location.isCustomCity || false
    }));

    // Clear location-related errors
    if (errors.country || errors.city || errors.zipCode) {
      setErrors(prev => ({
        ...prev,
        country: '',
        city: '',
        zipCode: ''
      }));
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    if (images.length + files.length > 7) {
      toast({
        title: "Too many images",
        description: "You can upload a maximum of 7 images.",
        variant: "destructive"
      });
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not an image file.`,
          variant: "destructive"
        });
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} is larger than 10MB.`,
          variant: "destructive"
        });
        continue;
      }

      // Compress and convert to WebP before preview and moderation
      const compressedFile = await compressImage(file);
      const preview = URL.createObjectURL(compressedFile);
      const newImage: ImageUpload = { file: compressedFile, preview, status: 'moderating' };

      setImages(prev => [...prev, newImage]);

      // AI Moderation
      try {
        const moderationResult = await moderateImage(compressedFile);
        
        setImages(prev => prev.map(img => 
          img.preview === preview 
            ? { 
                ...img, 
                moderationResult,
                status: !moderationResult.isApproved 
                  ? 'rejected' 
                  : moderationResult.details?.requiresReview 
                    ? 'pending' 
                    : 'approved'
              }
            : img
        ));

        if (!moderationResult.isApproved) {
          toast({
            title: "Image rejected",
            description: moderationResult.message || "This image violates our community guidelines.",
            variant: "destructive"
          });
        } else if (moderationResult.details?.requiresReview) {
          toast({
            title: "Image needs review",
            description: "This image will be reviewed by our team before approval.",
            variant: "default"
          });
        } else {
          toast({
            title: "Image approved",
            description: "Your image looks good and has been approved!",
            variant: "default"
          });
        }
      } catch (error) {
        console.error('Moderation error:', error);
        setImages(prev => prev.map(img => 
          img.preview === preview 
            ? { ...img, status: 'pending', moderationResult: {
                isApproved: true,
                confidence: 0,
                flags: ['MODERATION_FAILED'],
                details: { requiresReview: true },
                message: "Moderation check failed - will be reviewed manually"
              }}
            : img
        ));
      }
    }

    event.target.value = '';
  };

  const removeImage = (preview: string) => {
    setImages(prev => {
      const updated = prev.filter(img => img.preview !== preview);
      URL.revokeObjectURL(preview);
      return updated;
    });
  };

  const renderImageStatus = (image: ImageUpload) => {
    switch (image.status) {
      case 'moderating':
        return (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
            <div className="text-white text-center">
              <Shield className="w-6 h-6 mx-auto mb-1 animate-pulse" />
              <div className="text-xs">Checking...</div>
            </div>
          </div>
        );
      case 'approved':
        return (
          <div className="absolute top-2 left-2 bg-green-500 text-white p-1 rounded-full">
            <CheckCircle className="w-4 h-4" />
          </div>
        );
      case 'pending':
        return (
          <div className="absolute top-2 left-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
            Review
          </div>
        );
      case 'rejected':
        return (
          <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center rounded-lg pointer-events-none">
            <div className="text-white text-center">
              <AlertTriangle className="w-6 h-6 mx-auto mb-1" />
              <div className="text-xs">Rejected</div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmitting) return;
    
    setLoading(true);
    setIsSubmitting(true);

    // Validate required fields (excluding password fields since it's OAuth)
    const validationErrors: Record<string, string> = {};
    
    if (!formData.firstName.trim()) validationErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) validationErrors.lastName = 'Last name is required';
    if (!formData.dateOfBirth) validationErrors.dateOfBirth = 'Date of birth is required';
    if (!formData.country) validationErrors.country = 'Country is required';
    if (!formData.city) validationErrors.city = 'City is required';
    if (!formData.gender) validationErrors.gender = 'Gender is required';
    if (!formData.preference) validationErrors.preference = 'Preference is required';
    if (!formData.relationshipIntent) validationErrors.relationshipIntent = 'Relationship intent is required';
    if (!formData.occupation) validationErrors.occupation = 'Occupation is required';
    if (!formData.industry) validationErrors.industry = 'Industry is required';
    if (!formData.educationLevel) validationErrors.educationLevel = 'Education level is required';

    // Validate images
    const approvedImages = images.filter(img => img.status === 'approved' || img.status === 'pending');
    
    if (approvedImages.length < 2) {
      validationErrors.images = 'You need at least 2 approved photos to complete your profile';
    }

    const rejectedImages = images.filter(img => img.status === 'rejected');
    if (rejectedImages.length > 0) {
      validationErrors.images = 'Please remove rejected images before continuing';
    }

    // Check if we have valid files for approved images
    const imagesWithFiles = approvedImages.filter(img => img.file !== null);
    if (imagesWithFiles.length < 2) {
      validationErrors.images = 'Please re-upload your 2 photos to complete your profile';
      // Clear images that don't have files and ask user to re-upload
      setImages(prev => prev.filter(img => img.file !== null));
    }

    // Age validation (must be 18+)
    if (formData.dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(formData.dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      
      if (age < 18) {
        validationErrors.dateOfBirth = 'You must be at least 18 years old';
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setLoading(false);
      return;
    }

    try {
      // Clear sessionStorage after successful completion
      sessionStorage.removeItem('profilecompletion_images');
      // Save profile data for the already existing user
      const profileData = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        date_of_birth: formData.dateOfBirth,
        country: formData.country,
        city: formData.city,
        zip_code: formData.zipCode,
        gender: formData.gender,
        preference: formData.preference,
        relationship_intent: formData.relationshipIntent,
        occupation: formData.occupation,
        industry: formData.industry,
        education_level: formData.educationLevel,
        bio: formData.bio || '',
        interests: formData.interests || [],
        smoking: formData.smoking || '',
        drinking: formData.drinking || '',
        exercise_level: formData.exerciseLevel || '',
        sleeping_schedule: formData.sleepingSchedule || '',
        introvert_extrovert: formData.introvertExtrovert?.[0] || 50,
        spontaneous_planner: formData.spontaneousPlanner?.[0] || 50,
        messy_organized: formData.messyOrganized?.[0] || 50,
        fun_fact: formData.funFact || '',
        perfect_first_date: formData.perfectFirstDate || '',
        last_googled: formData.lastGoogled || '',
        latitude: formData.latitude,
        longitude: formData.longitude,
        is_custom_city: formData.isCustomCity || false,
        max_distance: formData.maxDistance || 50,
        country_code: formData.countryCode || ''
      };

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          ...profileData
        });

      if (error) {
        throw error;
      }

      // Upload approved images to storage and DB for the existing user
      const approvedImages = images.filter(img => img.status === 'approved' || img.status === 'pending');
      let imageOrder = 1;
      for (const image of approvedImages) {
        try {
          if (!image.file) continue;
          const fileExt = image.file?.name.split('.').pop() || 'jpg';
          const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
          const filePath = `${user.id}/${fileName}`;
          const { error: uploadError } = await supabase.storage
            .from('user-photos')
            .upload(filePath, image.file);
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage
            .from('user-photos')
            .getPublicUrl(filePath);
          const { error: dbError } = await supabase
            .from('user_images')
            .insert({
              user_id: user.id,
              image_url: publicUrl,
              image_order: imageOrder,
              is_approved: image.status === 'approved',
              moderation_status: image.status === 'approved' ? 'approved' : 'pending',
              flagged_content: image.moderationResult?.flags || [],
              confidence_score: image.moderationResult?.confidence || 0
            });
          if (dbError) throw dbError;
          imageOrder++;
        } catch (error) {
          console.error('Error uploading image:', error);
          toast({
            title: "Image upload error",
            description: "Some images failed to upload. You can add them later.",
            variant: "destructive"
          });
        }
      }

      toast({
        title: "Profile Completed!",
        description: "Your profile has been successfully completed. Welcome to the app!",
      });

      onComplete();
    } catch (error: any) {
      console.error('Profile completion error:', error);
      toast({
        title: "Profile Completion Error",
        description: error.message || "Failed to complete profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto backdrop-blur-sm bg-white/90 shadow-2xl border-0">
      <CardHeader className="text-center pb-6">
        <div className="flex items-center justify-between mb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="flex items-center text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex justify-center">
            <div className="p-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full">
              <Heart className="w-8 h-8 text-white" />
            </div>
          </div>
          <div className="w-16"></div> {/* Spacer for alignment */}
        </div>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
          Complete Your Profile
        </CardTitle>
        <CardDescription className="text-gray-600">
          We need a few more details to complete your profile
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Basic Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">First Name *</label>
                <input
                  name="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Enter your first name"
                  required
                />
                {errors.firstName && <p className="text-sm text-red-500">{errors.firstName}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Last Name *</label>
                <input
                  name="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Enter your last name"
                  required
                />
                {errors.lastName && <p className="text-sm text-red-500">{errors.lastName}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Date of Birth *</label>
              <input
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-pink-400 focus:ring-pink-400"
                required
              />
              {errors.dateOfBirth && <p className="text-sm text-red-500">{errors.dateOfBirth}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Gender *</label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => handleSelectChange('gender', value)}
                >
                  <SelectTrigger className="border-gray-200 focus:border-pink-400">
                    <SelectValue placeholder="Select your gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {errors.gender && <p className="text-sm text-red-500">{errors.gender}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Looking for *</label>
                <Select
                  value={formData.preference}
                  onValueChange={(value) => handleSelectChange('preference', value)}
                >
                  <SelectTrigger className="border-gray-200 focus:border-pink-400">
                    <SelectValue placeholder="Select your preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="everyone">Both</SelectItem>
                  </SelectContent>
                </Select>
                {errors.preference && <p className="text-sm text-red-500">{errors.preference}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Relationship Intent *</label>
              <Select
                value={formData.relationshipIntent}
                onValueChange={(value) => handleSelectChange('relationshipIntent', value)}
              >
                <SelectTrigger className="border-gray-200 focus:border-pink-400">
                  <SelectValue placeholder="What are you looking for?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="serious">Serious</SelectItem>
                  <SelectItem value="open_to_anything">Open to Anything</SelectItem>
                </SelectContent>
              </Select>
              {errors.relationshipIntent && <p className="text-sm text-red-500">{errors.relationshipIntent}</p>}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Location *</h3>
            <LocationInput
              country={formData.country}
              city={formData.city}
              zipCode={formData.zipCode}
              onLocationChange={handleLocationChange}
              errors={errors}
              required={true}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Occupation *</label>
              <Select
                value={formData.occupation}
                onValueChange={(value) => handleSelectChange('occupation', value)}
              >
                <SelectTrigger className="border-gray-200 focus:border-pink-400">
                  <SelectValue placeholder="Select your occupation" />
                </SelectTrigger>
                <SelectContent>
                  {occupationOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.occupation && <p className="text-sm text-red-500">{errors.occupation}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Industry *</label>
              <Select
                value={formData.industry}
                onValueChange={(value) => handleSelectChange('industry', value)}
              >
                <SelectTrigger className="border-gray-200 focus:border-pink-400">
                  <SelectValue placeholder="Select your industry" />
                </SelectTrigger>
                <SelectContent>
                  {industryOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.industry && <p className="text-sm text-red-500">{errors.industry}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Education Level *</label>
            <Select
              value={formData.educationLevel}
              onValueChange={(value) => handleSelectChange('educationLevel', value)}
            >
              <SelectTrigger className="border-gray-200 focus:border-pink-400">
                <SelectValue placeholder="Select your education level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="High School">High School</SelectItem>
                <SelectItem value="Some College">Some College</SelectItem>
                <SelectItem value="Associate Degree">Associate Degree</SelectItem>
                <SelectItem value="Bachelor's Degree">Bachelor's Degree</SelectItem>
                <SelectItem value="Master's Degree">Master's Degree</SelectItem>
                <SelectItem value="Doctorate">Doctorate</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            {errors.educationLevel && <p className="text-sm text-red-500">{errors.educationLevel}</p>}
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Profile Photos *</h3>
            <p className="text-sm text-gray-600">Upload at least 2 photos. All images are checked by AI for content moderation.</p>
            
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-pink-400 transition-colors">
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
              />
              <Label htmlFor="image-upload" className="cursor-pointer">
                <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">Click to upload images</p>
                <p className="text-xs text-gray-500">JPG, PNG up to 10MB each</p>
              </Label>
            </div>

            {images.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {images.map((image, index) => (
                  <div key={index} className="relative">
                    <img
                      src={image.preview}
                      alt={`Upload ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="absolute top-2 right-2 h-6 w-6 p-0"
                      onClick={() => removeImage(image.preview)}
                    >
                      ×
                    </Button>
                    {renderImageStatus(image)}
                  </div>
                ))}
              </div>
            )}
            
            {errors.images && <p className="text-sm text-red-500">{errors.images}</p>}
          </div>

          <div className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Completing Profile...' : 'Complete Profile'}
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
                className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 rounded-lg transition-all duration-200"
              >
                Cancel
              </Button>
            </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default ProfileCompletionForm;
