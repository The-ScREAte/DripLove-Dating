import React, { useEffect, useState, lazy, Suspense } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Heart, Upload, Shield, CheckCircle, AlertTriangle, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { initialFormData } from '@/constants/formData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { occupationOptions, industryOptions } from '@/constants/professionOptions';
import LocationInput from '@/components/forms/LocationInput';
import AdinkraSymbolSelector from '@/components/forms/AdinkraSymbolSelector';
import PromoCodeInput from '@/components/forms/PromoCodeInput';
import { moderateImage, ModerationResult } from '@/utils/photoModeration';
import { compressImage } from '@/utils/imageCompression';
import { verifyUploadedImage, detectHumanFace } from '@/utils/faceVerificationUtils';
import { getLanguageForCountry } from '@/i18n/config';
import { videoPreloader } from '@/utils/videoPreloader';
import FaceVerification from '@/components/FaceVerification';
import HoppingLogo from '@/components/HoppingLogo';
import { usePromoCodeEnabled } from '@/hooks/usePromoCodeEnabled';
import { getFaceReferenceCode } from '@/utils/faceReference';

const TermsAcceptance = lazy(() => import('./TermsAcceptance'));

interface ImageUpload {
  file: File | null;
  preview: string;
  moderationResult?: ModerationResult;
  status: 'uploading' | 'moderating' | 'approved' | 'pending' | 'rejected';
  hash?: string; // Store hash for duplicate detection
}

type StoredImageUpload = {
  preview: string
  moderationResult?: ModerationResult
  status: ImageUpload['status']
  hash?: string
}

type DuplicateFaceDetails = {
  similarity?: number | null
  faceId?: string | null
  imageId?: string | null
  externalImageId?: string | null
  associatedUserId?: string | null
  associatedEmail?: string | null
  associatedName?: string | null
}

function extractDuplicateFaceDetails(data: any): DuplicateFaceDetails {
  if (data?.duplicateFace && typeof data.duplicateFace === 'object') {
    return data.duplicateFace
  }

  return {
    similarity: data?.similarity ?? null,
    faceId: data?.faceId ?? null,
    imageId: data?.imageId ?? null,
    externalImageId: data?.externalImageId ?? null,
    associatedUserId: data?.associatedUserId ?? null,
    associatedEmail: data?.associatedEmail ?? null,
    associatedName: data?.associatedName ?? null,
  }
}

function isStoredImageUpload(value: unknown): value is StoredImageUpload {
  if (typeof value !== 'object' || !value) return false
  const v = value as Record<string, unknown>
  return typeof v.preview === 'string' && typeof v.status === 'string'
}

function getErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message
  if (typeof err !== 'object' || !err) return undefined
  if (!('message' in err)) return undefined
  const msg = (err as { message?: unknown }).message
  return typeof msg === 'string' ? msg : undefined
}

function formatDuplicateFaceMessage(details?: DuplicateFaceDetails | null): string {
  const code = getFaceReferenceCode(details)

  return `User already exists. Reference code: ${code}.`
}

const ProfileCompletionPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTermsAcceptance, setShowTermsAcceptance] = useState(false);
  const { isEnabled: promoCodeEnabled } = usePromoCodeEnabled();
  
  // Form state
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [images, setImages] = useState<ImageUpload[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceImageData, setFaceImageData] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isFinalizingTerms, setIsFinalizingTerms] = useState(false);

  // Restore face verification from localStorage on mount
  useEffect(() => {
    const savedFace = localStorage.getItem('pending_face_verification_profile');
    if (savedFace) {
      setFaceImageData(savedFace);
      setFaceVerified(true);
    }
  }, []);

  // Check if user already has face descriptor (already verified)
  useEffect(() => {
    const checkExistingFace = async () => {
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('face_descriptor')
          .eq('id', user.id)
          .maybeSingle();
        
        if (profile?.face_descriptor) {
          setFaceVerified(true);
        }
      }
    };
    checkExistingFace();
  }, [user]);

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
      localStorage.setItem('pending_face_verification_profile', faceImageBase64);
      setFaceImageData(faceImageBase64);
      setFaceVerified(true);
      setShowFaceVerification(false);
      
      toast({
        title: "Face Verified! ✓",
        description: "Your face will be saved when you complete your profile.",
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

  // iOS detection for other potential optimizations
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    const getUser = async () => {
      try {
        const waitForSession = async (maxWaitMs = 8000, intervalMs = 200) => {
          const startedAt = Date.now();
          while (Date.now() - startedAt < maxWaitMs) {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) return { session: null, error };
            if (session?.user) return { session, error: null };
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
          }
          return { session: null, error: null };
        };

        const { session, error } = await waitForSession();
        
        if (error) {
          console.error('Error getting session:', error);
          navigate('/');
          return;
        }

        if (!session?.user) {
          // No authenticated user, redirect to home
          navigate('/');
          return;
        }

        setUser(session.user);
        setLoading(false);
      } catch (error) {
        console.error('Error in profile completion page:', error);
        navigate('/');
      }
    };

    getUser();
  }, [navigate]);

  // Restore images from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('profilecompletion_images');
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);

        if (Array.isArray(parsed)) {
          const restored = parsed
            .filter(isStoredImageUpload)
            .map((img) => ({
              file: null,
              preview: img.preview,
              moderationResult: img.moderationResult,
              status: img.status,
              hash: img.hash,
            }))
          setImages(restored)
        }
      } catch (err) {
        console.warn('[ProfileCompletionPage] Failed to restore images from sessionStorage:', err)
      }
    }
  }, []);

  // Save images to sessionStorage whenever they change
  useEffect(() => {
    const serializable = images.map(img => ({
      preview: img.preview,
      moderationResult: img.moderationResult,
      status: img.status,
      hash: img.hash // Save hash for duplicate detection
    }));
    sessionStorage.setItem('profilecompletion_images', JSON.stringify(serializable));
  }, [images]);

  useEffect(() => {
    // Pre-fill form with user data from OAuth and Supabase profile if available
    const prefill = async () => {
      if (user) {
        // Try to get profile from Supabase
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .maybeSingle();
        
        // Extract name from user metadata (supports both Google and Apple OAuth)
        const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
        const firstName = user.user_metadata?.first_name || fullName.split(' ')[0] || '';
        const lastName = user.user_metadata?.last_name || fullName.split(' ').slice(1).join(' ') || '';
        
        setFormData(prev => ({
          ...prev,
          email: user.email || '',
          firstName: profile?.first_name || firstName,
          lastName: profile?.last_name || lastName,
        }));
      }
    };
    prefill();
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
    const updates: Record<string, string> = { [field]: value };
    
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

    // Auto-detect and change language based on country
    const detectedLanguage = getLanguageForCountry(location.country);
    if (detectedLanguage) {
      i18n.changeLanguage(detectedLanguage);
    }

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

    // Helper function to generate file hash for duplicate detection
    const getFileHash = async (file: File): Promise<string> => {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const firstBytes = Array.from(uint8Array.slice(0, 100)).join(',');
      const lastBytes = Array.from(uint8Array.slice(-100)).join(',');
      return `${file.size}-${file.type}-${firstBytes}-${lastBytes}`;
    };

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: t('profileCompletion.invalidFileType'),
          description: t('profileCompletion.notAnImageFile', { filename: file.name }),
          variant: "destructive"
        });
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: t('profileCompletion.fileTooLarge'),
          description: t('profileCompletion.largerThan10MB', { filename: file.name }),
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
          title: t('profileCompletion.duplicateImage'),
          description: t('profileCompletion.imageAlreadyUploaded'),
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
          // User already has face_descriptor from profile - use faceVerified state
          if (faceVerified) {
            // User has verified face but no faceImageData in state
            // The face descriptor is stored in DB, not the image
            // For this case, we'll do a human face detection instead
            const faceDetection = await detectHumanFace(compressedFile);
            if (!faceDetection.hasFace) {
              requiresFaceReview = true;
              moderationResult.details = {
                ...moderationResult.details,
                requiresReview: true,
                faceVerificationFailed: true,
                faceVerificationReason: 'No face detected in uploaded image'
              };
            }
          } else {
            // Face verification not completed - send to review
            requiresFaceReview = true;
            moderationResult.details = {
              ...moderationResult.details,
              requiresReview: true,
              faceVerificationFailed: true,
              faceVerificationReason: 'Face verification not completed'
            };
          }
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

        if (!moderationResult.isApproved) {
          toast({
            title: t('profileCompletion.imageRejected'),
            description: moderationResult.message || t('profileCompletion.violatesGuidelines'),
            variant: "destructive"
          });
        } else if (moderationResult.details?.requiresReview || requiresFaceReview) {
          const reviewReason = moderationResult.details?.faceVerificationReason 
            || (moderationResult.details?.noHumanDetected ? "No human figure detected" : null)
            || t('profileCompletion.willBeReviewed');
          toast({
            title: t('profileCompletion.imageNeedsReview'),
            description: reviewReason,
            variant: "default"
          });
        } else {
          toast({
            title: t('profileCompletion.imageApproved'),
            description: t('profileCompletion.imageLooksGood'),
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
              <div className="text-xs">{t('profileCompletion.moderating')}</div>
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
            {t('profileCompletion.pending')}
          </div>
        );
      case 'rejected':
        return (
          <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center rounded-lg pointer-events-none">
            <div className="text-white text-center">
              <AlertTriangle className="w-6 h-6 mx-auto mb-1" />
              <div className="text-xs">{t('profileCompletion.rejected')}</div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const handleProfileComplete = () => {
    // Show terms acceptance after profile completion
    setShowTermsAcceptance(true);
  };

  const handleTermsAccept = async () => {
    setIsFinalizingTerms(true);
    toast({
      title: "Welcome to DripLove!",
      description: "Your profile has been completed and terms accepted. Welcome to the community!",
    });
    
    // Send welcome push notification
    try {
      const { sendPushNotification } = await import('@/services/pushNotifications');
      await sendPushNotification({
        title: "Welcome to DripLove! 💕",
        body: t('profileCompletion.profileSetup'),
        userId: user.id,
        type: 'system',
        data: { action: 'open_discover' }
      });
    } catch (error) {
      console.error('Failed to send welcome notification:', error);
      // Don't block user flow if notification fails
    }
    
    // Schedule the 20-minute delayed love notification (fire-and-forget)
    try {
      supabase.functions.invoke('send-signup-welcome', {
        body: { userId: user.id, delayMinutes: 20 }
      }).catch(err => console.error('Failed to schedule delayed notification:', err));
    } catch (error) {
      console.error('Failed to invoke signup welcome function:', error);
    }
    
    // ANDROID FIX: Update session storage before navigation
    sessionStorage.setItem('driplove_user_session', 'authenticated');
    sessionStorage.removeItem('driplove_current_view');
    
    // Navigate to home which will load the main app
    navigate('/');
    
    // ANDROID FIX: Force reload after navigation to ensure proper app loading
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  if (isFinalizingTerms) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex flex-col items-center justify-center gap-4">
        <HoppingLogo size={72} />
        <p className="text-white text-sm font-medium tracking-wide">Loading your DripLove experience...</p>
      </div>
    );
  }

  const handleCancel = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Profile completion cancelled",
      description: "You have been signed out.",
    });
    navigate('/');
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
    // Country is now optional per Apple's guidelines
    if (!formData.city) validationErrors.city = 'City is required';
    if (!formData.gender) validationErrors.gender = 'Gender is required';
    if (!formData.preference) validationErrors.preference = 'Preference is required';
    if (!formData.relationshipIntent) validationErrors.relationshipIntent = 'Relationship intent is required';
    if (!formData.occupation) validationErrors.occupation = t('profileCompletion.errors.occupationRequired');
    if (!formData.industry) validationErrors.industry = t('profileCompletion.errors.industryRequired');
    if (!formData.educationLevel) validationErrors.educationLevel = t('profileCompletion.errors.educationRequired');
    if (!formData.adinkraSymbols || formData.adinkraSymbols.length === 0) validationErrors.adinkraSymbols = 'Please select at least 1 cultural sign';

    // Face verification is required (unless user already has one in DB)
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('face_descriptor')
      .eq('id', user.id)
      .maybeSingle();
    
    if (!faceVerified && !existingProfile?.face_descriptor) {
      validationErrors.faceVerification = 'Face verification is required to continue';
      toast({
        title: "Face Verification Required",
        description: "Please verify your face to complete your profile.",
        variant: "destructive",
      });
    }

    // Validate images
    const approvedImages = images.filter(img => img.status === 'approved' || img.status === 'pending');
    
    if (approvedImages.length < 2) {
      validationErrors.images = t('profileCompletion.errors.needTwoApprovedPhotos');
    }

    const rejectedImages = images.filter(img => img.status === 'rejected');
    if (rejectedImages.length > 0) {
      validationErrors.images = 'Please remove rejected images before continuing';
    }

    // Check if we have valid files for approved images
    const imagesWithFiles = approvedImages.filter(img => img.file !== null);
    if (imagesWithFiles.length < 2) {
      validationErrors.images = t('profileCompletion.errors.reuploadPhotos');
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
      setIsSubmitting(false);
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
        max_distance: formData.maxDistance || 250,
        country_code: formData.countryCode || '',
        adinkra_symbols: formData.adinkraSymbols || [],
        preferred_language: getLanguageForCountry(formData.country) || i18n.language || 'en'
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

      // Save referral if promo code was used
      if (formData.promoCodeId) {
        try {
          const { error: refError } = await supabase
            .from('referrals')
            .insert({
              user_id: user.id,
              promo_code_id: formData.promoCodeId
            });
          if (!refError) {
            // Best-effort - the referral row is what actually matters, so a
            // failed notification email never blocks profile completion.
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (!session?.access_token) return;
              supabase.functions.invoke('notify-promo-admin', {
                body: {
                  promoCodeId: formData.promoCodeId,
                  newUserName: `${formData.firstName} ${formData.lastName}`.trim(),
                  newUserEmail: formData.email,
                },
                headers: { Authorization: `Bearer ${session.access_token}` },
              }).catch((notifyErr) => console.error('Error notifying admin of promo code use:', notifyErr));
            });
          }
        } catch (refErr) {
          console.error('Error saving referral:', refErr);
          // Don't block profile completion if referral save fails
        }
      }

      // Upload approved images to storage and DB for the existing user
      const approvedImages = images.filter(
        (img) => (img.status === 'approved' || img.status === 'pending') && img.file !== null
      );

      const extractStoragePathFromPublicUrl = (url: string) => {
        try {
          const parsed = new URL(url);
          const marker = '/storage/v1/object/public/user-photos/';
          const markerIndex = parsed.pathname.indexOf(marker);
          if (markerIndex === -1) return null;
          return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
        } catch {
          return null;
        }
      };

      // Replace existing image records to avoid unique(user_id, image_order) conflicts on retries.
      const { data: existingUserImages, error: existingUserImagesError } = await supabase
        .from('user_images')
        .select('image_url')
        .eq('user_id', user.id);

      if (existingUserImagesError) {
        throw existingUserImagesError;
      }

      if ((existingUserImages?.length || 0) > 0) {
        const { error: deleteExistingImagesError } = await supabase
          .from('user_images')
          .delete()
          .eq('user_id', user.id);

        if (deleteExistingImagesError) {
          throw deleteExistingImagesError;
        }

        // Best-effort storage cleanup for replaced photos.
        const oldStoragePaths = (existingUserImages || [])
          .map((img) => extractStoragePathFromPublicUrl(img.image_url))
          .filter((path): path is string => Boolean(path));

        if (oldStoragePaths.length > 0) {
          const { error: removeOldStorageError } = await supabase.storage
            .from('user-photos')
            .remove(oldStoragePaths);

          if (removeOldStorageError) {
            console.warn('Old image cleanup warning:', removeOldStorageError);
          }
        }
      }

      const uploadFailures: string[] = [];
      let successfulUploads = 0;

      for (let index = 0; index < approvedImages.length; index++) {
        const image = approvedImages[index];
        try {
          if (!image.file) continue;
          const mimeToExt: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif'
          };
          const fileExt = mimeToExt[image.file.type] || 'jpg';
          const uniqueSuffix =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
          const fileName = `${uniqueSuffix}.${fileExt}`;
          const filePath = `${user.id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('user-photos')
            .upload(filePath, image.file, {
              contentType: image.file.type,
              cacheControl: '3600',
              upsert: false
            });
          if (uploadError) throw uploadError;

          const {
            data: { publicUrl }
          } = supabase.storage.from('user-photos').getPublicUrl(filePath);

          const { error: dbError } = await supabase
            .from('user_images')
            .upsert(
              {
                user_id: user.id,
                image_url: publicUrl,
                image_order: index + 1,
                is_approved: image.status === 'approved',
                moderation_status: image.status === 'approved' ? 'approved' : 'pending',
                flagged_content: image.moderationResult?.flags || [],
                confidence_score: image.moderationResult?.confidence || 0
              },
              { onConflict: 'user_id,image_order' }
            );

          if (dbError) throw dbError;
          successfulUploads++;
        } catch (uploadErr) {
          const errorMessage = uploadErr instanceof Error ? uploadErr.message : 'Unknown upload error';
          console.error('Error uploading image:', uploadErr);
          uploadFailures.push(errorMessage);
        }
      }

      if (successfulUploads < 2) {
        throw new Error('Image upload failed: less than 2 images were saved successfully.');
      }

      if (uploadFailures.length > 0) {
        toast({
          title: 'Image upload warning',
          description: 'Some images failed, but required photos were saved. You can re-upload any missing ones later.',
          variant: 'default'
        });
      }

      // Index face in AWS Rekognition with user's name (only now, after profile is saved)
      const pendingFace = localStorage.getItem('pending_face_verification_profile');
      if (pendingFace && user.id) {
        try {
          const userName = `${formData.firstName} ${formData.lastName}`;
          const { data: faceData, error: faceError } = await supabase.functions.invoke("face-verify", {
            body: {
              action: "index_face",
              front: pendingFace,
              userId: user.id,
              userName: userName, // Include user's name for admin identification
            },
          });

          if (faceError) {
            console.error('Face indexing error:', faceError);
          }
          // The face-verify edge function persists profiles.face_descriptor itself
          // (server-side, service role, after confirming caller identity) - the
          // client no longer writes verification status directly.

          // Clear localStorage after successful indexing
          localStorage.removeItem('pending_face_verification_profile');
        } catch (faceErr) {
          console.error('Face indexing exception:', faceErr);
        }
      }

      // Profile completed - navigate to terms
      handleProfileComplete();
    } catch (error: unknown) {
      console.error('Profile completion error:', error);
      toast({
        title: "Error",
        description: getErrorMessage(error) || undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
        <HoppingLogo size={64} />
      </div>
    );
  }

  // Show terms acceptance after profile completion
  if (showTermsAcceptance) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <HoppingLogo size={64} />
          </div>
        }
      >
        <TermsAcceptance
          user={user}
          onAccept={handleTermsAccept}
        />
      </Suspense>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
        <HoppingLogo size={64} />
      </div>
    );
  }

  return (
    <div className="keyboard-safe-form input-scroll-container h-[100dvh] overflow-hidden">
      <div 
        className="h-full bg-gradient-to-br from-purple-500 to-pink-500 relative overflow-hidden"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)"
        }}
      >
      {/* Scrollable form container */}
      <div 
        className="h-full px-2 sm:px-4 pb-[calc(env(safe-area-inset-bottom,0px)+28px)] pt-4 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y relative z-10"
        style={{
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div className="w-full max-w-full sm:max-w-2xl mx-auto">
          <Card className="w-full backdrop-blur-sm bg-white/40 rounded-none shadow-none border border-white/40 relative animate-fade-in">
            <CardContent className="px-4 sm:px-6 py-5 sm:py-6 pb-6 sm:pb-8">
              {/* Title inside white card */}
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-5 sm:mb-6 text-center">
                {t('profileCompletion.title')}
              </h1>
              
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">{t('profileCompletion.basicInformation')}</h3>
                    
                    <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">{t('profileCompletion.firstName')} *</label>
                        <input
                          name="firstName"
                          type="text"
                          value={formData.firstName}
                          onChange={handleInputChange}
                          className="w-full px-2.5 py-2 border border-gray-200 rounded-md focus:border-pink-400 focus:ring-pink-400"
                          placeholder={t('profileCompletion.enterYourFirstName')}
                          required
                        />
                        {errors.firstName && <p className="text-sm text-red-500">{errors.firstName}</p>}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">{t('profileCompletion.lastName')} *</label>
                        <input
                          name="lastName"
                          type="text"
                          value={formData.lastName}
                          onChange={handleInputChange}
                          className="w-full px-2.5 py-2 border border-gray-200 rounded-md focus:border-pink-400 focus:ring-pink-400"
                          placeholder={t('profileCompletion.enterYourLastName')}
                          required
                        />
                        {errors.lastName && <p className="text-sm text-red-500">{errors.lastName}</p>}
                      </div>
                    </div>

                    {/* Face Verification Section - Right after name fields */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-purple-600" />
                        <label className="text-sm font-medium text-gray-700">Face Verification *</label>
                      </div>

                      {showFaceVerification ? (
                        <div className="space-y-3 bg-black border border-white/10 rounded-lg p-3">
                          <FaceVerification onVerified={handleFaceVerified} disabled={isVerifying} />
                        </div>
                      ) : faceVerified ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            <p className="font-medium text-green-800 text-sm">Verified</p>
                          </div>
                        </div>
                      ) : (
                        <div className={`bg-purple-50 border rounded-lg p-3 ${errors.faceVerification ? 'border-red-300' : 'border-purple-200'}`}>
                          <div className="flex flex-col min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between gap-2">
                            <p className="text-sm text-purple-800 leading-tight">Verify your face to continue</p>
                            <Button
                              type="button"
                              onClick={() => setShowFaceVerification(true)}
                              className="h-6 px-2 self-start min-[390px]:self-auto shrink-0 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-[10px]"
                              size="sm"
                              disabled={isVerifying}
                            >
                              <Camera className="w-2.5 h-2.5 mr-1" />
                              Verify now
                            </Button>
                          </div>
                          {errors.faceVerification && <p className="text-red-500 text-xs mt-2">{errors.faceVerification}</p>}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">{t('profileCompletion.dateOfBirth')} *</label>
                      <input
                        name="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={handleInputChange}
                        className="compact-date-input w-full px-2.5 pr-7 py-2 text-sm border border-gray-200 rounded-md focus:border-pink-400 focus:ring-pink-400"
                        required
                      />
                      {errors.dateOfBirth && <p className="text-sm text-red-500">{errors.dateOfBirth}</p>}
                    </div>

                    <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Gender *</label>
                        <Select
                          value={formData.gender}
                          onValueChange={(value) => handleSelectChange('gender', value)}
                        >
                          <SelectTrigger className="pl-2.5 pr-2.5 border-gray-200 focus:border-pink-400">
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
                          <SelectTrigger className="pl-2.5 pr-2.5 border-gray-200 focus:border-pink-400">
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
                          <SelectTrigger className="pl-2.5 pr-2.5 border-gray-200 focus:border-pink-400">
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

                  <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">{t('profileCompletion.occupation')} *</label>
                      <Select
                        value={formData.occupation}
                        onValueChange={(value) => handleSelectChange('occupation', value)}
                      >
                          <SelectTrigger className="pl-2.5 pr-2.5 border-gray-200 focus:border-pink-400">
                          <SelectValue placeholder="Select" />
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
                      <label className="text-sm font-medium text-gray-700">{t('profileCompletion.industry')} *</label>
                      <Select
                        value={formData.industry}
                        onValueChange={(value) => handleSelectChange('industry', value)}
                      >
                        <SelectTrigger className="pl-2.5 pr-2.5 border-gray-200 focus:border-pink-400">
                          <SelectValue placeholder="Select" />
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
                    <label className="text-sm font-medium text-gray-700">{t('profileCompletion.education')} *</label>
                    <Select
                      value={formData.educationLevel}
                      onValueChange={(value) => handleSelectChange('educationLevel', value)}
                    >
                      <SelectTrigger className="border-gray-200 focus:border-pink-400">
                        <SelectValue placeholder="Select" />
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
                    <h3 className="text-lg font-semibold text-gray-800">Location</h3>
                    <LocationInput
                      country={formData.country}
                      city={formData.city}
                      zipCode={formData.zipCode}
                      onLocationChange={handleLocationChange}
                      errors={errors}
                      required={false}
                      autoDetect={true}
                    />
                  </div>

                  {/* Adinkra Symbols Selector */}
                  <div className="space-y-4 mt-6">
                    <AdinkraSymbolSelector
                      selectedSymbols={formData.adinkraSymbols}
                      onChange={(symbols) => setFormData({ ...formData, adinkraSymbols: symbols })}
                      userCountry={formData.country}
                    />
                    {errors.adinkraSymbols && <p className="text-sm text-red-500">{errors.adinkraSymbols}</p>}
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-800">{t('profileCompletion.profilePhotos')} *</h3>
                      <p className="text-[11px] text-gray-600 whitespace-nowrap">2+ photos required</p>
                    </div>
                    
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-pink-400 transition-colors">
                      <Input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                        className="hidden"
                        id="image-upload"
                      />
                      <Label htmlFor="image-upload" className="cursor-pointer block">
                        <Upload className="mx-auto h-5 w-5 text-gray-400 mb-1" />
                        <p className="text-xs text-gray-600">Upload photos</p>
                        <p className="text-[11px] text-gray-500">JPG/PNG up to 10MB</p>
                      </Label>
                    </div>
                    <p className="text-[11px] text-gray-500 text-center flex items-center justify-center gap-1">
                      <Shield className="w-3 h-3" />
                      Reviewed within 24h.
                    </p>

                    {images.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {images.map((image, index) => (
                          <div key={index} className="relative">
                            <img
                              src={image.preview}
                              alt={`Upload ${index + 1}`}
                              className="w-full h-28 object-cover rounded-lg"
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

                  {promoCodeEnabled && (
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
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full h-8 text-xs px-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>{t('profileCompletion.completingProfile')}</span>
                          </div>
                        ) : t('profileCompletion.completeProfile')}
                      </Button>
                      
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancel}
                        disabled={isSubmitting}
                        className="w-full h-8 text-xs px-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-medium rounded-lg transition-all duration-200"
                      >
                        {t('profileCompletion.cancel')}
                      </Button>
                    </div>
                </form>
              </CardContent>
            </Card>
        </div>
      </div>
      </div>
    </div>
  );
};

export default ProfileCompletionPage;