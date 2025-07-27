
import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Heart, MapPin, Briefcase, GraduationCap, Upload, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import BasicInfoSection from '@/components/forms/BasicInfoSection';
import LocationInput from '@/components/forms/LocationInput';
import { validateRegistrationForm, transformFormDataForSubmission } from '@/utils/formValidation';
import { initialFormData } from '@/constants/formData';
import { occupationOptions, industryOptions } from '@/constants/professionOptions';
import { moderateImage, ModerationResult } from '@/utils/photoModeration';
import { compressImage } from '@/utils/imageCompression';
import { useToast } from '@/hooks/use-toast';

interface RegistrationFormProps {
  onSubmit: (data: any) => void;
  onBackToLogin: () => void;
}

interface ImageUpload {
  file: File;
  preview: string;
  moderationResult?: ModerationResult;
  status: 'uploading' | 'moderating' | 'approved' | 'pending' | 'rejected';
}

const RegistrationForm = ({ onSubmit, onBackToLogin }: RegistrationFormProps) => {
  const [formData, setFormData] = useState(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(1);
  const [images, setImages] = useState<ImageUpload[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Restore images from sessionStorage on mount
  React.useEffect(() => {
    const saved = sessionStorage.getItem('registration_images');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only restore preview/status/moderationResult, not File
        setImages(parsed.map((img: any) => ({
          file: null, // File cannot be restored
          preview: img.preview,
          moderationResult: img.moderationResult,
          status: img.status
        })));
      } catch {}
    }
  }, []);

  // Save images to sessionStorage whenever they change
  React.useEffect(() => {
    // Only save serializable data
    const serializable = images.map(img => ({
      preview: img.preview,
      moderationResult: img.moderationResult,
      status: img.status
    }));
    sessionStorage.setItem('registration_images', JSON.stringify(serializable));
  }, [images]);

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

  const handleSliderChange = (field: string, value: number[]) => {
    setFormData({
      ...formData,
      [field]: value
    });
  };

  const handleInterestToggle = (interest: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
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

        // Save updated images to sessionStorage
        setTimeout(() => {
          const serializable = images.map(img => ({
            preview: img.preview,
            moderationResult: img.moderationResult,
            status: img.status
          }));
          sessionStorage.setItem('registration_images', JSON.stringify(serializable));
        }, 0);

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
        setTimeout(() => {
          const serializable = images.map(img => ({
            preview: img.preview,
            moderationResult: img.moderationResult,
            status: img.status
          }));
          sessionStorage.setItem('registration_images', JSON.stringify(serializable));
        }, 0);
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
          <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center rounded-lg">
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

  const handleContinue = () => {
    // Validate first step fields
    const firstStepErrors: Record<string, string> = {};
    if (!formData.firstName.trim()) firstStepErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) firstStepErrors.lastName = 'Last name is required';
    if (!formData.email.trim()) firstStepErrors.email = 'Email is required';
    if (!formData.password) firstStepErrors.password = 'Password is required';
    if (!formData.confirmPassword) firstStepErrors.confirmPassword = 'Please confirm your password';
    if (!formData.dateOfBirth) firstStepErrors.dateOfBirth = 'Date of birth is required';
    if (!formData.country) firstStepErrors.country = 'Country is required';
    if (!formData.city.trim()) firstStepErrors.city = 'City is required';
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.email && !emailRegex.test(formData.email)) {
      firstStepErrors.email = 'Please enter a valid email address';
    }
    
    // Password validation
    if (formData.password && formData.password.length < 6) {
      firstStepErrors.password = 'Password must be at least 6 characters long';
    }
    
    // Password confirmation
    if (formData.password !== formData.confirmPassword) {
      firstStepErrors.confirmPassword = 'Passwords do not match';
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
        firstStepErrors.dateOfBirth = 'You must be at least 18 years old';
      }
    }

    if (Object.keys(firstStepErrors).length > 0) {
      setErrors(firstStepErrors);
      return;
    }
    
    setErrors({});
    setCurrentStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmitting) return;
    
    if (currentStep === 1) {
      handleContinue();
      return;
    }
    
    if (currentStep === 2) {
      // Validate second step
      const validationErrors = validateRegistrationForm(formData);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      setCurrentStep(3);
      return;
    }

    // Final step - validate images
    const approvedImages = images.filter(img => img.status === 'approved' || img.status === 'pending');
    
    if (approvedImages.length < 2) {
      toast({
        title: "Not enough photos",
        description: "Please upload at least 2 photos to complete registration.",
        variant: "destructive"
      });
      return;
    }

    const rejectedImages = images.filter(img => img.status === 'rejected');
    if (rejectedImages.length > 0) {
      toast({
        title: "Some images were rejected",
        description: "Please remove rejected images before continuing.",
        variant: "destructive"
      });
      return;
    }

    // Check if we have valid files for approved images
    const imagesWithFiles = approvedImages.filter(img => img.file !== null);
    if (imagesWithFiles.length < 2) {
      toast({
        title: "Photos need to be re-uploaded",
        description: "Please re-upload your photos to complete registration.",
        variant: "destructive"
      });
      // Clear images that don't have files and ask user to re-upload
      setImages(prev => prev.filter(img => img.file !== null));
      return;
    }

    // Set loading state
    setIsSubmitting(true);
    
    // Clear sessionStorage after successful registration
    sessionStorage.removeItem('registration_images');
    // Submit with images
    // 1. Create user account
    let userId = null;
    let userEmail = formData.email;
    let userCreated = false;
    try {
      // Create user in Supabase Auth with complete metadata
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            date_of_birth: formData.dateOfBirth,
            country: formData.country,
            city: formData.city,
            zip_code: formData.zipCode,
            gender: formData.gender,
            preference: formData.preference,
            relationship_intent: formData.relationshipIntent,
            occupation: formData.occupation || '',
            industry: formData.industry || '',
            education_level: formData.educationLevel || '',
            bio: formData.bio || '',
            email: formData.email,
            email_verified: true,
            phone_verified: false
          }
        }
      });
      
      if (signUpError) {
        // Handle the specific "User already registered" error
        if (signUpError.message.includes('User already registered') || signUpError.message.includes('already been registered')) {
          // Check if user is already signed in
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            userId = session.user.id;
            userCreated = true;
          } else {
            throw new Error('User already exists. Please sign in instead.');
          }
        } else {
          throw signUpError;
        }
      } else {
        userId = signUpData?.user?.id;
        userCreated = !!userId;
      }
    } catch (err) {
      console.error('Auth signup error:', err);
      setIsSubmitting(false); // Reset loading state
      toast({
        title: 'Account Creation Error',
        description: err.message || 'Failed to create account.',
        variant: 'destructive',
      });
      return;
    }

    // 2. Save profile data
    try {
      const profileData = {
        id: userId,
        email: userEmail,
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
        latitude: formData.latitude,
        longitude: formData.longitude,
        is_custom_city: formData.isCustomCity || false,
        max_distance: formData.maxDistance || 50,
        country_code: formData.countryCode || ''
      };
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profileData);
      if (profileError) throw profileError;
    } catch (err) {
      setIsSubmitting(false); // Reset loading state
      toast({
        title: 'Profile Save Error',
        description: err.message || 'Failed to save profile.',
        variant: 'destructive',
      });
      return;
    }

    // 3. Upload approved images to storage and save to DB
    let imageOrder = 1;
    for (const image of imagesWithFiles) {
      try {
        // Skip if file is null (restored from sessionStorage)
        if (!image.file) {
          console.warn('Skipping image upload - file is null');
          continue;
        }

        // Upload to storage
        const fileExt = image.file.name?.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('user-photos')
          .upload(filePath, image.file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('user-photos')
          .getPublicUrl(filePath);

        // Save to database with proper image order (1-based index, max 7)
        const { error: dbError } = await supabase
          .from('user_images')
          .insert({
            user_id: userId,
            image_url: publicUrl,
            image_order: imageOrder,
            is_approved: image.status === 'approved',
            moderation_status: image.status === 'approved' ? 'approved' : 'pending',
            flagged_content: image.moderationResult?.flags || [],
            confidence_score: image.moderationResult?.confidence || 0
          });

        if (dbError) {
          console.error('Database error:', dbError);
          throw dbError;
        }
        
        // Increment order for next image
        imageOrder++;
      } catch (error) {
        console.error('Error uploading image:', error);
        toast({
          title: 'Image Upload Error',
          description: 'Some images failed to upload. You can add them later.',
          variant: 'destructive',
        });
      }
    }

    setIsSubmitting(false); // Reset loading state
    toast({
      title: 'Account Created!',
      description: 'Your account and profile have been created. Welcome!',
    });
    onSubmit({ ...formData, images: approvedImages });
  };

  return (
    <Card className="w-full max-w-md mx-auto backdrop-blur-sm bg-white/90 shadow-2xl border-0 animate-fade-in">
      <CardHeader className="text-center pb-6">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full hover-scale">
            <Heart className="w-8 h-8 text-white" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent animate-fade-in">
          {currentStep === 1 ? 'Create Your Account' : currentStep === 2 ? 'Tell Us More About You' : 'Add Your Photos'}
        </CardTitle>
        <CardDescription className="text-gray-600 animate-fade-in">
          {currentStep === 1 
            ? 'Just a few details to get started. You can complete your profile later for better matches!'
            : currentStep === 2
            ? 'Help us find your perfect match with a few more details!'
            : 'Upload at least 2 photos to complete your profile'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="animate-fade-in">
        <form onSubmit={handleSubmit} className="space-y-8">
          {currentStep === 1 && (
            <div className="space-y-6 animate-fade-in">
          <BasicInfoSection
            formData={formData}
            errors={errors}
            showPassword={showPassword}
            showConfirmPassword={showConfirmPassword}
            onInputChange={handleInputChange}
            onSelectChange={handleSelectChange}
            onTogglePassword={() => setShowPassword(!showPassword)}
            onToggleConfirmPassword={() => setShowConfirmPassword(!showConfirmPassword)}
          />
          
          {/* Location Section */}
          <div className="animate-scale-in">
            <LocationInput
              country={formData.country}
              city={formData.city}
              zipCode={formData.zipCode}
              onLocationChange={handleLocationChange}
              errors={{
                country: errors.country,
                city: errors.city,
                zipCode: errors.zipCode
              }}
              required={true}
            />
          </div>
          </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-fade-in">

          {/* Gender and Preference */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-scale-in">
            <div className="space-y-2">
              <Label className="text-sm font-medium">I am *</Label>
              <Select value={formData.gender} onValueChange={(value) => handleSelectChange('gender', value)}>
                <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.gender ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Looking for *</Label>
              <Select value={formData.preference} onValueChange={(value) => handleSelectChange('preference', value)}>
                <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.preference ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Select preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="everyone">Everyone</SelectItem>
                </SelectContent>
              </Select>
              {errors.preference && <p className="text-red-500 text-xs mt-1">{errors.preference}</p>}
            </div>
          </div>

          {/* Relationship Intent */}
          <div className="space-y-2 animate-scale-in">
            <Label className="text-sm font-medium">Relationship Intent</Label>
            <Select value={formData.relationshipIntent} onValueChange={(value) => handleSelectChange('relationshipIntent', value)}>
              <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.relationshipIntent ? 'border-red-500' : ''}`}>
                <SelectValue placeholder="What are you looking for?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="serious">Serious</SelectItem>
                <SelectItem value="open_to_anything">Open to Anything</SelectItem>
              </SelectContent>
            </Select>
            {errors.relationshipIntent && <p className="text-red-500 text-xs mt-1">{errors.relationshipIntent}</p>}
          </div>

          {/* Work & Education */}
          <div className="space-y-4 animate-scale-in">
            <h4 className="text-lg font-semibold text-gray-800">Work & Education</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Occupation</Label>
                <Select value={formData.occupation} onValueChange={(value) => handleSelectChange('occupation', value)}>
                  <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.occupation ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select your occupation" />
                  </SelectTrigger>
                  <SelectContent>
                    {occupationOptions.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.occupation && <p className="text-red-500 text-xs mt-1">{errors.occupation}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Industry</Label>
                <Select value={formData.industry} onValueChange={(value) => handleSelectChange('industry', value)}>
                  <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.industry ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {industryOptions.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.industry && <p className="text-red-500 text-xs mt-1">{errors.industry}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Education Level</Label>
              <Select value={formData.educationLevel} onValueChange={(value) => handleSelectChange('educationLevel', value)}>
                <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.educationLevel ? 'border-red-500' : ''}`}>
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
              {errors.educationLevel && <p className="text-red-500 text-xs mt-1">{errors.educationLevel}</p>}
            </div>
          </div>
          </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center">
                <div className="flex items-center justify-center mb-4">
                  <Shield className="w-5 h-5 text-purple-600 mr-2" />
                  <span className="text-sm text-purple-600 font-medium">AI Content Moderation Active</span>
                </div>
                <p className="text-sm text-gray-600">All photos are automatically checked for appropriateness</p>
              </div>

              <div className="space-y-4">
                <Label htmlFor="photos" className="text-lg font-medium">Upload Photos (Minimum 2 required)</Label>
                <Input
                  id="photos"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="cursor-pointer"
                />
                
                {images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {images.map((image, index) => (
                      <div key={image.preview} className="relative group">
                        <img 
                          src={image.preview} 
                          alt={`Upload ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg shadow-sm"
                        />
                        {renderImageStatus(image)}
                        
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-8 w-8"
                          onClick={() => removeImage(image.preview)}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Photo Guidelines:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Clear photos showing your face</li>
                    <li>• Appropriate clothing required</li>
                    <li>• No explicit or inappropriate content</li>
                    <li>• Borderline content may require admin review</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {currentStep > 1 && (
              <Button 
                type="button" 
                variant="outline"
                onClick={() => setCurrentStep(currentStep - 1)}
                className="w-full border-pink-400 text-pink-600 hover:bg-pink-50 transition-all duration-200 animate-fade-in"
              >
                Back
              </Button>
            )}
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 animate-fade-in disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting 
                ? 'Creating Account...' 
                : currentStep === 1 
                  ? 'Continue' 
                  : currentStep === 2 
                    ? 'Add Photos' 
                    : 'Create Account'
              }
            </Button>
          </div>
          <div className="text-center animate-fade-in">
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-pink-600 hover:text-pink-700 font-semibold transition-colors story-link"
            >
              Already have an account? Sign In
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default RegistrationForm;
