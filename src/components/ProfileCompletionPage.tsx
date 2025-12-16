import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Heart, ArrowLeft, Upload, Shield, CheckCircle, AlertTriangle, Camera } from 'lucide-react';
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
import TermsAcceptance from './TermsAcceptance';
import { getLanguageForCountry } from '@/i18n/config';
import { videoPreloader } from '@/utils/videoPreloader';
import FaceVerification from '@/components/FaceVerification';

interface ImageUpload {
  file: File;
  preview: string;
  moderationResult?: ModerationResult;
  status: 'uploading' | 'moderating' | 'approved' | 'pending' | 'rejected';
  hash?: string; // Store hash for duplicate detection
}

const ProfileCompletionPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showTermsAcceptance, setShowTermsAcceptance] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [images, setImages] = useState<ImageUpload[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceImageData, setFaceImageData] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

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
          .single();
        
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
        toast({
          title: data?.code === 'DUPLICATE_FACE' ? "Face Already Registered" : "Verification Failed",
          description: data?.error || "Could not verify your face. Please try again.",
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
        const { data: { session }, error } = await supabase.auth.getSession();
        
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
        const parsed = JSON.parse(saved);
        setImages(parsed.map((img: any) => ({
          file: null,
          preview: img.preview,
          moderationResult: img.moderationResult,
          status: img.status,
          hash: img.hash // Restore hash for duplicate detection
        })));
      } catch {}
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
          .single();
        
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
            title: t('profileCompletion.imageRejected'),
            description: moderationResult.message || t('profileCompletion.violatesGuidelines'),
            variant: "destructive"
          });
        } else if (moderationResult.details?.requiresReview) {
          toast({
            title: t('profileCompletion.imageNeedsReview'),
            description: t('profileCompletion.willBeReviewed'),
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
    
    navigate('/');
  };

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
      .single();
    
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
          await supabase
            .from('referrals')
            .insert({
              user_id: user.id,
              promo_code_id: formData.promoCodeId
            });
        } catch (refErr) {
          console.error('Error saving referral:', refErr);
          // Don't block profile completion if referral save fails
        }
      }

      // Upload approved images to storage and DB for the existing user
      const approvedImages = images.filter(img => img.status === 'approved' || img.status === 'pending');
      let imageOrder = 1;
      for (const image of approvedImages) {
        try {
          if (!image.file) continue;
          const mimeToExt: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif'
          };
          const fileExt = mimeToExt[image.file.type] || 'jpg';
          const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
          const filePath = `${user.id}/${fileName}`;
          const { error: uploadError } = await supabase.storage
            .from('user-photos')
            .upload(filePath, image.file, {
              contentType: image.file.type,
              cacheControl: '3600'
            });
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
          } else if (faceData?.success) {
            // Update profile with face descriptor
            await supabase
              .from('profiles')
              .update({ 
                face_descriptor: faceData.faceId || 'verified',
                updated_at: new Date().toISOString()
              })
              .eq('id', user.id);
            
            console.log('✅ Face indexed successfully for user:', userName);
          }
          
          // Clear localStorage after successful indexing
          localStorage.removeItem('pending_face_verification_profile');
        } catch (faceErr) {
          console.error('Face indexing exception:', faceErr);
        }
      }

      toast({
        title: t('profileCompletion.profileCompleted'),
        description: t('profileCompletion.profileCompletedSuccess'),
      });

      handleProfileComplete();
    } catch (error: any) {
      console.error('Profile completion error:', error);
      toast({
        title: t('profileCompletion.profileCompletionError'),
        description: error.message || t('profileCompletion.failedToComplete'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex flex-col items-center justify-center">
        <img src="/driplove-logo.png" alt="DripLove Logo" className="w-32 h-32 mb-8 animate-bounce" />
        <p className="text-white text-lg font-semibold tracking-wide">{t('profileCompletion.loadingDripLove')}</p>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  // Show terms acceptance after profile completion
  if (showTermsAcceptance) {
    return (
      <TermsAcceptance
        user={user}
        onAccept={handleTermsAccept}
      />
    );
  }

  return (
    <div className="keyboard-safe-form input-scroll-container">
      <div 
        className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 relative"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)"
        }}
      >
      {/* Video Background - always rendered, loads async */}
      <div className="absolute inset-0 overflow-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          webkit-playsinline="true"
          x5-playsinline="true"
          preload="auto"
          src={videoPreloader.getVideoUrl()}
          className="absolute top-0 left-0 w-full h-full object-cover opacity-25"
          onTimeUpdate={(e) => {
            const video = e.currentTarget;
            if (video.duration && video.currentTime >= video.duration - 0.1) {
              video.currentTime = 0;
            }
          }}
          onEnded={(e) => {
            e.currentTarget.currentTime = 0;
            e.currentTarget.play().catch(() => {});
          }}
          onLoadedData={(e) => {
            e.currentTarget.playbackRate = 1.2;
            e.currentTarget.play().catch(() => {});
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-pink-500/10 via-pink-500/20 to-pink-500/30"></div>
      </div>
      
      {/* Header - stays visible */}
      <div className="text-center py-4 px-4 relative z-10">
        <h1 className="text-3xl font-bold text-white mb-2">
          {t('profileCompletion.title')}
        </h1>
      </div>

      {/* Scrollable form container */}
      <div 
        className="px-4 pb-4 overflow-y-auto relative z-10"
        style={{
          maxHeight: "calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 120px)"
        }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="bg-white/25 rounded-2xl shadow-2xl backdrop-blur-lg border border-white/30 overflow-hidden">
            <Card className="w-full backdrop-blur-sm bg-white/25 shadow-2xl border-0 relative">
              <CardContent className="p-6 pb-8">
                <div className="flex items-center justify-between mb-6">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    className="flex items-center text-gray-600 hover:text-gray-800"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    {t('profileCompletion.back')}
                  </Button>
                  <div className="w-16"></div> {/* Spacer for alignment */}
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-4">
                    {/* Promo Code Section - At the top */}
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

                    <h3 className="text-lg font-semibold text-gray-800">{t('profileCompletion.basicInformation')}</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">{t('profileCompletion.firstName')} *</label>
                        <input
                          name="firstName"
                          type="text"
                          value={formData.firstName}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-pink-400 focus:ring-pink-400"
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
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-pink-400 focus:ring-pink-400"
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
                        <label className="text-sm font-medium text-gray-700">{t('profileCompletion.faceVerification')} *</label>
                      </div>

                      {showFaceVerification ? (
                        <div className="space-y-3 bg-gray-50 rounded-lg p-4">
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
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-purple-800">Verify your face to continue</p>
                            <Button
                              type="button"
                              onClick={() => setShowFaceVerification(true)}
                              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-xs"
                              size="sm"
                              disabled={isVerifying}
                            >
                              <Camera className="w-3 h-3 mr-1" />
                              Verify
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">{t('profileCompletion.occupation')} *</label>
                      <Select
                        value={formData.occupation}
                        onValueChange={(value) => handleSelectChange('occupation', value)}
                      >
                        <SelectTrigger className="border-gray-200 focus:border-pink-400">
                          <SelectValue placeholder={t('profileCompletion.selectOccupation')} />
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
                        <SelectTrigger className="border-gray-200 focus:border-pink-400">
                          <SelectValue placeholder={t('profileCompletion.selectIndustry')} />
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
                        <SelectValue placeholder={t('profileCompletion.selectEducation')} />
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
                    <p className="text-sm text-gray-600">City is required. Country is optional but helps improve matches.</p>
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

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">{t('profileCompletion.profilePhotos')} *</h3>
                    <p className="text-sm text-gray-600">{t('profileCompletion.uploadAtLeastTwoPhotos')}</p>
                    
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
                        <p className="text-sm text-gray-600">{t('profileCompletion.clickToUploadImages')}</p>
                        <p className="text-xs text-gray-500">{t('profileCompletion.jpgPngUpTo10MB')}</p>
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

                  {/* Note: Face verification is now shown under name fields above */}

                  <div className="flex flex-col gap-3">
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? t('profileCompletion.completingProfile') : t('profileCompletion.completeProfile')}
                      </Button>
                      
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancel}
                        disabled={isSubmitting}
                        className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 rounded-lg transition-all duration-200"
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
    </div>
  );
};

export default ProfileCompletionPage;
