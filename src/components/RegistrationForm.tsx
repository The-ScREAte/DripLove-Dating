
import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeImageModeration } from '@/utils/invokeImageModeration';
import { withRetry } from '@/utils/withRetry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Shield, CheckCircle, AlertTriangle, Pencil, Clock, X } from 'lucide-react';
import HoppingLogo from '@/components/HoppingLogo';
import OnboardingTransition from '@/components/forms/OnboardingTransition';
const PhotoCropModal = React.lazy(() => import('@/components/profile/PhotoCropModal'));
import BasicInfoSection from '@/components/forms/BasicInfoSection';
import LocationInput from '@/components/forms/LocationInput';
import AdinkraSymbolSelector from '@/components/forms/AdinkraSymbolSelector';
import PromoCodeInput from '@/components/forms/PromoCodeInput';
import {
  FORM_PAGE_BG,
  formSection,
  formSectionTitle,
  formLabel,
  formRequired,
  formError,
  formSelectTrigger,
  formSelectContent,
  formPrimaryButton,
  formSecondaryButton,
} from '@/components/forms/formTheme';
import { validateRegistrationForm, transformFormDataForSubmission, getDateOfBirthError } from '@/utils/formValidation';
import { initialFormData } from '@/constants/formData';
import { occupationOptions, industryOptions } from '@/constants/professionOptions';
import { compressImage } from '@/utils/imageCompression';
import { useToast } from '@/hooks/use-toast';
import { fileToBase64 } from '@/utils/faceVerificationUtils';
import { useTranslation } from 'react-i18next';
import FaceVerification from '@/components/FaceVerification';
import { usePromoCodeEnabled } from '@/hooks/usePromoCodeEnabled';
import { getFaceReferenceCode } from '@/utils/faceReference';
import { isSupportedImageFile, getPhotoAcceptAttribute, MAX_SOURCE_PHOTO_BYTES } from '@/utils/imageNormalizer';
import { Capacitor } from '@capacitor/core';
import { getCapitalCoordinates } from '@/utils/countryCapitals';
import { uploadPhotoThumbnail, withThumbnailPaths } from '@/utils/photoThumbnails';

interface RegistrationFormProps {
  onSubmit: (data: any) => void;
  onBackToLogin: () => void;
  /** Called with true the moment the account is created (signUp succeeds),
   *  and false right before onSubmit fires. Lets the parent's global
   *  auth-state routing defer to this form instead of racing it away from
   *  the screen while profile data / photos are still being saved. */
  onRegistrationInProgressChange?: (inProgress: boolean) => void;
}

interface ImageUpload {
  file: File | null;
  preview: string;
  status: 'uploading' | 'moderating' | 'approved' | 'pending' | 'rejected';
  hash?: string; // Store hash for duplicate detection
  // Set once this photo has already been uploaded + moderated (checked live,
  // right after picking) - final submit uses these to skip re-uploading and
  // re-running moderation, and just fixes up image_order.
  imageId?: string;
  filePath?: string;
  moderationMessage?: string;
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

const RegistrationForm = ({ onSubmit, onBackToLogin, onRegistrationInProgressChange }: RegistrationFormProps) => {
  const [formData, setFormData] = useState(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(1);
  const [images, setImages] = useState<ImageUpload[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once the account is actually created (on final submit, after photos
  // on step 2 have already passed their checks) - lets the photo picker
  // upload + moderate each photo live once it's set, the same way profile
  // completion does, since that requires a real signed-in user to own the
  // photo row. Photos can still be picked before this is set (e.g. picked
  // before an earlier submit attempt), in which case they fall back to
  // 'pending' and get uploaded for real during the final submit's own loop.
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  // Photos are saved and we're handing over to the terms screen - keeps the
  // "creating your account" screen up through that last step so the form
  // never flashes back in between.
  const [isFinishing, setIsFinishing] = useState(false);
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
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
      setFaceVerified(true);
    }
  }, []);

  // Resume mid-registration after a reload: the account is only created on
  // final submit now, but a partially-completed signUp (e.g. the request
  // succeeded but the app closed before finishing) still leaves a session
  // behind - supabase-js persists that in its own localStorage automatically,
  // so if one exists here, this browser already has an account from an
  // unfinished registration. Jump straight back to step 2 (which now
  // includes photos) rather than re-showing step 1, which would try to sign
  // up the same email again.
  React.useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user?.id) return;
      setAccountUserId(session.user.id);
      setCurrentStep(2);

