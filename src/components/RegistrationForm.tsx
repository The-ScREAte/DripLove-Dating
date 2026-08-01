
import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Heart, MapPin, Briefcase, GraduationCap, Upload, Shield, CheckCircle, AlertTriangle, Camera } from 'lucide-react';
import BasicInfoSection from '@/components/forms/BasicInfoSection';
import LocationInput from '@/components/forms/LocationInput';
import AdinkraSymbolSelector from '@/components/forms/AdinkraSymbolSelector';
import PromoCodeInput from '@/components/forms/PromoCodeInput';
import { validateRegistrationForm, transformFormDataForSubmission } from '@/utils/formValidation';
import { initialFormData } from '@/constants/formData';
import { occupationOptions, industryOptions } from '@/constants/professionOptions';
import { moderateImage, ModerationResult } from '@/utils/photoModeration';
import { compressImage } from '@/utils/imageCompression';
import { useToast } from '@/hooks/use-toast';
import { verifyUploadedImage, detectHumanFace } from '@/utils/faceVerificationUtils';
import { useTranslation } from 'react-i18next';
import FaceVerification from '@/components/FaceVerification';
import { usePromoCodeEnabled } from '@/hooks/usePromoCodeEnabled';
import { getFaceReferenceCode } from '@/utils/faceReference';

interface RegistrationFormProps {
  onSubmit: (data: any) => void;
  onBackToLogin: () => void;
}

interface ImageUpload {
  file: File;
  preview: string;
  moderationResult?: ModerationResult;
  status: 'uploading' | 'moderating' | 'approved' | 'pending' | 'rejected';
  hash?: string; // Store hash for duplicate detection
}

interface DuplicateFaceDetails {
  similarity?: number | null;
  faceId?: string | null;
  imageId?: string | null;
  externalImageId?: string | null;
  associatedUserId?: string | null;
  associatedEmail?: string | null;
  associatedName?: string | null;
}

const extractDuplicateFaceDetails = (data: any): DuplicateFaceDetails => {
  if (data?.duplicateFace && typeof data.duplicateFace === 'object') {
    return data.duplicateFace;
  }

  return {
    similarity: data?.similarity ?? null,
    faceId: data?.faceId ?? null,
    imageId: data?.imageId ?? null,
    externalImageId: data?.externalImageId ?? null,
    associatedUserId: data?.associatedUserId ?? null,
    associatedEmail: data?.associatedEmail ?? null,
    associatedName: data?.associatedName ?? null,
  };
};

