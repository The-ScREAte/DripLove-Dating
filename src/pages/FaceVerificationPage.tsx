import React from 'react';
import { useNavigate } from 'react-router-dom';
import FaceVerification from '@/components/FaceVerification';
import { Button } from '@/components/ui/button';

export default function FaceVerificationPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-purple-500 to-pink-500 relative">
      <div className="absolute top-4 left-4 z-20">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      {/* Standalone screen: avoid embedding camera preview in scroll containers */}
      <div className="min-h-screen w-full flex items-start justify-center px-4 pt-16 pb-8">
        <div className="w-full max-w-md">
          <FaceVerification />
        </div>
      </div>
    </div>
  );
}
