import { useState, useEffect, useRef } from "react";
import { CameraPreview } from '@capacitor-community/camera-preview';
import type { CameraPreviewOptions } from '@capacitor-community/camera-preview';
import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera } from '@capacitor/camera';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera as CameraIcon, CheckCircle2, RefreshCw } from "lucide-react";

type FaceVerificationProps = {
  onVerified?: () => void;
};

const CAMERA_SIZE = 280;

type CaptureStep = 'front' | 'side';

export default function FaceVerification({ onVerified }: FaceVerificationProps) {
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

      const tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const { data, error } = await supabase.functions.invoke("face-verify", {
        body: {
          front: capturedImages.front,
          side: capturedImages.side,
          userId: tempUserId,
        },
      });

      if (error) {
        console.error("Face verification error:", error);
        setVerificationResult('error');
        setErrorMessage(error.message || "Verification failed");
        setStep(3);
        return;
      }

      if (data.success) {
        setVerificationResult('success');
        setStep(5);
        if (onVerified) {
          onVerified();
        }
      } else if (data.reason === 'duplicate') {
        setVerificationResult('duplicate');
        setErrorMessage("This face is already registered. Each person can only have one account.");
        setStep(3);
      } else {
        setVerificationResult('error');
        setErrorMessage(data.error || "No face detected in image");
        setStep(3);
      }
    } catch (error) {
      console.error("Submit error:", error);
      setVerificationResult('error');
      setErrorMessage("Failed to verify. Please try again.");
      setStep(3);
    } finally {
      setIsLoading(false);
    }
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

          <p className="text-center text-white/80 text-sm font-medium">{getCaptureLabel()}</p>

          <div className="relative mx-auto" style={{ width: CAMERA_SIZE, height: CAMERA_SIZE }}>
            {/* Native preview */}
            {isNative && (
              <div
                className="rounded-full overflow-hidden border-4 border-white/40 shadow-2xl bg-black"
                style={{ width: CAMERA_SIZE, height: CAMERA_SIZE, position: 'relative', margin: '0 auto', borderRadius: '50%' }}
              >
                {nativeLiveFrame ? (
                  <img
                    src={nativeLiveFrame}
                    alt="Camera preview"
                    className="w-full h-full object-cover rounded-full"
                    style={{ transform: 'scaleX(-1)' }}
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
                className="camera-feed rounded-full overflow-hidden border-4 border-white/40 shadow-2xl bg-black"
                style={{ width: CAMERA_SIZE, height: CAMERA_SIZE, position: 'relative', margin: '0 auto', borderRadius: '50%' }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover rounded-full"
                  style={{ transform: 'scaleX(-1)' }}
                />
              </div>
            )}

            {/* Face guide overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
              <div className="w-48 h-64 border-2 border-white/60 rounded-full" />
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
              <div className={`w-14 h-14 rounded-full border-2 overflow-hidden ${capturedImages.front ? 'border-green-400' : 'border-white/30'} bg-black/30`}>
                {capturedImages.front ? (
                  <img src={capturedImages.front} alt="Front" className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">Front</div>
                )}
              </div>
              <span className="text-xs text-white/60 mt-1">{capturedImages.front ? '✓' : '1'}</span>
            </div>
            <div className="flex flex-col items-center">
              <div className={`w-14 h-14 rounded-full border-2 overflow-hidden ${capturedImages.side ? 'border-green-400' : 'border-white/30'} bg-black/30`}>
                {capturedImages.side ? (
                  <img src={capturedImages.side} alt="Side" className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">Side</div>
                )}
              </div>
              <span className="text-xs text-white/60 mt-1">{capturedImages.side ? '✓' : '2'}</span>
            </div>
          </div>

          {/* Capture Button */}
          <Button
            onClick={capturePhoto}
            disabled={isLoading}
            className="w-full font-semibold py-5 rounded-xl shadow-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
          >
            <CameraIcon className="mr-2 h-5 w-5" />
            {isLoading ? "Capturing..." : "Take Photo"}
          </Button>
        </div>
      )}

      {/* Review Captured Images */}
      {step === 3 && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-center text-white/80 text-sm font-medium">Review your photos</p>

          <div className="flex justify-center gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-24 h-24 rounded-full border-4 overflow-hidden shadow-lg ${verificationResult === 'error' || verificationResult === 'duplicate' ? 'border-red-400' : 'border-white/40'}`}>
                {capturedImages.front && (
                  <img src={capturedImages.front} alt="Front" className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                )}
              </div>
              <span className="text-xs text-white/70 mt-2">Front</span>
            </div>
            <div className="flex flex-col items-center">
              <div className={`w-24 h-24 rounded-full border-4 overflow-hidden shadow-lg ${verificationResult === 'error' || verificationResult === 'duplicate' ? 'border-red-400' : 'border-white/40'}`}>
                {capturedImages.side && (
                  <img src={capturedImages.side} alt="Side" className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                )}
              </div>
              <span className="text-xs text-white/70 mt-2">Side</span>
            </div>
          </div>

          {verificationResult === 'duplicate' && (
            <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3">
              <p className="text-red-200 text-sm text-center font-medium">Duplicate Account Detected</p>
            </div>
          )}

          {errorMessage && (
            <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3">
              <p className="text-red-200 text-sm text-center">{errorMessage}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => retakePhoto('all')}
              variant="outline"
              className="flex-1 py-5 rounded-xl border-white/40 text-white hover:bg-white/10"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retake
            </Button>
            <Button
              onClick={submitVerification}
              disabled={isLoading}
              className="flex-1 font-semibold py-5 rounded-xl shadow-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            >
              <CheckCircle2 className="mr-2 h-5 w-5" />
              {isLoading ? "Verifying..." : "Verify"}
            </Button>
          </div>
        </div>
      )}

      {/* Verifying State */}
      {step === 4 && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-center gap-4">
            <div className="w-20 h-20 rounded-full border-4 border-purple-400 overflow-hidden shadow-lg animate-pulse">
              {capturedImages.front && (
                <img src={capturedImages.front} alt="Front" className="w-full h-full object-cover opacity-70" style={{ transform: 'scaleX(-1)' }} />
              )}
            </div>
            <div className="w-20 h-20 rounded-full border-4 border-purple-400 overflow-hidden shadow-lg animate-pulse">
              {capturedImages.side && (
                <img src={capturedImages.side} alt="Side" className="w-full h-full object-cover opacity-70" style={{ transform: 'scaleX(-1)' }} />
              )}
            </div>
          </div>
          <div className="flex justify-center">
            <div className="bg-purple-600/90 px-6 py-3 rounded-full">
              <p className="text-white font-medium">Driplove verifying...</p>
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
      {step === 5 && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-center gap-4">
            <div className="w-20 h-20 rounded-full border-4 border-green-400 overflow-hidden shadow-lg">
              {capturedImages.front && (
                <img src={capturedImages.front} alt="Front" className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              )}
            </div>
            <div className="w-20 h-20 rounded-full border-4 border-green-400 overflow-hidden shadow-lg">
              {capturedImages.side && (
                <img src={capturedImages.side} alt="Side" className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              )}
            </div>
          </div>
          <div className="flex justify-center">
            <div className="bg-green-600 px-6 py-3 rounded-full flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-white" />
              <p className="text-white font-medium">Verified!</p>
            </div>
          </div>
        </div>
      )}

      {/* Start Button */}
      {step === 0 && (
        <Button
          onClick={() => startCamera('front')}
          disabled={isLoading}
          className="w-full font-semibold py-5 rounded-xl shadow-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
        >
          <CameraIcon className="mr-2 h-5 w-5" />
          {isLoading ? "Starting Camera..." : "Start Face Verification"}
        </Button>
      )}

      {errorMessage && step === 0 && (
        <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3">
          <p className="text-red-200 text-sm text-center">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