const RegistrationForm = ({ onSubmit, onBackToLogin }: RegistrationFormProps) => {
  const [formData, setFormData] = useState(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(1);
  const [images, setImages] = useState<ImageUpload[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceImageData, setFaceImageData] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isEnabled: promoCodeEnabled } = usePromoCodeEnabled();

  const formatDuplicateFaceMessage = (details?: DuplicateFaceDetails | null) => {
    const code = getFaceReferenceCode(details);
    return `User already exists. Reference code: ${code}.`;
  };

  // Restore face verification from localStorage on mount
  React.useEffect(() => {
    const savedFace = localStorage.getItem('pending_face_verification');
    if (savedFace) {
      setFaceImageData(savedFace);
      setFaceVerified(true);
    }
  }, []);

  // Handle face verification - validates and stores locally until form submission
  const handleFaceVerified = async (faceImageBase64: string) => {
    setIsVerifying(true);
    try {
      // First validate the face (check for duplicates) WITHOUT indexing
      const { data, error } = await supabase.functions.invoke("face-verify", {
        body: {
          action: "validate_only",
          front: faceImageBase64,
        },
      });

      if (error) {
        console.error('Face validation error:', error);
        toast({
          title: "Verification Failed",
          description: "Could not validate your face. Please try again.",
          variant: "destructive",
        });
        return;
      }

      if (!data?.success) {
        // Face already exists in system
        const isDuplicateFace = data?.code === 'DUPLICATE_FACE';
        toast({
          title: isDuplicateFace ? "Face Already Registered" : "Verification Failed",
          description: isDuplicateFace
            ? formatDuplicateFaceMessage(extractDuplicateFaceDetails(data))
            : (data?.error || "Could not verify your face. Please try again."),
          variant: "destructive",
        });
        return;
      }

      // Store in localStorage (not DB yet)
      localStorage.setItem('pending_face_verification', faceImageBase64);
      setFaceImageData(faceImageBase64);
      setFaceVerified(true);
      setShowFaceVerification(false);
      
      toast({
        title: "Face Verified! ✓",
        description: "Your face will be saved when you complete registration.",
      });
    } catch (err) {
      console.error('Face verification error:', err);
      toast({
        title: "Verification Error",
        description: "Could not capture face. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Restore images from localStorage on mount
  React.useEffect(() => {
    const saved = localStorage.getItem('registration_images');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only restore preview/status/moderationResult/hash, not File
        setImages(parsed.map((img: any) => ({
          file: null, // File cannot be restored
          preview: img.preview,
          moderationResult: img.moderationResult,
          status: img.status,
          hash: img.hash // Restore hash for duplicate detection
        })));
      } catch {}
    }
  }, []);

  // Save images to localStorage whenever they change
  React.useEffect(() => {
    // Only save serializable data including hash
    const serializable = images.map(img => ({
      preview: img.preview,
      moderationResult: img.moderationResult,
      status: img.status,
      hash: img.hash // Save hash for duplicate detection
    }));
    localStorage.setItem('registration_images', JSON.stringify(serializable));
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
    const updates: any = { [field]: value };
    
    // Auto-select opposite gender for preference, but allow manual override
    if (field === 'gender' && !formData.preference) {
      if (value === 'male') {
        updates.preference = 'female';
      } else if (value === 'female') {
        updates.preference = 'male';
      }
    }
    
    setFormData({
      ...formData,
      ...updates
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

    if (images.length + files.length > 5) {
      toast({
        title: "Too many images",
        description: "You can upload a maximum of 5 images.",
        variant: "destructive"
      });
      return;
    }

    // Helper function to generate a simple hash from file content
    const getFileHash = async (file: File): Promise<string> => {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      // Simple hash: combine file size with first and last bytes
      const firstBytes = Array.from(uint8Array.slice(0, 100)).join(',');
      const lastBytes = Array.from(uint8Array.slice(-100)).join(',');
      return `${file.size}-${file.type}-${firstBytes}-${lastBytes}`;
    };

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

      // Compress (typically to JPEG) to keep uploads small and consistent
      const compressedFile = await compressImage(file);
      
      // Generate hash AFTER compression for accurate duplicate detection
      const fileHash = await getFileHash(compressedFile);
      
      // Check against existing images (including their stored hashes)
      const isDuplicate = images.some(img => img.hash === fileHash);

      if (isDuplicate) {
        toast({
          title: "Duplicate image",
          description: "This image has already been uploaded.",
          variant: "destructive"
        });
        continue;
      }

      const preview = URL.createObjectURL(compressedFile);
      const newImage: ImageUpload = { 
        file: compressedFile, 
        preview, 
        status: 'moderating',
        hash: fileHash // Store hash for future comparisons
      };

      setImages(prev => [...prev, newImage]);

      // Determine the position of this new image (0-indexed)
      const imagePosition = images.length;
      
      // AI Moderation
      try {
        const moderationResult = await moderateImage(compressedFile);
        
        // For first 2 images (positions 0 and 1), also verify face matches
        let requiresFaceReview = false;
        if (imagePosition < 2 && faceImageData) {
          // Compare with verified face
          const faceResult = await verifyUploadedImage(
            compressedFile,
            faceImageData,
            imagePosition,
            faceVerified
          );
          
          if (faceResult.requiresReview) {
            requiresFaceReview = true;
            // Update moderation result to reflect face verification failure
            moderationResult.details = {
              ...moderationResult.details,
              requiresReview: true,
              faceVerificationFailed: true,
              faceVerificationReason: faceResult.reason
            };
          }
        } else if (imagePosition < 2 && !faceImageData) {
          // Face verification not completed but trying to upload first 2 images
          requiresFaceReview = true;
          moderationResult.details = {
            ...moderationResult.details,
            requiresReview: true,
            faceVerificationFailed: true,
            faceVerificationReason: 'Face verification not completed'
          };
        }
        
        // For images at positions 2+ (3rd image onwards), just check for human figure
        if (imagePosition >= 2 && moderationResult.isApproved) {
          const faceDetection = await detectHumanFace(compressedFile);
          if (!faceDetection.hasFace) {
            // No human face detected - send to review
            moderationResult.details = {
              ...moderationResult.details,
              requiresReview: true,
              noHumanDetected: true
            };
          }
        }

        setImages(prev => prev.map(img => 
          img.preview === preview 
            ? { 
                ...img, 
                moderationResult,
                status: !moderationResult.isApproved 
                  ? 'rejected' 
                  : (moderationResult.details?.requiresReview || requiresFaceReview)
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
        } else if (moderationResult.details?.requiresReview || requiresFaceReview) {
          const reviewReason = moderationResult.details?.faceVerificationReason 
            || (moderationResult.details?.noHumanDetected ? "No human figure detected" : null)
            || "Image requires additional verification";
          toast({
            title: "Image needs review",
            description: `${reviewReason}. Our team will review this image.`,
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
    // Country is now optional per Apple's guidelines
    if (!formData.city.trim()) firstStepErrors.city = 'City is required';
    
    // Face verification is required
    if (!faceVerified) {
      firstStepErrors.faceVerification = 'Face verification is required to continue';
      toast({
        title: "Face Verification Required",
        description: "Please verify your face to continue registration.",
        variant: "destructive",
      });
    }
    
    // Email validation - accepts any valid email with a domain (e.g., user@gmail.com, user@company.co.uk)
    // Domain must have at least 2 characters after the last dot
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    if (formData.email && !emailRegex.test(formData.email)) {
      firstStepErrors.email = 'Please enter a valid email address (e.g., name@domain.com)';
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
        title: t('registration.errors.photosRequired'),
        description: t('registration.uploadAtLeastTwoPhotos'),
        variant: "destructive"
      });
      return;
    }

    const rejectedImages = images.filter(img => img.status === 'rejected');
    if (rejectedImages.length > 0) {
      toast({
        title: t('registration.errors.someImagesRejected'),
        description: t('registration.removeRejectedImages'),
        variant: "destructive"
      });
      return;
    }

    // Check if we have valid files for approved images
    const imagesWithFiles = approvedImages.filter(img => img.file !== null);
    if (imagesWithFiles.length < 2) {
      toast({
        title: t('registration.errors.photosNeedReupload'),
        description: t('registration.reuploadTwoPhotos'),
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
      // Check if user profile already exists (this is the only check that matters)
      const { data: existingProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', formData.email)
        .single();
      
      if (existingProfile) {
        toast({
          title: "Account exists",
          description: "An account with this email already exists. Please sign in instead.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // Create new user account directly (no existing user checks in auth.users)
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
            bio: formData.bio || ''
          }
        }
      });
      
      if (signUpError) {
        toast({
          title: "Registration failed",
          description: signUpError.message,
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      userId = signUpData?.user?.id;
      userCreated = !!userId;
    } catch (err) {
      setIsSubmitting(false);
      toast({
        title: 'Account Creation Error',
        description: err.message || 'Failed to create account. Please try a different email or sign in if you already have an account.',
        variant: 'destructive',
      });
      return;
    }

    // 2. Save profile data (handle case where profile might already exist from DB trigger)
    // Add a small delay to allow any database triggers to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      // First check if profile already exists
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('id', userId)
        .single();

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
        max_distance: formData.maxDistance || 250,
        country_code: formData.countryCode || '',
        adinkra_symbols: formData.adinkraSymbols || []
      };

      if (existingProfile) {
        // Profile exists, update it
        const { error: profileError } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('id', userId);
        if (profileError) {
          throw profileError;
        }
      } else {
        // Profile doesn't exist, create it
        const { error: profileError } = await supabase
          .from('profiles')
          .insert(profileData);
        if (profileError) {
          // If insert fails due to conflict, try update instead
          if (profileError.code === '23505' || profileError.message.includes('duplicate') || profileError.message.includes('already exists')) {
            const { error: updateError } = await supabase
              .from('profiles')
              .update(profileData)
              .eq('id', userId);
            if (updateError) {
              throw updateError;
            }
          } else {
            throw profileError;
          }
        }
      }

      // Save referral if promo code was used
      if (formData.promoCodeId) {
        try {
          await supabase
            .from('referrals')
            .insert({
              user_id: userId,
              promo_code_id: formData.promoCodeId
            });
        } catch (refErr) {
          console.error('Error saving referral:', refErr);
          // Don't block registration if referral save fails
        }
      }
      
    } catch (err) {
      setIsSubmitting(false); // Reset loading state
      toast({
        title: 'Profile Save Error',
        description: err.message || 'Failed to save profile.',
        variant: 'destructive',
      });
      return;
    }

    // 3. Upload approved images to storage and save to DB (after user is created)
    
    let imageOrder = 1;
    for (const image of imagesWithFiles) {
      try {
        if (!image.file) {
          continue;
        }
        
        // Upload to storage (extension must match MIME type after compression)
        const mimeToExt: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
          'image/gif': 'gif'
        };
        const fileExt = mimeToExt[image.file.type] || 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `${userId}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('user-photos')
          .upload(filePath, image.file, {
            contentType: image.file.type,
            cacheControl: '3600'
          });
          
        if (uploadError) {
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
          throw dbError;
        }
        
        imageOrder++;
      } catch (error) {
        toast({
          title: 'Image Upload Error',
          description: `Image ${imageOrder} failed to upload. You can add it later from your profile.`,
          variant: 'destructive',
        });
        // Continue with other images instead of failing completely
      }
    }

    // 4. Index face in AWS Rekognition with user's name (only now, after user is created)
    const pendingFace = localStorage.getItem('pending_face_verification');
    if (pendingFace && userId) {
      try {
        const userName = `${formData.firstName} ${formData.lastName}`;
        const { data: faceData, error: faceError } = await supabase.functions.invoke("face-verify", {
          body: {
            action: "index_face",
            front: pendingFace,
            userId: userId,
            userName: userName, // Include user's name for admin identification
          },
        });

        if (faceError) {
          console.error('Face indexing error:', faceError);
        } else if (faceData?.success) {
          // Update profile with face descriptor
          await supabase
            .from('profiles')
            .update({ 
              face_descriptor: faceData.faceId || 'verified',
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        }
        
        // Clear localStorage after successful indexing
        localStorage.removeItem('pending_face_verification');
      } catch (faceErr) {
        console.error('Face indexing exception:', faceErr);
      }
    }

    setIsSubmitting(false); // Reset loading state
    
    // Clear localStorage after successful registration
    localStorage.removeItem('registration_images');
    localStorage.removeItem('pending_face_verification');
    
    // Fetch the new user from supabase and pass to onSubmit so app state updates
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('Error fetching user after registration:', userError);
      }
      
      if (user) {
        // Pass user directly to onSubmit - NO reload needed
        onSubmit({ ...formData, images: approvedImages, user });
      } else {
        onSubmit({ ...formData, images: approvedImages });
      }
    } catch (error) {
      onSubmit({ ...formData, images: approvedImages });
    }
  };

  return (
    <div className="keyboard-safe-form input-scroll-container relative min-h-[100dvh] overflow-x-visible touch-pan-y">
      <div className="relative z-10 px-2 sm:px-0 py-4 sm:py-8 pb-[calc(env(safe-area-inset-bottom,0px)+28px)]">
        <Card className="w-full max-w-full sm:max-w-md mx-auto rounded-none backdrop-blur-sm bg-white/40 shadow-none border border-white/40 animate-fade-in">
      <CardHeader className="text-center px-3 sm:px-6 pb-5 sm:pb-6">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full hover-scale">
            <Heart className="w-8 h-8 text-white" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent animate-fade-in">
          {currentStep === 1 ? t('registration.createAccount') : currentStep === 2 ? t('registration.tellUsMore') : t('registration.addPhotos')}
        </CardTitle>
      </CardHeader>
      <CardContent className="animate-fade-in px-3 sm:px-6 pb-5 sm:pb-8">
        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
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
            showFaceVerification={showFaceVerification}
            setShowFaceVerification={setShowFaceVerification}
            faceVerified={faceVerified}
            isVerifying={isVerifying}
            onFaceVerified={handleFaceVerified}
            faceError={errors.faceVerification}
          />

          {/* Work & Education */}
          <div className="space-y-4 animate-scale-in">
            <h4 className="text-lg font-semibold text-gray-800">{t('registration.workEducation')}</h4>
            <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('profile.occupation')}</Label>
                <Select value={formData.occupation} onValueChange={(value) => handleSelectChange('occupation', value)}>
                  <SelectTrigger className={`pl-2.5 pr-2.5 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.occupation ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select" />
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
                <Label className="text-sm font-medium">{t('profile.industry')}</Label>
                <Select value={formData.industry} onValueChange={(value) => handleSelectChange('industry', value)}>
                  <SelectTrigger className={`pl-2.5 pr-2.5 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.industry ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select" />
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
              <Label className="text-sm font-medium">{t('registration.educationLevel')}</Label>
              <Select value={formData.educationLevel} onValueChange={(value) => handleSelectChange('educationLevel', value)}>
                <SelectTrigger className={`pl-2.5 pr-2.5 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.educationLevel ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High School">{t('registration.highSchool')}</SelectItem>
                  <SelectItem value="Some College">{t('registration.someCollege')}</SelectItem>
                  <SelectItem value="Associate Degree">{t('registration.associateDegree')}</SelectItem>
                  <SelectItem value="Bachelor's Degree">{t('registration.bachelorsDegree')}</SelectItem>
                  <SelectItem value="Master's Degree">{t('registration.mastersDegree')}</SelectItem>
                  <SelectItem value="Doctorate">{t('registration.doctorate')}</SelectItem>
                  <SelectItem value="Other">{t('registration.other')}</SelectItem>
                </SelectContent>
              </Select>
              {errors.educationLevel && <p className="text-red-500 text-xs mt-1">{errors.educationLevel}</p>}
            </div>
          </div>
          
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
              required={false}
              autoDetect={true}
            />
          </div>

          </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-fade-in">

          {/* Gender and Preference */}
          <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 sm:gap-4 animate-scale-in">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('registration.iAm')} *</Label>
              <Select value={formData.gender} onValueChange={(value) => handleSelectChange('gender', value)}>
                <SelectTrigger className={`pl-2.5 pr-2.5 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.gender ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder={t('registration.selectGender')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t('registration.male')}</SelectItem>
                  <SelectItem value="female">{t('registration.female')}</SelectItem>
                  <SelectItem value="other">{t('registration.other')}</SelectItem>
                </SelectContent>
              </Select>
              {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('registration.lookingFor')} *</Label>
              <Select value={formData.preference} onValueChange={(value) => handleSelectChange('preference', value)}>
                <SelectTrigger className={`pl-2.5 pr-2.5 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.preference ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder={t('registration.selectPreference')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t('registration.male')}</SelectItem>
                  <SelectItem value="female">{t('registration.female')}</SelectItem>
                  <SelectItem value="everyone">{t('registration.everyone')}</SelectItem>
                </SelectContent>
              </Select>
              {errors.preference && <p className="text-red-500 text-xs mt-1">{errors.preference}</p>}
            </div>
          </div>

          {/* Relationship Intent */}
          <div className="space-y-2 animate-scale-in">
            <Label className="text-sm font-medium">{t('registration.relationshipIntent')}</Label>
            <Select value={formData.relationshipIntent} onValueChange={(value) => handleSelectChange('relationshipIntent', value)}>
              <SelectTrigger className={`pl-2.5 pr-2.5 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.relationshipIntent ? 'border-red-500' : ''}`}>
                <SelectValue placeholder={t('registration.whatLookingFor')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">{t('registration.casual')}</SelectItem>
                <SelectItem value="serious">{t('registration.serious')}</SelectItem>
                <SelectItem value="open_to_anything">{t('registration.openToAnything')}</SelectItem>
              </SelectContent>
            </Select>
            {errors.relationshipIntent && <p className="text-red-500 text-xs mt-1">{errors.relationshipIntent}</p>}
          </div>

            {/* Adinkra Symbols Selector */}
            <div className="space-y-4 mt-6 animate-scale-in">
              <AdinkraSymbolSelector
                selectedSymbols={formData.adinkraSymbols}
                onChange={(symbols) => setFormData({ ...formData, adinkraSymbols: symbols })}
                userCountry={formData.country}
              />
              {errors.adinkraSymbols && <p className="text-red-500 text-xs mt-1">{errors.adinkraSymbols}</p>}
            </div>
          </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4 animate-fade-in">

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="photos" className="text-sm font-semibold text-gray-800">Profile Photos *</Label>
                  <p className="text-[11px] text-gray-600 whitespace-nowrap">2+ photos required</p>
                </div>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-pink-400 transition-colors">
                  <Input
                    id="photos"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <Label htmlFor="photos" className="cursor-pointer block">
                    <Upload className="mx-auto h-5 w-5 text-gray-400 mb-1" />
                    <p className="text-xs text-gray-600">Upload photos</p>
                    <p className="text-[11px] text-gray-500">JPG/PNG up to 10MB</p>
                  </Label>
                </div>
                <p className="text-[11px] text-gray-500 flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3" />
                  Reviewed within 24h.
                </p>
                
                {images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((image, index) => (
                      <div key={image.preview} className="relative group">
                        <img 
                          src={image.preview} 
                          alt={`Upload ${index + 1}`}
                          className="w-full h-28 object-cover rounded-lg shadow-sm"
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

                {promoCodeEnabled && (
                  <div className="animate-scale-in">
                    <PromoCodeInput
                      value={formData.promoCode}
                      onChange={(value, promoCodeId) => {
                        setFormData(prev => ({
                          ...prev,
                          promoCode: value,
                          promoCodeId: promoCodeId
                        }));
                      }}
                    />
                  </div>
                )}

                {/* Note: Face verification is now shown in step 1 under name fields */}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
            {currentStep > 1 && (
              <Button 
                type="button" 
                variant="outline"
                onClick={() => setCurrentStep(currentStep - 1)}
                className="h-9 px-4 sm:w-auto border-pink-400 text-pink-600 hover:bg-pink-50 transition-all duration-200 animate-fade-in"
              >
                {t('registration.back')}
              </Button>
            )}
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="h-9 px-4 sm:w-auto bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold rounded-lg transition-all duration-200 animate-fade-in disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting 
                ? t('registration.creatingAccount')
                : currentStep === 1 
                  ? t('registration.continue')
                  : currentStep === 2 
                    ? t('registration.addPhoto')
                    : t('registration.createAccount')
              }
            </Button>
          </div>
          <div className="text-center animate-fade-in">
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-pink-600 hover:text-pink-700 font-semibold transition-colors story-link"
            >
              {t('registration.alreadyHaveAccount')}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
      </div>
    </div>
  );
};

export default RegistrationForm;
