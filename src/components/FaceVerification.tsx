import { useState, useEffect, useRef } from "react";
import { CameraPreview } from '@capacitor-community/camera-preview';
import type { CameraPreviewOptions } from '@capacitor-community/camera-preview';
import { Capacitor } from '@capacitor/core';
import * as faceapi from '@vladmandic/face-api';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";

export default function FaceVerification() {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [faceAngleCorrect, setFaceAngleCorrect] = useState(false);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);
  const isNative = Capacitor.isNativePlatform();
  const CAMERA_SIZE = 280;

  const waitForNextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  // Add CSS to ensure camera video displays properly in circular container
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      #cameraPreview, .camera-feed {
        position: relative !important;
        overflow: hidden !important;
        border-radius: 50% !important;
        width: ${CAMERA_SIZE}px !important;
        height: ${CAMERA_SIZE}px !important;
      }
      
      .camera-feed video,
      .camera-feed canvas {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        border-radius: 50% !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
      }

      /* 🔥 FINAL FIX — force the card BELOW camera layers */
      .Card, .card, .registration-container, .page-container {
        z-index: 0 !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadModels() {
      const MODEL_URL = '/models';
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
        ]);
        if (mounted) {
          setFaceApiReady(true);
        }
      } catch (error) {
        console.error('Failed to load face-api models', error);
      }
    }

    loadModels();
    return () => { mounted = false; };
  }, []);
  
  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      if (isNative) {
        CameraPreview.stop().catch(() => {});
      } else if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isNative]);
  
  const [images, setImages] = useState<{
    front: string | null;
    left: string | null;
    right: string | null;
  }>({
    front: null,
    left: null,
    right: null
  });

  function getImageSrc(value: string | null): string | null {
    if (!value) return null;
    return value.startsWith('data:') ? value : `data:image/jpeg;base64,${value}`;
  }

  async function startCamera() {
    try {
      setIsLoading(true);
      setStep(1);
      await waitForNextFrame();
      
      if (isNative) {
        // Check and request camera permissions on mobile
        const permissions = await CameraPreview.checkPermissions();
        console.log('[Camera] Permissions status:', permissions);
        
        if (permissions.camera !== 'granted') {
          console.log('[Camera] Requesting permissions...');
          const requestResult = await CameraPreview.requestPermissions();
          console.log('[Camera] Permission request result:', requestResult);
          
          if (requestResult.camera !== 'granted') {
            throw new Error('Camera permission denied. Please enable camera access in settings.');
          }
        }
        
        // Wait for DOM to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Native mobile camera - render inside circular container
        const platform = Capacitor.getPlatform();
        const rect = cameraContainerRef.current?.getBoundingClientRect();
        const previewOptions: CameraPreviewOptions = {
          position: "front",
          className: "camera-feed",
          disableAudio: true,
          width: rect?.width ?? CAMERA_SIZE,
          height: rect?.height ?? CAMERA_SIZE,
          x: rect?.left ?? 0,
          y: rect?.top ?? 0,
          toBack: platform === 'android'
        };
        
        console.log('[Camera] Starting preview at', previewOptions);
        
        await CameraPreview.stop().catch(() => {});
        await CameraPreview.start(previewOptions);
        
        console.log('[Camera] Preview started successfully');
      } else {
        // Web browser camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'user',
            width: { ideal: CAMERA_SIZE },
            height: { ideal: CAMERA_SIZE }
          },
          audio: false
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          await videoRef.current.play();
          startFaceDetection();
        }
      }
    } catch (error) {
      console.error("Camera error:", error);
      alert("Failed to start camera. Please allow camera permissions.");
      setStep(0);
    } finally {
      setIsLoading(false);
    }
  }

  async function takePicture(angle: "front" | "left" | "right") {
    try {
      setIsLoading(true);
      let base64 = "";
      const isOrientationValid = await ensureRequiredAngle(angle);
      if (!isOrientationValid) {
        alert(angle === 'left' ? 'Please turn your head to the left before capturing.' : 'Please turn your head to the right before capturing.');
        setIsLoading(false);
        return;
      }
      
      if (isNative) {
        // Native mobile capture
        const result = await CameraPreview.capture({ quality: 90 });
        base64 = result.value;
      } else {
        // Web browser capture
        if (videoRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = CAMERA_SIZE;
          canvas.height = CAMERA_SIZE;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, CAMERA_SIZE, CAMERA_SIZE);
            base64 = canvas.toDataURL('image/jpeg', 0.9);
          }
        }
      }

      setImages(prev => ({ ...prev, [angle]: base64 }));

      if (angle === "front") setStep(2);
      if (angle === "left") setStep(3);
      if (angle === "right") {
        if (isNative) {
          await CameraPreview.stop();
        } else if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        setStep(4);
      }
    } catch (error) {
      console.error("Capture error:", error);
      alert("Failed to capture photo. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function ensureRequiredAngle(angle: "front" | "left" | "right") {
    if (angle === 'front') return true;
    if (!faceApiReady) return false;

    try {
      if (!isNative) {
        if (!videoRef.current) return false;
        const currentAngle = await detectFaceAngleFromElement(videoRef.current);
        return currentAngle === angle;
      }

      const sample = await CameraPreview.captureSample({ quality: 60 });
      if (!sample.value) return false;
      const imageElement = await loadImageFromBase64(sample.value);
      const currentAngle = await detectFaceAngleFromElement(imageElement);
      return currentAngle === angle;
    } catch (error) {
      console.error('[Camera] Orientation validation failed', error);
      return false;
    }
  }

  async function detectFaceAngleFromElement(
    element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
  ): Promise<'front' | 'left' | 'right' | null> {
    if (!faceApiReady) return null;
    const detection = await faceapi
      .detectSingleFace(element, new faceapi.TinyFaceDetectorOptions({ inputSize: 128 }))
      .withFaceLandmarks(true);

    if (!detection) return null;
    const nose = detection.landmarks.getNose();
    const nosePoint = nose[Math.floor(nose.length / 2)];
    const frameWidth = getElementWidth(element);
    if (!frameWidth) return null;

    const ratio = nosePoint.x / frameWidth;
    if (ratio < 0.40) return 'right';
    if (ratio > 0.60) return 'left';
    return 'front';
  }

  function getElementWidth(element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
    if (element instanceof HTMLVideoElement) {
      return element.videoWidth || element.clientWidth;
    }
    if (element instanceof HTMLImageElement) {
      return element.naturalWidth || element.width;
    }
    return element.width;
  }

  async function loadImageFromBase64(base64: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      const src = getImageSrc(base64);
      if (!src) {
        reject(new Error('Invalid sample data.'));
        return;
      }
      img.src = src;
    });
  }

  async function submit() {
    try {
      setIsLoading(true);
      
      // Generate a temporary unique ID for this verification
      const tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const { data, error } = await supabase.functions.invoke("face-verify", {
        body: {
          front: images.front,
          left: images.left,
          right: images.right,
          userId: tempUserId
        }
      });

      if (error) {
        alert("❌ Verification failed: " + error.message);
        return;
      }

      if (data.success) {
        alert("✅ Face verified! You can now complete your registration.");
      } else {
        alert("⚠️ Duplicate account detected! This face is already registered.");
      }

      resetVerification();
    } catch (error) {
      console.error("Submit error:", error);
      alert("Failed to verify. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function resetVerification() {
    setStep(0);
    setImages({ front: null, left: null, right: null });
    setIsFaceDetected(false);
    setFaceAngleCorrect(false);
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    if (isNative) {
      CameraPreview.stop().catch(() => {});
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }
  function startFaceDetection() {
    if (!faceApiReady) return;
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }

    const checkFrame = async () => {
      if (!videoRef.current) return;
      try {
        const currentAngle = await detectFaceAngleFromElement(videoRef.current);
        const hasFace = currentAngle !== null;
        setIsFaceDetected(hasFace);
        if (hasFace) {
          setFaceAngleCorrect(currentAngle === getCurrentRequiredAngle());
        } else {
          setFaceAngleCorrect(false);
        }
      } catch (error) {
        console.error('Face detection error', error);
        setIsFaceDetected(false);
        setFaceAngleCorrect(false);
      }
    };

    checkFrame();
    detectionIntervalRef.current = window.setInterval(checkFrame, 600);
  }

  function getCurrentRequiredAngle(): 'front' | 'left' | 'right' {
    if (step === 1) return 'front';
    if (step === 2) return 'left';
    if (step === 3) return 'right';
    return 'front';
  }

  function getInstructionText(): string {
    if (step === 1) return 'Look Straight';
    if (step === 2) return 'Turn Left';
    if (step === 3) return 'Turn Right';
    return '';
  }

  const captureOrder: Array<{ key: keyof typeof images; label: string }> = [
    { key: 'front', label: 'Front' },
    { key: 'left', label: 'Left' },
    { key: 'right', label: 'Right' }
  ];

  return (
    <div className="space-y-4">
      {/* Live Video Preview - Circular Camera Feed (Like Tinder) */}
      {step > 0 && step < 4 && (
        <div className="space-y-4 animate-fade-in">
          <div className="relative mx-auto" style={{ width: CAMERA_SIZE, height: CAMERA_SIZE }}>
            {/* Camera Video Container */}
            <div 
              id="cameraPreview" 
              ref={cameraContainerRef}
              className="camera-feed rounded-full overflow-hidden border-4 border-white/40 shadow-2xl mx-auto bg-transparent"
              style={{ 
                width: CAMERA_SIZE, 
                height: CAMERA_SIZE,
                position: 'relative',
                zIndex: 2,
                backgroundColor: 'transparent'
              }} 
            >
              {/* Web browser video element */}
              {!isNative && (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover rounded-full"
                  style={{ transform: 'scaleX(-1)' }}
                />
              )}
              
              {/* Loading state while camera initializes */}
              {isLoading && step === 1 && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-full" style={{ zIndex: 4 }}>
                  <div className="text-center text-white">
                    <Camera className="w-12 h-12 mx-auto mb-2 animate-pulse" />
                    <p className="text-sm">Loading camera...</p>
                  </div>
                </div>
              )}
              
              {/* Face outline guide - inside container with proper z-index */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 3 }}>
                <div className="w-48 h-64 border-2 border-white/40 rounded-full"></div>
              </div>
              
              {/* Instruction overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
                <div className="bg-black/30 px-6 py-2 rounded-full backdrop-blur-sm">
                  <p className="text-white/90 font-normal text-sm tracking-wide">{getInstructionText()}</p>
                </div>
                {!isNative && !isFaceDetected && (
                  <div className="mt-3 bg-red-500/80 px-4 py-2 rounded-full">
                    <p className="text-white text-sm font-medium">No face detected</p>
                  </div>
                )}
                {!isNative && isFaceDetected && !faceAngleCorrect && (
                  <div className="mt-3 bg-yellow-500/80 px-4 py-2 rounded-full">
                    <p className="text-white text-sm font-medium">Adjust position</p>
                  </div>
                )}
                {!isNative && isFaceDetected && faceAngleCorrect && (
                  <div className="mt-3 bg-green-500/80 px-4 py-2 rounded-full">
                    <p className="text-white text-sm font-medium">✓ Ready</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Capture thumbnails */}
      <div className="mt-4">
        <div className="flex items-center justify-center gap-3">
          {captureOrder.map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center gap-1">
              <div className="h-16 w-16 rounded-full border border-white/20 overflow-hidden bg-white/5 flex items-center justify-center">
                {images[key] ? (
                  <img
                    src={getImageSrc(images[key]) ?? undefined}
                    alt={`${label} capture`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] uppercase text-white/50 tracking-widest">{label}</span>
                )}
              </div>
              <p className="text-[10px] uppercase text-white/60 tracking-widest">
                {images[key] ? 'Captured' : 'Pending'}
              </p>
            </div>
          ))}
        </div>
      </div>
      {/* Completed Photos Preview */}
      <div className="mt-6">
        {/* Single action button, label changes per step */}
        <ActionButton 
          step={step} 
          isLoading={isLoading} 
          isNative={isNative}
          isFaceDetected={isFaceDetected}
          faceAngleCorrect={faceAngleCorrect}
          startCamera={startCamera} 
          takePicture={takePicture} 
          submit={submit} 
        />
      </div>
    </div>
  );
}

