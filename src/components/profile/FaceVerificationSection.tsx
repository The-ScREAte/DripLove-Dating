import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Shield, CheckCircle, Camera, AlertCircle } from 'lucide-react';
import FaceVerification from '@/components/FaceVerification';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FaceVerificationSectionProps {
  currentUser: any;
  profile: any;
  isEditing: boolean;
  onProfileUpdate: () => void;
}

const FaceVerificationSection = ({ 
  currentUser, 
  profile, 
  isEditing,
  onProfileUpdate 
}: FaceVerificationSectionProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showVerification, setShowVerification] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Check if user is already verified (has face_descriptor)
  const isVerified = !!profile?.face_descriptor;

  const handleVerified = async (faceImageBase64: string) => {
    setIsVerifying(true);
    try {
      // Index the face with the user's ID
      const { data, error } = await supabase.functions.invoke("face-verify", {
        body: {
          action: "index_face",
          front: faceImageBase64,
          userId: currentUser.id,
        },
      });

      if (error) {
        console.error('Face indexing error:', error);
        toast({
          title: "Verification Failed",
          description: "Could not complete face verification. Please try again.",
          variant: "destructive",
        });
        return;
      }

      if (data?.success) {
        // The face-verify edge function persists profiles.face_descriptor itself
        // (server-side, service role, after confirming caller identity) - the
        // client is not trusted to set verification status directly, since RLS
        // on profiles only checks row ownership, not which columns changed.
        // Face verified - no toast needed, verified badge shows on profile
        setShowVerification(false);
        onProfileUpdate();
      } else {
        toast({
          title: "Verification Failed",
          description: data?.error || "Could not verify your face. Please try again.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error('Verification error:', err);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  if (showVerification) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2 text-white">
            <Shield className="w-5 h-5 text-purple-400" />
            Face Verification
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowVerification(false)}
          >
            Cancel
          </Button>
        </div>
        
        <FaceVerification 
          onVerified={handleVerified}
          disabled={isVerifying}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Face Verification</h3>
      </div>

      {isVerified ? (
        <div className="bg-black border border-green-500/30 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="font-medium text-green-400">Verified</p>
              <p className="text-sm text-green-500/80">
                Your identity has been confirmed. Others can see your verified badge.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-black border border-purple-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-purple-500/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Camera className="w-5 h-5 text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-purple-300">Get Verified</p>
              <p className="text-sm text-purple-400/80 mb-3">
                Verify your identity to build trust and show others you're real.
                Verified profiles get more matches!
              </p>
              <Button
                onClick={() => setShowVerification(true)}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                size="sm"
              >
                <Shield className="w-4 h-4 mr-2" />
                Start Verification
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          Face verification uses secure technology to confirm your identity. 
          Your face data is encrypted and never shared.
        </span>
      </div>
    </div>
  );
};

export default FaceVerificationSection;
