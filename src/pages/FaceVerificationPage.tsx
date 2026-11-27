import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FaceVerification from '@/components/FaceVerification';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function FaceVerificationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isIndexing, setIsIndexing] = useState(false);

  // FaceVerification itself only validates (checks for duplicates) and
  // reports success back via onVerified - it never persists anything. The
  // actual save (indexing the face in Rekognition, which is what sets
  // profiles.face_descriptor server-side) has to happen here, the same way
  // ImageManagement's own face-verify entry point does it. Without this,
  // this standalone page showed "Face Verified!" without ever verifying
  // the account - a dead end for anyone routed here directly (e.g. the
  // Discover swipe prompt) rather than through onboarding.
  const handleVerified = async (faceImageBase64: string) => {
    setIsIndexing(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        toast({
          title: 'Not signed in',
          description: 'Please sign in again and retry verification.',
          variant: 'destructive',
        });
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', userId)
        .maybeSingle();
      const userName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : undefined;

      const { data, error } = await supabase.functions.invoke('face-verify', {
        body: {
          action: 'index_face',
          front: faceImageBase64,
          userId,
          userName: userName || undefined,
        },
      });

      if (error || !data?.success) {
        toast({
          title: 'Verification Failed',
          description: data?.error || 'Could not complete face verification. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Identity Verified',
        description: 'Your profile now shows the verified badge.',
      });
      setTimeout(() => navigate(-1), 1200);
    } catch (err) {
      console.error('Face indexing error:', err);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsIndexing(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black relative">
      <div
        className="absolute left-4 z-20"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: 'calc(env(safe-area-inset-left, 0px) + 16px)' }}
      >
        <Button variant="line" size="md" className="text-white" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      {/* Standalone screen: avoid embedding camera preview in scroll containers */}
      <div
        className="min-h-screen w-full flex items-start justify-center px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 64px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}
      >
        <div className="w-full max-w-md">
          <FaceVerification onVerified={handleVerified} disabled={isIndexing} />
        </div>
      </div>
    </div>
  );
}