      const { data: existingRows } = await supabase
        .from('user_images')
        .select('id, image_url, image_order, is_approved, moderation_status')
        .eq('user_id', session.user.id)
        .order('image_order', { ascending: true });

      if (existingRows && existingRows.length > 0) {
        const extractStoragePath = (url: string): string | undefined => {
          try {
            const marker = '/storage/v1/object/public/user-photos/';
            const idx = new URL(url).pathname.indexOf(marker);
            return idx === -1 ? undefined : decodeURIComponent(new URL(url).pathname.slice(idx + marker.length));
          } catch {
            return undefined;
          }
        };

        setImages(existingRows.map((row): ImageUpload => ({
          file: null,
          preview: row.image_url,
          status: row.moderation_status === 'rejected' ? 'rejected' : (row.is_approved ? 'approved' : 'pending'),
          imageId: row.id,
          filePath: extractStoragePath(row.image_url),
        })));
      }
    });
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
      setFaceVerified(true);
      setShowFaceVerification(false);
      
      toast({
        title: (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-green-500" /> Face Verified
          </span>
        ),
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

  // Photos are now uploaded live as they're picked on step 2 (see uploadAndModerateImage),
  // so by the time any exist they're already real user_images rows, not
  // just local state - restoring them from localStorage's blob preview URLs
  // never actually worked across a reload anyway (those URLs die with the
  // page that created them). The session-resume effect above rebuilds
  // `images` straight from the database instead, which is what actually
  // survives a reload.

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Date of birth is checked the moment it's picked, so an under-18 date
    // is flagged right away instead of only after tapping Continue.
    if (e.target.name === 'dateOfBirth') {
      const dobError = getDateOfBirthError(e.target.value);
      setErrors(prev => ({ ...prev, dateOfBirth: dobError }));
      return;
    }
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

  // Checks a photo for real (AWS Rekognition) right away, the moment it's
  // picked, instead of deferring to final submit - so the user finds out
  // immediately if a photo needs replacing. Requires an actual DB row to
  // attach the result to, which requires the account to already exist -
  // accountUserId is only set once final submit has created it, so a photo
  // picked before that just falls back to 'pending' below. Shared by both
  // the initial picker and re-cropping an existing photo.
  const uploadAndModerateImage = (file: File, preview: string, order: number) => {
    if (!accountUserId) {
      setImages(prev => prev.map(img => img.preview === preview ? { ...img, status: 'pending' } : img));
      return;
    }

    (async () => {
      try {
        const mimeToExt: Record<string, string> = {
          'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'
        };
        const fileExt = mimeToExt[file.type] || 'jpg';
        const uniqueSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const filePath = `${accountUserId}/${uniqueSuffix}.${fileExt}`;

        await withRetry(async () => {
          const { error: uploadError } = await supabase.storage
            .from('user-photos')
            .upload(filePath, file, { contentType: file.type, cacheControl: '3600', upsert: false });
          if (uploadError) throw uploadError;
        });
        // Small copy for grids/cards (best-effort, doesn't block).
        void uploadPhotoThumbnail(filePath, file);

        const { data: { publicUrl } } = supabase.storage.from('user-photos').getPublicUrl(filePath);

        const insertedRow = await withRetry(async () => {
          const { data, error: dbError } = await supabase
            .from('user_images')
            .insert({ user_id: accountUserId, image_url: publicUrl, image_order: order })
            .select('id')
            .single();
          if (!dbError) return data;
          // A prior attempt's insert may have actually succeeded server-side
          // even though the response never made it back (network blip) -
          // the unique(user_id, image_order) constraint means a retry then
          // sees a conflict rather than a clean insert. Treat that as
          // success (fetch the row that's already there) instead of
          // burning through retries on a photo that's already saved.
          if (dbError.code === '23505') {
            const { data: existing, error: fetchError } = await supabase
              .from('user_images')
              .select('id')
              .eq('user_id', accountUserId)
              .eq('image_order', order)
              .single();
            if (!fetchError && existing) return existing;
          }
          throw dbError;
        });

        const imageBase64 = await fileToBase64(file);
        const modDecision = await invokeImageModeration(insertedRow.id, imageBase64);

        setImages(prev => prev.map(img => img.preview === preview
          ? {
              ...img,
              status: modDecision.status === 'rejected' ? 'rejected' : 'approved',
              imageId: insertedRow.id,
              filePath,
              moderationMessage: modDecision.message,
            }
          : img
        ));

        if (modDecision.status === 'rejected') {
          toast({
            title: 'Photo needs replacing',
            description: modDecision.message || 'This photo violates our content guidelines - please choose another.',
            variant: 'destructive',
          });
        }
      } catch (err) {
        console.error('Live moderation failed for a photo:', err);
        // Fall back to the old deferred behavior - final submit will upload
        // + moderate this one for real since it has no imageId.
        setImages(prev => prev.map(img => img.preview === preview ? { ...img, status: 'pending' } : img));
      }
    })();
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

    // Both of these are mutated synchronously as the loop processes each
    // file, since `images` (component state) is a snapshot from when this
    // handler started - it never reflects the setImages() calls made later
    // in this same loop (those are only scheduled, not applied
    // synchronously). Without a local running count, every file picked in
    // ONE file-dialog selection got the exact same `images.length + 1`
    // order, and the second photo's insert failed a unique(user_id,
    // image_order) constraint outright.
    const seenHashesThisBatch = new Set(images.map((img) => img.hash).filter(Boolean));
    let orderCounter = images.length;

    for (const file of files) {
      if (!isSupportedImageFile(file)) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not an image file.`,
          variant: "destructive"
        });
        continue;
      }

      if (file.size > MAX_SOURCE_PHOTO_BYTES) {
        toast({
          title: "File too large",
          description: `${file.name} is larger than 80MB.`,
          variant: "destructive"
        });
        continue;
      }

      // Compress (typically to JPEG) to keep uploads small and consistent.
      // RAW/HEIC photos are converted to JPEG here first.
      let compressedFile: File;
      try {
        compressedFile = await compressImage(file);
      } catch (error) {
        console.error('Could not read photo:', error);
        toast({
          title: "Couldn't read this photo",
          description: `${file.name} couldn't be opened. Try exporting it as a JPG and uploading that.`,
          variant: "destructive"
        });
        continue;
      }

      // Generate hash AFTER compression for accurate duplicate detection
      const fileHash = await getFileHash(compressedFile);

      if (seenHashesThisBatch.has(fileHash)) {
        toast({
          title: "Duplicate image",
          description: "This image has already been uploaded.",
          variant: "destructive"
        });
        continue;
      }
      seenHashesThisBatch.add(fileHash);

      const preview = URL.createObjectURL(compressedFile);
      const newImage: ImageUpload = {
        file: compressedFile,
        preview,
        status: 'moderating',
        hash: fileHash
      };

      setImages(prev => [...prev, newImage]);
      orderCounter++;
      uploadAndModerateImage(compressedFile, preview, orderCounter);
    }

    event.target.value = '';
  };

  const removeImage = (preview: string) => {
    const removed = images.find(img => img.preview === preview);
    setImages(prev => {
      const updated = prev.filter(img => img.preview !== preview);
      URL.revokeObjectURL(preview);
      return updated;
    });

    if (removed?.imageId) {
      supabase.from('user_images').delete().eq('id', removed.imageId)
        .then(({ error }) => { if (error) console.error('Failed to remove photo row:', error); });
    }
    if (removed?.filePath) {
      supabase.storage.from('user-photos').remove(withThumbnailPaths([removed.filePath]))
        .then(({ error }) => { if (error) console.error('Failed to remove photo file:', error); });
    }
  };

  const [croppingImage, setCroppingImage] = useState<{ preview: string } | null>(null);

  const handleCroppedImage = ({ blob, previewUrl, originalUrl }: { blob: Blob; previewUrl: string; originalUrl: string }) => {
    const original = images.find(img => img.preview === originalUrl);
    const croppedFile = new File([blob], original?.file?.name || 'cropped.jpg', { type: 'image/jpeg' });
    const order = images.findIndex(img => img.preview === originalUrl) + 1;

    setImages(prev => prev.map(img => {
      if (img.preview !== originalUrl) return img;
      URL.revokeObjectURL(img.preview);
      return {
        ...img,
        file: croppedFile,
        preview: previewUrl,
        status: 'moderating',
        imageId: undefined,
        filePath: undefined,
        moderationMessage: undefined,
      };
    }));
    setCroppingImage(null);

    if (original?.imageId) {
      supabase.from('user_images').delete().eq('id', original.imageId)
        .then(({ error }) => { if (error) console.error('Failed to remove pre-crop photo row:', error); });
    }
    if (original?.filePath) {
      supabase.storage.from('user-photos').remove(withThumbnailPaths([original.filePath]))
        .then(({ error }) => { if (error) console.error('Failed to remove pre-crop photo file:', error); });
    }
    uploadAndModerateImage(croppedFile, previewUrl, order > 0 ? order : images.length + 1);
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
          <div className="absolute top-2 left-2 bg-orange-500 text-white p-1 rounded-full">
            <Clock className="w-4 h-4" />
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
      firstStepErrors.confirmPassword = "Passwords don't match";
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
    if (isSubmitting || creatingAccount) return;

    // Close the keyboard before the full-screen progress state appears.
    (document.activeElement as HTMLElement | null)?.blur();

    if (currentStep === 1) {
      handleContinue();
      return;
    }

    // Step 2 (now includes photos on the same page) - validate its fields
    // first, then the photos, before ever creating the account - so a user
    // who hasn't picked 2 photos yet never gets an account created for
    // nothing (the submit button is also disabled for this same reason, but
    // this is the safety net if it's ever reached some other way).
    const validationErrors = validateRegistrationForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (images.some(img => img.status === 'moderating')) {
      toast({
        title: 'Still checking your photos',
        description: 'Give it just a moment - photos are quick to check.',
        variant: 'default',
      });
      return;
    }

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

    // Ready = already uploaded live (imageId) or has a file to fall back to
    // uploading now (live-check failed earlier, e.g. a network blip).
    const readyImages = approvedImages.filter(img => img.imageId || img.file);
    if (readyImages.length < 2) {
      toast({
        title: t('registration.errors.photosNeedReupload'),
        description: t('registration.reuploadTwoPhotos'),
        variant: "destructive"
      });
      setImages(prev => prev.filter(img => img.imageId || img.file));
      return;
    }

    // The account is only created here, on final submit (once photos have
    // already passed the checks above) - guarded so a resumed session
    // (accountUserId already set from the mount effect) never tries to sign
    // up the same email twice.
    let userId: string | null = accountUserId;
    if (!userId) {
      setCreatingAccount(true);

      try {
        // Check if user profile already exists (this is the only check that matters)
        const { data: existingProfile } = await supabase
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
          setCreatingAccount(false);
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
          setCreatingAccount(false);
          return;
        }

        userId = signUpData?.user?.id ?? null;
        if (!userId) {
          toast({ title: 'Registration failed', description: 'Could not create your account. Please try again.', variant: 'destructive' });
          setCreatingAccount(false);
          return;
        }

        // The account now exists - signUp's SIGNED_IN event (and the DB
        // trigger that creates a full `profiles` row in the same
        // transaction) can make the app's global auth-routing redirect away
        // from this screen at any moment from here on, before profile data
        // and photos below are actually saved. Tell the parent to hold off
        // until this submit handler explicitly hands off via onSubmit.
        onRegistrationInProgressChange?.(true);
      } catch (err: any) {
        setCreatingAccount(false);
        toast({
          title: 'Account Creation Error',
          description: err?.message || 'Failed to create account. Please try a different email or sign in if you already have an account.',
          variant: 'destructive',
        });
        return;
      }

      // Save profile data (handle case where profile might already exist from DB trigger)
      // Add a small delay to allow any database triggers to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('id', userId)
          .single();

        // Same fallback Complete Profile uses: a typed city we couldn't
        // geocode used to be saved with no coordinates at all, which left the
        // person with no distance to anyone. The country's capital is at
        // least an approximate location until they set a real one.
        const resolvedCoords = (formData.latitude == null || formData.longitude == null)
          ? getCapitalCoordinates(formData.countryCode)
          : undefined;

        const profileData = {
          id: userId,
          email: formData.email,
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
          latitude: formData.latitude ?? resolvedCoords?.latitude ?? null,
          longitude: formData.longitude ?? resolvedCoords?.longitude ?? null,
          is_custom_city: formData.isCustomCity || false,
          max_distance: formData.maxDistance || 250,
          country_code: formData.countryCode || '',
          adinkra_symbols: formData.adinkraSymbols || []
        };

        if (existingProfile) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update(profileData)
            .eq('id', userId);
          if (profileError) throw profileError;
        } else {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert(profileData);
          if (profileError) {
            if (profileError.code === '23505' || profileError.message.includes('duplicate') || profileError.message.includes('already exists')) {
              const { error: updateError } = await supabase
                .from('profiles')
                .update(profileData)
                .eq('id', userId);
              if (updateError) throw updateError;
            } else {
              throw profileError;
            }
          }
        }

        // Save referral if promo code was used. Supabase queries resolve to
        // { error } rather than throwing, so the error must be read explicitly
        // here - a try/catch around the insert alone silently swallowed every
        // DB-level failure (RLS denial, duplicate referral, etc.) with nothing
        // ever logged.
        if (formData.promoCodeId) {
          try {
            const { error: refError } = await supabase
              .from('referrals')
              .insert({ user_id: userId, promo_code_id: formData.promoCodeId });
            if (refError) {
              console.error('Error saving referral:', refError);
            }
          } catch (refErr) {
            console.error('Error saving referral:', refErr);
          }
        }
      } catch (err: any) {
        setCreatingAccount(false);
        toast({
          title: 'Profile Save Error',
          description: err?.message || 'Failed to save profile.',
          variant: 'destructive',
        });
        return;
      }

      // Index face in AWS Rekognition with user's name (now, after the
      // account exists, but BEFORE moderating the photos below) -
      // moderate-image's face match for each photo searches this
      // Rekognition collection, so the user's own face has to be indexed
      // first or every photo would come back as a false "doesn't match
      // verified identity" (non-blocking either way, but worth getting right).
      const pendingFace = localStorage.getItem('pending_face_verification');
      if (pendingFace && userId) {
        try {
          const userName = `${formData.firstName} ${formData.lastName}`;
          const { error: faceError } = await supabase.functions.invoke("face-verify", {
            body: { action: "index_face", front: pendingFace, userId, userName },
          });
          if (faceError) console.error('Face indexing error:', faceError);
          localStorage.removeItem('pending_face_verification');
        } catch (faceErr) {
          console.error('Face indexing exception:', faceErr);
        }
      }

      setAccountUserId(userId);
      setCreatingAccount(false);
    }

    if (!userId) {
      toast({ title: 'Something went wrong', description: 'Please restart registration.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    let imageOrder = 1;
    let successfulUploads = 0;
    for (const image of readyImages) {
      try {
        if (image.imageId) {
          // Already uploaded + moderated live while picking - just fix up
          // its image_order.
          const { error } = await withRetry(async () => {
            const result = await supabase
              .from('user_images')
              .update({ image_order: imageOrder })
              .eq('id', image.imageId);
            if (result.error) throw result.error;
            return result;
          });
          if (error) throw error;
          successfulUploads++;
        } else if (image.file) {
          // Fallback path - live check failed earlier for this one, so
          // upload + moderate it for real now.
          const mimeToExt: Record<string, string> = {
            'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'
          };
          const fileExt = mimeToExt[image.file.type] || 'jpg';
          const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
          const filePath = `${userId}/${fileName}`;

          await withRetry(async () => {
            const { error: uploadError } = await supabase.storage
              .from('user-photos')
              .upload(filePath, image.file as File, { contentType: (image.file as File).type, cacheControl: '3600' });
            if (uploadError) throw uploadError;
          });
          void uploadPhotoThumbnail(filePath, image.file as File);

          const { data: { publicUrl } } = supabase.storage.from('user-photos').getPublicUrl(filePath);
          const thisOrder = imageOrder;

          const insertedRow = await withRetry(async () => {
            const { data, error: dbError } = await supabase
              .from('user_images')
              .insert({ user_id: userId, image_url: publicUrl, image_order: thisOrder })
              .select('id')
              .single();
            if (!dbError) return data;
            // Same "did the previous attempt actually land?" recovery as
            // the live-upload path above.
            if (dbError.code === '23505') {
              const { data: existing, error: fetchError } = await supabase
                .from('user_images')
                .select('id')
                .eq('user_id', userId)
                .eq('image_order', thisOrder)
                .single();
              if (!fetchError && existing) return existing;
            }
            throw dbError;
          });

          // Record the row now, before moderation runs - if moderation
          // throws below, this photo already has a real row (just still
          // pending review) and must NOT count as failed/be re-uploaded as
          // a duplicate if the user retries submit.
          const thisPreview = image.preview;
          setImages(prev => prev.map(img => img.preview === thisPreview ? { ...img, imageId: insertedRow.id, filePath } : img));
          successfulUploads++;

          const imageBase64 = await fileToBase64(image.file);
          const modDecision = await invokeImageModeration(insertedRow.id, imageBase64);
          if (modDecision.status === 'rejected') {
            successfulUploads--;
            setImages(prev => prev.map(img => img.preview === thisPreview ? { ...img, status: 'rejected', moderationMessage: modDecision.message } : img));
            toast({
              title: 'Photo removed',
              description: modDecision.message || 'One of your photos was removed for violating our content guidelines.',
              variant: 'destructive',
            });
          }
        }

        imageOrder++;
      } catch (error) {
        toast({
          title: 'Image Upload Error',
          description: `Image ${imageOrder} failed to upload. Please try again.`,
          variant: 'destructive',
        });
      }
    }

    setIsSubmitting(false);

    // Never finalize registration with fewer than 2 real, persisted photos -
    // the account already exists at this point (created above), but leaving
    // it here (instead of calling onSubmit) means the next submit attempt
    // takes the live-upload path for whatever photos are left to retry,
    // instead of silently completing sign-up with missing/no photos.
    if (successfulUploads < 2) {
      toast({
        title: 'Photos failed to upload',
        description: 'At least 2 photos are required. Please try uploading again before continuing.',
        variant: 'destructive',
      });
      return;
    }

    localStorage.removeItem('pending_face_verification');
    setIsFinishing(true);

    // Photos are actually saved now - safe to hand routing back to the
    // parent (it explicitly moves to terms-acceptance in response to
    // onSubmit below anyway, so this isn't relying on the effect re-running).
    onRegistrationInProgressChange?.(false);

    // Fetch the user from supabase and pass to onSubmit so app state updates
    try {
      const { data: { user } } = await supabase.auth.getUser();
      onSubmit({ ...formData, images: approvedImages, ...(user ? { user } : {}) });
    } catch (error) {
      onSubmit({ ...formData, images: approvedImages });
    }
    // Normally the parent has already switched to the terms screen in the same
    // render; if it didn't, drop back to the form rather than hang here.
    setIsFinishing(false);
  };

  // Each step starts at its own top, not wherever the previous one was scrolled to.
  const formTopRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    formTopRef.current?.scrollIntoView({ block: 'start' });
  }, [currentStep]);

  const selectedPhotoCount = images.filter(img => (img.status === 'approved' || img.status === 'pending') && (img.imageId || img.file)).length;

  const progressScreen = currentStep === 2 && (creatingAccount || isSubmitting || isFinishing)
    ? creatingAccount
      ? { title: 'Creating your account', subtitle: 'Setting up your profile…' }
      : isSubmitting
        ? { title: 'Uploading your photos', subtitle: 'This only takes a moment.' }
        : { title: 'Almost there', subtitle: 'Getting your welcome screen ready…' }
    : null;

  return (
    <>
    {progressScreen && <OnboardingTransition title={progressScreen.title} subtitle={progressScreen.subtitle} />}
    <div
      className="dl-form keyboard-safe-form input-scroll-container relative min-h-[100dvh] w-full touch-pan-y"
      style={{ background: FORM_PAGE_BG }}
    >
      <div className="relative z-10 mx-auto w-full max-w-xl px-5 sm:px-8 pt-[calc(env(safe-area-inset-top,0px)+20px)] pb-[calc(env(safe-area-inset-bottom,0px)+32px)] dl-fade-in">
        <div ref={formTopRef} aria-hidden="true" />
        <header className="mb-7 text-center">
          <div className="mb-4 flex justify-center">
            <HoppingLogo size={52} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {currentStep === 1 ? t('registration.createAccount') : t('registration.tellUsMore')}
          </h1>
          <p className="mt-1.5 text-sm text-white/60">
            Step {currentStep} of 2
          </p>
          <div className="mx-auto mt-4 flex max-w-[200px] gap-1.5" aria-hidden="true">
            {[1, 2].map(step => (
              <span
                key={step}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${step <= currentStep ? 'bg-pink-500' : 'bg-white/15'}`}
              />
            ))}
          </div>
        </header>

        {/* noValidate: our own inline errors handle validation - the browser's
            native "Please fill out this field" bubbles only got in the way. */}
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {currentStep === 1 && (
            <div className="space-y-6 dl-fade-in">
              <section className={formSection}>
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
              </section>

              {/* Work & Education */}
              <section className={formSection}>
                <h2 className={formSectionTitle}>{t('registration.workEducation')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className={formLabel}>{t('profile.occupation')}</Label>
                    <Select value={formData.occupation} onValueChange={(value) => handleSelectChange('occupation', value)}>
                      <SelectTrigger className={formSelectTrigger(!!errors.occupation)}>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className={formSelectContent}>
                        {occupationOptions.map(option => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.occupation && <p className={formError}>{errors.occupation}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className={formLabel}>{t('profile.industry')}</Label>
                    <Select value={formData.industry} onValueChange={(value) => handleSelectChange('industry', value)}>
                      <SelectTrigger className={formSelectTrigger(!!errors.industry)}>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className={formSelectContent}>
                        {industryOptions.map(option => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.industry && <p className={formError}>{errors.industry}</p>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className={formLabel}>{t('registration.educationLevel')}</Label>
                  <Select value={formData.educationLevel} onValueChange={(value) => handleSelectChange('educationLevel', value)}>
                    <SelectTrigger className={formSelectTrigger(!!errors.educationLevel)}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className={formSelectContent}>
                      <SelectItem value="High School">{t('registration.highSchool')}</SelectItem>
                      <SelectItem value="Some College">{t('registration.someCollege')}</SelectItem>
                      <SelectItem value="Associate Degree">{t('registration.associateDegree')}</SelectItem>
                      <SelectItem value="Bachelor's Degree">{t('registration.bachelorsDegree')}</SelectItem>
                      <SelectItem value="Master's Degree">{t('registration.mastersDegree')}</SelectItem>
                      <SelectItem value="Doctorate">{t('registration.doctorate')}</SelectItem>
                      <SelectItem value="Other">{t('registration.other')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.educationLevel && <p className={formError}>{errors.educationLevel}</p>}
                </div>
              </section>

              {/* Location Section */}
              <section className={formSection}>
                <h2 className={formSectionTitle}>{t('registration.location')}</h2>
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
                  tone="dark"
                />
              </section>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 dl-fade-in">
              {/* Gender and Preference */}
              <section className={formSection}>
                <h2 className={formSectionTitle}>About you</h2>
                <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className={formLabel}>{t('registration.iAm')} <span className={formRequired}>*</span></Label>
                    <Select value={formData.gender} onValueChange={(value) => handleSelectChange('gender', value)}>
                      <SelectTrigger className={formSelectTrigger(!!errors.gender)}>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className={formSelectContent}>
                        <SelectItem value="male">{t('registration.male')}</SelectItem>
                        <SelectItem value="female">{t('registration.female')}</SelectItem>
                        <SelectItem value="other">{t('registration.other')}</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.gender && <p className={formError}>{errors.gender}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className={formLabel}>{t('registration.lookingFor')} <span className={formRequired}>*</span></Label>
                    <Select value={formData.preference} onValueChange={(value) => handleSelectChange('preference', value)}>
                      <SelectTrigger className={formSelectTrigger(!!errors.preference)}>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className={formSelectContent}>
                        <SelectItem value="male">{t('registration.male')}</SelectItem>
                        <SelectItem value="female">{t('registration.female')}</SelectItem>
                        <SelectItem value="everyone">{t('registration.everyone')}</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.preference && <p className={formError}>{errors.preference}</p>}
                  </div>
                </div>

                {/* Relationship Intent */}
                <div className="space-y-1.5">
                  <Label className={formLabel}>{t('registration.relationshipIntent')}</Label>
                  <Select value={formData.relationshipIntent} onValueChange={(value) => handleSelectChange('relationshipIntent', value)}>
                    <SelectTrigger className={formSelectTrigger(!!errors.relationshipIntent)}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className={formSelectContent}>
                      <SelectItem value="casual">{t('registration.casual')}</SelectItem>
                      <SelectItem value="serious">{t('registration.serious')}</SelectItem>
                      <SelectItem value="open_to_anything">{t('registration.openToAnything')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.relationshipIntent && <p className={formError}>{errors.relationshipIntent}</p>}
                </div>
              </section>

              {/* Adinkra Symbols Selector */}
              <section className={formSection}>
                <AdinkraSymbolSelector
                  selectedSymbols={formData.adinkraSymbols}
                  onChange={(symbols) => setFormData({ ...formData, adinkraSymbols: symbols })}
                  userCountry={formData.country}
                />
                {errors.adinkraSymbols && <p className={formError}>{errors.adinkraSymbols}</p>}
              </section>

              <section className={formSection}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className={formSectionTitle}>Profile Photos <span className={formRequired}>*</span></h2>
                  <p className={`text-xs font-medium whitespace-nowrap ${selectedPhotoCount >= 2 ? 'text-emerald-400' : 'text-white/55'}`}>
                    {selectedPhotoCount} / 2 minimum
                  </p>
                </div>
                <Input
                  id="photos"
                  type="file"
                  accept={getPhotoAcceptAttribute(Capacitor.isNativePlatform())}
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Label
                  htmlFor="photos"
                  className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/25 bg-white/[0.03] px-4 py-5 text-center transition-colors hover:border-pink-500/70 active:border-pink-500"
                >
                  <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-pink-500/15">
                    <Upload className="h-5 w-5 text-pink-400" />
                  </span>
                  <span className="text-sm font-medium text-white">Upload photos</span>
                  <span className="text-xs text-white/50">JPG, PNG, HEIC or camera RAW</span>
                </Label>
                {images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((image, index) => (
                      <div key={image.preview} className="relative">
                        <img
                          src={image.preview}
                          alt={`Upload ${index + 1}`}
                          className="w-full aspect-[4/5] object-cover rounded-xl border border-white/10"
                        />
                        {renderImageStatus(image)}

                        {/* Always visible: these were hover-only before, which
                            left them unreachable on touch screens. */}
                        <div className="absolute top-2 right-2 flex gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setCroppingImage({ preview: image.preview })}
                            className="p-0 h-8 w-8 rounded-full bg-black/70 text-white hover:bg-black/80 shadow-md"
                            title="Crop photo"
                            aria-label="Crop photo"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="p-0 h-8 w-8 rounded-full bg-black/70 text-white hover:bg-red-600 shadow-md"
                            onClick={() => removeImage(image.preview)}
                            title="Remove photo"
                            aria-label="Remove photo"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {croppingImage && (
                  <React.Suspense fallback={null}>
                    <PhotoCropModal
                      imageUrl={croppingImage.preview}
                      userId=""
                      onClose={() => setCroppingImage(null)}
                      onApply={handleCroppedImage}
                    />
                  </React.Suspense>
                )}
              </section>

              {promoCodeEnabled && (
                <section className={formSection}>
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
                </section>
              )}
            </div>
          )}

          <div className="flex flex-row gap-3 pt-2">
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(currentStep - 1)}
                className={`${formSecondaryButton} flex-1`}
              >
                {t('registration.back')}
              </Button>
            )}
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                creatingAccount ||
                (currentStep === 2 && (
                  images.some(img => img.status === 'moderating') ||
                  selectedPhotoCount < 2
                ))
              }
              className={`${formPrimaryButton} flex-[2]`}
            >
              {creatingAccount
                ? t('registration.creatingAccount')
                : isSubmitting
                  ? t('registration.creatingAccount')
                  : currentStep === 2 && images.some(img => img.status === 'moderating')
                    ? 'Checking photos…'
                    : currentStep === 1
                      ? t('registration.continue')
                      : t('registration.createAccount')
              }
            </Button>
          </div>
          {currentStep === 2 && selectedPhotoCount < 2 && !images.some(img => img.status === 'moderating') && (
            <p className="-mt-3 text-center text-xs text-white/50">Add at least 2 photos to create your account.</p>
          )}
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-sm text-white/70 transition-colors hover:text-white"
            >
              {t('registration.alreadyHaveAccount')}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
};

export default RegistrationForm;