type ActionButtonProps = {
  step: number;
  isLoading: boolean;
  isNative: boolean;
  isFaceDetected: boolean;
  faceAngleCorrect: boolean;
  startCamera: () => Promise<void>;
  takePicture: (angle: "front" | "left" | "right") => Promise<void>;
  submit: () => Promise<void>;
};

function ActionButton({ step, isLoading, isNative, isFaceDetected, faceAngleCorrect, startCamera, takePicture, submit }: ActionButtonProps) {
  // Disable capture buttons if face not detected or angle incorrect (web only)
  const isCaptureDisabled = !isNative && step > 0 && step < 4 && (!isFaceDetected || !faceAngleCorrect);
  const getConfig = () => {
    switch (step) {
      case 1:
        return {
          label: "Capture Photo",
          loadingLabel: "Capturing...",
          action: () => takePicture("front"),
          icon: null
        };
      case 2:
        return {
          label: "Capture Photo",
          loadingLabel: "Capturing...",
          action: () => takePicture("left"),
          icon: null
        };
      case 3:
        return {
          label: "Capture Photo",
          loadingLabel: "Capturing...",
          action: () => takePicture("right"),
          icon: null
        };
      case 4:
        return {
          label: "Submit for Verification",
          loadingLabel: "Verifying...",
          action: submit,
          icon: <CheckCircle2 className="mr-2 h-5 w-5" />
        };
      default:
        return {
          label: "Start Verification",
          loadingLabel: "Starting Camera...",
          action: startCamera,
          icon: <Camera className="mr-2 h-5 w-5" />
        };
    }
  };

  const config = getConfig();

  return (
    <Button
      onClick={config.action}
      disabled={isLoading || isCaptureDisabled}
      className={`w-full font-semibold py-5 rounded-xl shadow-2xl flex items-center justify-center transition-all ${
        isCaptureDisabled 
          ? 'bg-gray-400 cursor-not-allowed opacity-60' 
          : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
      } text-white`}
    >
      {config.icon}
      {isLoading ? config.loadingLabel : config.label}
    </Button>
  );
}
