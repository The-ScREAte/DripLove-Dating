import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { extractDuplicateFaceDetails, formatDuplicateFaceMessage } from '@/utils/faceReference';
import type { OnboardingMode } from './types';

/** localStorage keys the two flows have always used - kept so an interrupted
 *  flow still resumes (and the submit pipelines read the same key). */
export const FACE_STORAGE_KEY: Record<OnboardingMode, string> = {
  register: 'pending_face_verification',
  complete: 'pending_face_verification_profile',
};

/**
 * Face verification state shared by both flows: validates (duplicate check)
 * without indexing, stashes the capture locally until final submit, and - for
 * an already-signed-in user - treats a face already on file as verified.
 */
export function useOnboardingFace(mode: OnboardingMode, userId: string | null) {
  const { toast } = useToast();
  const storageKey = FACE_STORAGE_KEY[mode];
  const [faceVerified, setFaceVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  // true once we know whether a face is already on file (local capture or DB),
  // so the wizard can decide which steps to skip without a flash
  const [faceChecked, setFaceChecked] = useState(false);
  // true once the person taps "Verify": the intro goes away and only the camera shows
  const [capturing, setCapturing] = useState(false);

  // Restore from localStorage on mount.
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey)) setFaceVerified(true);
    } catch {
      /* storage unavailable - user just verifies again */
    }
  }, [storageKey]);

  // An already-signed-in user may have a face on file (e.g. OAuth user who
  // verified earlier) - that counts, same as the old complete-profile page.
  useEffect(() => {
    if (!userId) {
      setFaceChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('face_descriptor')
          .eq('id', userId)
          .maybeSingle();
        if (!cancelled && profile?.face_descriptor) setFaceVerified(true);
      } finally {
        if (!cancelled) setFaceChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleFaceVerified = useCallback(
    async (faceImageBase64: string) => {
      setIsVerifying(true);
      try {
        // Validate (duplicate check) WITHOUT indexing.
        const { data, error } = await supabase.functions.invoke('face-verify', {
          body: { action: 'validate_only', front: faceImageBase64 },
        });

        if (error) {
          console.error('Face validation error:', error);
          toast({
            title: 'Verification Failed',
            description: 'Could not validate your face. Please try again.',
            variant: 'destructive',
          });
          return;
        }

        if (!data?.success) {
          const isDuplicateFace = data?.code === 'DUPLICATE_FACE';
          toast({
            title: isDuplicateFace ? 'Face Already Registered' : 'Verification Failed',
            description: isDuplicateFace
              ? formatDuplicateFaceMessage(extractDuplicateFaceDetails(data))
              : data?.error || 'Could not verify your face. Please try again.',
            variant: 'destructive',
          });
          return;
        }

        // Stored locally, not in the DB yet - indexed at final submit.
        localStorage.setItem(storageKey, faceImageBase64);
        setFaceVerified(true);

        toast({
          title: React.createElement(
            'span',
            { className: 'inline-flex items-center gap-1.5' },
            React.createElement(CheckCircle, { className: 'w-4 h-4 text-green-500' }),
            ' Face Verified',
          ),
          description:
            mode === 'register'
              ? 'Your face will be saved when you complete registration.'
              : 'Your face will be saved when you complete your profile.',
        });
      } catch (err) {
        console.error('Face verification error:', err);
        toast({
          title: 'Verification Error',
          description: 'Could not capture face. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsVerifying(false);
      }
    },
    [mode, storageKey, toast],
  );

  return {
    faceVerified,
    faceChecked,
    capturing,
    setCapturing,
    isVerifying,
    handleFaceVerified,
    storageKey,
  };
}
