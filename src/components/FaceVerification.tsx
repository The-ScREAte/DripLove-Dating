import { useState, useEffect, useRef } from "react";
import { CameraPreview } from '@capacitor-community/camera-preview';
import type { CameraPreviewOptions } from '@capacitor-community/camera-preview';
import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera } from '@capacitor/camera';
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Camera as CameraIcon, CheckCircle2, RefreshCw } from "lucide-react";

type FaceVerificationProps = {
  onVerified?: (faceImageBase64: string) => void;
  disabled?: boolean;
};

const CAMERA_SIZE = 280;

type CaptureStep = 'front' | 'side';

export default function FaceVerification({ onVerified, disabled }: FaceVerificationProps) {
  const [step, setStep] = useState(0); // 0=start, 1=camera-front, 2=camera-side, 3=review, 4=verifying, 5=done
  const [isLoading, setIsLoading] = useState(false);
  const [capturedImages, setCapturedImages] = useState<{ front: string | null; side: string | null }>({ front: null, side: null });
  const [verificationResult, setVerificationResult] = useState<'none' | 'success' | 'duplicate' | 'error'>('none');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentCapture, setCurrentCapture] = useState<CaptureStep>('front');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);

  const isNative = Capacitor.isNativePlatform();

  // Native live preview
  const [nativeLiveFrame, setNativeLiveFrame] = useState<string | null>(null);
  const nativeFrameIntervalRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopNativeLiveFrameCapture();
      if (isNative) {
        CameraPreview.stop().catch(() => {});
      } else if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isNative]);

  function startNativeLiveFrameCapture() {
    if (nativeFrameIntervalRef.current) {
      clearInterval(nativeFrameIntervalRef.current);
    }

    const captureFrame = async () => {
      try {
        const result = await CameraPreview.captureSample({ quality: 50 });
        if (result?.value) {
          const rawDataUri = result.value.startsWith('data:')
            ? result.value
            : `data:image/jpeg;base64,${result.value}`;
          setNativeLiveFrame(rawDataUri);
        }
      } catch {
        // ignore preview frame errors
      }
    };

    captureFrame();
    nativeFrameIntervalRef.current = window.setInterval(captureFrame, 50);
  }

  function stopNativeLiveFrameCapture() {
    if (nativeFrameIntervalRef.current) {
      clearInterval(nativeFrameIntervalRef.current);
      nativeFrameIntervalRef.current = null;
    }
    setNativeLiveFrame(null);
  }

  async function startCamera(captureType: CaptureStep = 'front') {
    if (disabled) return;
    
    try {
      setIsLoading(true);
      setErrorMessage(null);
      setCurrentCapture(captureType);
      setStep(captureType === 'front' ? 1 : 2);

      if (isNative) {
        try {
          const perm = await CapacitorCamera.requestPermissions({ permissions: ['camera'] });
          if (perm.camera !== 'granted') {
            setErrorMessage('Camera permission denied');
            setStep(0);
            return;
          }
        } catch (e) {
          console.error('[Camera] Permission request failed', e);
          setErrorMessage('Camera permission required');
          setStep(0);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));

        const vv = window.visualViewport;
        const viewportWidth = Math.round(vv?.width ?? window.innerWidth);
        const viewportHeight = Math.round(vv?.height ?? window.innerHeight);

        const previewOptions: CameraPreviewOptions = {
          position: "front",
          parent: "cameraPreview",
          className: "camera-feed",
          disableAudio: true,
          width: viewportWidth,
          height: viewportHeight,
          x: 0,
          y: 0,
          toBack: true,
          enableHighResolution: true,
        } as any;

        await CameraPreview.stop().catch(() => {});
        await CameraPreview.start(previewOptions);
        startNativeLiveFrameCapture();
      } else {
        // Web
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          await videoRef.current.play();
        }
      }
    } catch (error) {
      console.error('Camera error:', error);
      setErrorMessage('Camera permission required');
      setStep(0);
    } finally {
      setIsLoading(false);
    }
  }

  async function capturePhoto() {
    try {
      setIsLoading(true);
      let base64 = "";

      if (isNative) {
        const result = await CameraPreview.capture({ quality: 90 });
        base64 = result.value.startsWith('data:') ? result.value : `data:image/jpeg;base64,${result.value}`;
      } else {
        if (videoRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 640;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, 640, 640);
            base64 = canvas.toDataURL('image/jpeg', 0.9);
          }
        }
      }

      if (currentCapture === 'front') {
        setCapturedImages(prev => ({ ...prev, front: base64 }));
        // Move to side capture
        if (isNative) {
          // Keep camera running for next capture
        }
        setCurrentCapture('side');
        setStep(2);
      } else {
        setCapturedImages(prev => ({ ...prev, side: base64 }));
        // Done capturing, stop camera
        stopNativeLiveFrameCapture();
        if (isNative) {
          await CameraPreview.stop().catch(() => {});
        } else if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        setStep(3);
      }
    } catch (error) {
      console.error('Capture error:', error);
      setErrorMessage('Failed to capture photo');
    } finally {
      setIsLoading(false);
    }
  }

  async function retakePhoto(which: 'front' | 'side' | 'all') {
    setVerificationResult('none');
    setErrorMessage(null);
    
    if (which === 'all') {
      setCapturedImages({ front: null, side: null });
      await startCamera('front');
    } else if (which === 'front') {
      setCapturedImages(prev => ({ ...prev, front: null }));
      await startCamera('front');
    } else {
      setCapturedImages(prev => ({ ...prev, side: null }));
      await startCamera('side');
    }
  }

  async function submitVerification() {
    if (!capturedImages.front || !capturedImages.side) return;

    try {
      setIsLoading(true);
      setStep(4);
      setErrorMessage(null);

      // Use validate_only action - don't index the face yet
      const { data, error } = await supabase.functions.invoke("face-verify", {
        body: {
          action: "validate_only",
          front: capturedImages.front,
        },
      });

      // If error is FunctionsHttpError, it contains the response body
      if (error) {
        if (error instanceof FunctionsHttpError) {
          // Get the error response body
          const errorBody = await error.context.json();
          
          if (errorBody) {
            handleErrorResponse(errorBody);
            return;
          }
        }
        
        // If we have data alongside error (some edge cases)
        if (data) {
          handleErrorResponse(data);
          return;
        }
        
        // Fallback
        setVerificationResult('error');
        setErrorMessage("Connection error. Please try again.");
        setStep(3);
        return;
      }

      // Success case - no error
      if (data?.success === true) {
        setVerificationResult('success');
        setStep(5);
        // Pass the face image to parent - it will be indexed when account is created
        if (onVerified && capturedImages.front) {
          onVerified(capturedImages.front);
        }
        return;
      }

      // Data returned but not success (shouldn't happen with 2xx)
      if (data) {
        handleErrorResponse(data);
        return;
      }

      // No data at all
      setVerificationResult('error');
      setErrorMessage("No response from server. Please try again.");
      setStep(3);

    } catch (err: any) {
      console.error("Submit exception:", err);
      setVerificationResult('error');
      setErrorMessage("Network error. Check your connection and try again.");
      setStep(3);
    } finally {
      setIsLoading(false);
    }
  }

  function handleErrorResponse(responseData: any) {
    const code = responseData?.code;
    const errorMsg = responseData?.error;

    if (code === 'DUPLICATE_FACE') {
      setVerificationResult('duplicate');
      setErrorMessage("This face is already registered. Each person can only create one account.");
      setStep(3);
      return;
    }

    if (code === 'NO_FACE') {
      setVerificationResult('error');
      setErrorMessage("No face detected in your photo. Make sure your face is clearly visible.");
      setStep(3);
      return;
    }

    if (code === 'LOW_CONFIDENCE') {
      setVerificationResult('error');
      setErrorMessage("Photo quality too low. Find better lighting and try again.");
      setStep(3);
      return;
    }

    if (code === 'INDEX_FAILED' || code === 'VALIDATION_FAILED') {
      setVerificationResult('error');
      setErrorMessage("Could not process your photo. Try again with better lighting.");
      setStep(3);
      return;
    }

    // Use server error message if available
    if (errorMsg) {
      setVerificationResult('error');
      setErrorMessage(errorMsg);
      setStep(3);
      return;
    }

    // Generic fallback
    setVerificationResult('error');
    setErrorMessage("Verification failed. Please try again.");
    setStep(3);
  }

  function getInstruction(): string {
    if (currentCapture === 'front') {
      return "Look straight at the camera";
    }
    return "Turn your head slightly to the side";
  }

  function getCaptureLabel(): string {
    if (currentCapture === 'front') {
      return "Photo 1 of 2 - Front";
    }
    return "Photo 2 of 2 - Side";
  }

  const isCameraStep = step === 1 || step === 2;

  return (
    <div className="space-y-4">
      {/* Camera View */}
      {isCameraStep && (
        <div className="space-y-4 animate-fade-in">
          {/* Hidden native container */}
          {isNative && (
            <div
              id="cameraPreview"
              ref={cameraContainerRef}
              style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', zIndex: -9999 }}
            />
          )}

          {/* Progress indicator */}
          <div className="flex justify-center gap-2 mb-2">
            <div className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-purple-500' : 'bg-white/30'}`} />
            <div className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-purple-500' : 'bg-white/30'}`} />
          </div>

          <p className="text-center text-gray-700 text-sm font-medium">{getCaptureLabel()}</p>

          <div className="relative mx-auto" style={{ width: CAMERA_SIZE, height: CAMERA_SIZE }}>
            {/* Native preview */}
            {isNative && (
              <div
                className="rounded-full overflow-hidden border-4 border-purple-200 shadow-2xl bg-black"
                style={{ width: CAMERA_SIZE, height: CAMERA_SIZE, position: 'relative', margin: '0 auto', borderRadius: '50%' }}
              >
                {nativeLiveFrame ? (
                  <img
                    src={nativeLiveFrame}
                    alt="Camera preview"
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CameraIcon className="w-12 h-12 text-white/50 animate-pulse" />
                  </div>
                )}
              </div>
            )}

            {/* Web preview */}
            {!isNative && (
              <div
                id="cameraPreview"
                ref={cameraContainerRef}
                className="camera-feed rounded-full overflow-hidden border-4 border-purple-200 shadow-2xl bg-black"
                style={{ width: CAMERA_SIZE, height: CAMERA_SIZE, position: 'relative', margin: '0 auto', borderRadius: '50%' }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover rounded-full"

                />
              </div>
            )}

            {/* Face guide overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
              <div className="w-48 h-64 border-2 border-purple-400/60 rounded-full" />
            </div>

            {/* Instruction */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ zIndex: 20 }}>
              <div className="bg-black/40 px-6 py-2 rounded-full backdrop-blur-sm">
                <p className="text-white/90 font-medium text-sm">{getInstruction()}</p>
              </div>
            </div>
          </div>

          {/* Thumbnails */}
          <div className="flex justify-center gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-14 h-14 rounded-full border-2 overflow-hidden ${capturedImages.front ? 'border-green-400' : 'border-gray-300'} bg-gray-100`}>
                {capturedImages.front ? (
                  <img src={capturedImages.front} alt="Front" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Front</div>
                )}
              </div>
              <span className="text-xs text-gray-500 mt-1">{capturedImages.front ? '✓' : '1'}</span>
            </div>
            <div className="flex flex-col items-center">
              <div className={`w-14 h-14 rounded-full border-2 overflow-hidden ${capturedImages.side ? 'border-green-400' : 'border-gray-300'} bg-gray-100`}>
                {capturedImages.side ? (
                  <img src={capturedImages.side} alt="Side" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Side</div>
                )}
              </div>
              <span className="text-xs text-gray-500 mt-1">{capturedImages.side ? '✓' : '2'}</span>
            </div>
          </div>

          {/* Capture Button */}
          <Button
            onClick={capturePhoto}
            disabled={isLoading}
            className="w-full font-semibold py-5 rounded-xl shadow-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
          >
            <CameraIcon className="mr-2 h-5 w-5" />
            {isLoading ? "Capturing..." : "Take Photo"}
          </Button>
        </div>
      )}

      {/* Review Captured Images */}
      {step === 3 && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-center text-gray-700 text-sm font-medium">Review your photos</p>

          <div className="flex justify-center gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-24 h-24 rounded-full border-4 overflow-hidden shadow-lg ${verificationResult === 'error' || verificationResult === 'duplicate' ? 'border-red-400' : 'border-purple-200'}`}>
                {capturedImages.front && (
                  <img src={capturedImages.front} alt="Front" className="w-full h-full object-cover" />
                )}
              </div>
              <span className="text-xs text-gray-500 mt-2">Front</span>
            </div>
            <div className="flex flex-col items-center">
              <div className={`w-24 h-24 rounded-full border-4 overflow-hidden shadow-lg ${verificationResult === 'error' || verificationResult === 'duplicate' ? 'border-red-400' : 'border-purple-200'}`}>
                {capturedImages.side && (
                  <img src={capturedImages.side} alt="Side" className="w-full h-full object-cover" />
                )}
              </div>
              <span className="text-xs text-gray-500 mt-2">Side</span>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className={`p-3 rounded-lg text-sm text-center ${verificationResult === 'duplicate' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {errorMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={() => retakePhoto('all')}
              variant="outline"
              className="flex-1 border-gray-300"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retake
            </Button>
            <Button
              onClick={submitVerification}
              disabled={isLoading}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            >
              {isLoading ? "Verifying..." : "Verify Face"}
            </Button>
          </div>
        </div>
      )}

      {/* Verifying */}
      {step === 4 && (
        <div className="text-center space-y-4 animate-fade-in py-8">
          <div className="animate-spin h-12 w-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-700 font-medium">Verifying your identity...</p>
          <p className="text-sm text-gray-500">This may take a moment</p>
        </div>
      )}

      {/* Success */}
      {step === 5 && (
        <div className="text-center space-y-4 animate-fade-in">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <div>
            <p className="text-green-700 font-semibold">Face Verified!</p>
            <p className="text-sm text-gray-600 mt-1">Your identity has been confirmed</p>
          </div>
        </div>
      )}

      {/* Start Button */}
      {step === 0 && (
        <div className="space-y-3">
          <Button
            onClick={() => startCamera('front')}
            disabled={isLoading || disabled}
            className="w-full font-semibold py-5 rounded-xl shadow-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white disabled:opacity-50"
          >
            <CameraIcon className="mr-2 h-5 w-5" />
            {isLoading ? "Opening Camera..." : "Start Verification"}
          </Button>
          {disabled && (
            <p className="text-xs text-amber-600 text-center">Enter your first and last name to enable verification</p>
          )}
          {errorMessage && (
            <p className="text-xs text-red-600 text-center">{errorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
