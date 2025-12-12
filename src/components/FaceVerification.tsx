import { useState, useEffect, useRef } from "react";
import { CameraPreview } from '@capacitor-community/camera-preview';
import type { CameraPreviewOptions } from '@capacitor-community/camera-preview';
import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera } from '@capacitor/camera';
import * as faceapi from '@vladmandic/face-api';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera as CameraIcon, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";

type FaceVerificationProps = {
  onVerified?: () => void;
};

export default function FaceVerification({ onVerified }: FaceVerificationProps) {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [faceAngleCorrect, setFaceAngleCorrect] = useState(false);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [verificationResult, setVerificationResult] = useState<'none' | 'success' | 'duplicate'>('none');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);
  const isDetecting = useRef<boolean>(false);
  const isNative = Capacitor.isNativePlatform();
  const CAMERA_SIZE = 280;
  const DETECTION_SIZE = 416;
  const DETECTION_TIMEOUT_MS = 3000;
  const [detectionLagging, setDetectionLagging] = useState(false);
  const detectionLagRef = useRef<number | null>(null);
  
  // Native camera live preview frame (displayed in img tag for reliability)
  const [nativeLiveFrame, setNativeLiveFrame] = useState<string | null>(null);
  const nativeFrameIntervalRef = useRef<number | null>(null);

  const waitForNextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  // The web preview is mirrored (selfie UX). To make instructions match what the user sees,
  // normalize detected left/right for web when comparing against the required step.
  const normalizeAngleForUi = (
    angle: 'front' | 'left' | 'right' | null
  ): 'front' | 'left' | 'right' | null => {
    if (!angle) return null;
    if (isNative) return angle;
    if (angle === 'left') return 'right';
    if (angle === 'right') return 'left';
    return angle;
  };

  const setTransientStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 1800);
  };

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
      if (nativeFrameIntervalRef.current) {
        clearInterval(nativeFrameIntervalRef.current);
      }
      if (isNative) {
        CameraPreview.stop().catch(() => {});
      } else if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isNative]);
  
  // Start native live frame capture loop (shows camera feed in img tag)
  function startNativeLiveFrameCapture() {
    if (nativeFrameIntervalRef.current) {
      clearInterval(nativeFrameIntervalRef.current);
    }
    
    const captureFrame = async () => {
      try {
        const result = await CameraPreview.captureSample({ quality: 60 });
        if (result?.value) {
          setNativeLiveFrame(`data:image/jpeg;base64,${result.value}`);
        }
      } catch (e) {
        // Ignore frame capture errors
      }
    };
    
    // Capture frames at ~15fps for smooth preview
    captureFrame();
    nativeFrameIntervalRef.current = window.setInterval(captureFrame, 66);
  }
  
  function stopNativeLiveFrameCapture() {
    if (nativeFrameIntervalRef.current) {
      clearInterval(nativeFrameIntervalRef.current);
      nativeFrameIntervalRef.current = null;
    }
    setNativeLiveFrame(null);
  }
  
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
      setStatusMessage(null);
      setStep(1);
      await waitForNextFrame();

      const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
        let timeoutId: number | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error(label)), ms);
        });
        try {
          return await Promise.race([promise, timeoutPromise]);
        } finally {
          if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
          }
        }
      };
      
      if (isNative) {
        if (!cameraContainerRef.current) {
          setTransientStatus('Camera area not ready');
          setStep(0);
          return;
        }

        // Explicit native permission prompt (reliable on iOS/Android)
        try {
          const perm = await CapacitorCamera.requestPermissions({ permissions: ['camera'] });
          // On iOS/Android, permission key is typically "camera"
          if (perm.camera !== 'granted') {
            setTransientStatus('Camera permission denied');
            setStep(0);
            return;
          }
        } catch (e) {
          console.error('[Camera] Permission request failed', e);
          setTransientStatus('Camera permission required');
          setStep(0);
          return;
        }

        // Make the webview background transparent so the native camera can be behind UI.
        try {
          document.documentElement.style.background = 'transparent';
          document.body.style.background = 'transparent';
          const root = document.getElementById('root');
          if (root) root.style.background = 'transparent';

          const ionApp = document.querySelector('ion-app') as HTMLElement | null;
          if (ionApp) ionApp.style.background = 'transparent';
        } catch {}

        // Wait for layout to settle before reading coordinates.
        // iOS frequently returns x/y=0 or tiny sizes if called too early.
        await new Promise(resolve => setTimeout(resolve, 120));

        // For native platforms, keep the preview full-screen behind the WebView.
        // The circular preview is purely a UI overlay so Android and iOS look identical.
        const vv = window.visualViewport;
        const viewportWidth = Math.round(vv?.width ?? window.innerWidth);
        const viewportHeight = Math.round(vv?.height ?? window.innerHeight);
        const x = 0;
        const y = 0;
        
        // Native mobile camera
        console.log('[Camera] Scroll Y:', window.scrollY);
        console.log('[Camera] Window size:', window.innerWidth, window.innerHeight);
        
        const previewOptions = {
          position: "front",
          parent: "cameraPreview",
          className: "camera-feed",
          disableAudio: true,
          width: viewportWidth,
          height: viewportHeight,
          x,
          y,
          toBack: true,
          enableHighResolution: true,
          iosFillSpace: true
        } as CameraPreviewOptions as any;
        
        console.log('[Camera] Starting preview with options:', previewOptions);
        
        await CameraPreview.stop().catch(() => {});
        await withTimeout(CameraPreview.start(previewOptions), 4500, 'Camera start timed out');
        
        console.log('[Camera] Preview started successfully');
        
        // Start live frame capture to show in img tag (more reliable than transparency)
        startNativeLiveFrameCapture();
        
        // Start detection on native after camera starts
        await waitForNextFrame();
        startFaceDetection();
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
      setTransientStatus('Camera permission required');
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
        setTransientStatus(angle === 'left' ? 'Turn left more' : 'Turn right more');
        setIsLoading(false);
        return;
      }
      
      if (isNative) {
        // Native mobile capture
        const result = await CameraPreview.capture({ quality: 90 });
        base64 = result.value;
      } else {
        // Web browser capture (save unmirrored image)
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
          stopNativeLiveFrameCapture();
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
        const frame = getUnmirroredCanvas(videoRef.current, DETECTION_SIZE);
        if (!frame) return false;
        const currentAngle = await detectFaceAngleFromElement(frame);
        const uiAngle = normalizeAngleForUi(currentAngle);
        return uiAngle === angle;
      }

      const sample = await CameraPreview.captureSample({ quality: 90 });
      if (!sample.value) return false;
      const imageElement = await loadImageFromBase64(sample.value);
      const currentAngle = await detectFaceAngleFromElement(imageElement);
      const uiAngle = normalizeAngleForUi(currentAngle);
      return uiAngle === angle;
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
      .detectSingleFace(
        element,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: DETECTION_SIZE,
          scoreThreshold: 0.02
        })
      )
      .withFaceLandmarks(true);

    if (!detection) return null;
    const nose = detection.landmarks.getNose();
    const nosePoint = nose[Math.floor(nose.length / 2)];
    const frameWidth = getElementWidth(element);
    if (!frameWidth) return null;

    const ratio = nosePoint.x / frameWidth;
    // Simple, stable rule based on nose X position.
    // Front: 45%–55%, Left: <40%, Right: >60%
    if (ratio < 0.40) return 'left';
    if (ratio > 0.60) return 'right';
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

  // The <video> element is mirrored via CSS for selfie UX, but its pixel data is not.
  // Draw without flipping so detection/capture are based on unmirrored pixels.
  function getUnmirroredCanvas(video: HTMLVideoElement, size = CAMERA_SIZE) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, size, size);
    return canvas;
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
        setVerificationResult('success');
        setStep(5);
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
          detectionIntervalRef.current = null;
        }
        if (isNative) {
          stopNativeLiveFrameCapture();
          await CameraPreview.stop().catch(() => {});
        } else if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        if (onVerified) {
          onVerified();
        } else {
          alert("✅ Face verified! You can now complete your registration.");
        }
      } else {
        setVerificationResult('duplicate');
        alert("⚠️ Duplicate account detected! This face is already registered.");
        resetVerification();
      }
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
    setVerificationResult('none');
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    if (isNative) {
      stopNativeLiveFrameCapture();
      CameraPreview.stop().catch(() => {});
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }
  async function getNativeFrame(): Promise<HTMLImageElement | null> {
    try {
      const result = await CameraPreview.captureSample({ quality: 30 });
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = result.value;
      });
    } catch (error) {
      console.error('Failed to capture frame:', error);
      return null;
    }
  }

  function startFaceDetection() {
    if (!faceApiReady) return;
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }

    setDetectionLagging(false);

    const resetDetectionLag = () => {
      detectionLagRef.current = null;
      setDetectionLagging(false);
    };

    const registerDetectionFailure = () => {
      if (detectionLagRef.current === null) {
        detectionLagRef.current = Date.now();
        return;
      }
      if (Date.now() - detectionLagRef.current >= DETECTION_TIMEOUT_MS) {
        setDetectionLagging(true);
      }
    };

    const checkFrame = async () => {
      // Prevent overlapping captures
      if (isDetecting.current || !faceApiReady) return;
      
      isDetecting.current = true;
      try {
        let frame: HTMLCanvasElement | HTMLImageElement | null = null;
        
        if (isNative) {
          // Native: capture frame from CameraPreview
          frame = await getNativeFrame();
        } else {
          // Web: use video element
          if (!videoRef.current) return;
          frame = getUnmirroredCanvas(videoRef.current, DETECTION_SIZE);
        }
        
        if (!frame) return;
        const currentAngle = await detectFaceAngleFromElement(frame);
        const uiAngle = normalizeAngleForUi(currentAngle);
        const hasFace = uiAngle !== null;
        setIsFaceDetected(hasFace);
        if (hasFace) {
          resetDetectionLag();
          setFaceAngleCorrect(uiAngle === getCurrentRequiredAngle());
        } else {
          registerDetectionFailure();
          setFaceAngleCorrect(false);
        }
      } catch (error) {
        console.error('Face detection error', error);
        registerDetectionFailure();
        setIsFaceDetected(false);
        setFaceAngleCorrect(false);
      } finally {
        isDetecting.current = false;
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
          {/* Hidden native camera container - CameraPreview needs a parent element */}
          {isNative && (
            <div
              id="cameraPreview"
              ref={cameraContainerRef}
              style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', zIndex: -9999 }}
            />
          )}

          {/* Circular UI overlay (used on both native and web so they match). */}
          <div className="relative mx-auto" style={{ width: CAMERA_SIZE, height: CAMERA_SIZE }}>
            {/* Native: show live camera frames in img tag for reliable display */}
            {isNative && (
              <div
                className="rounded-full overflow-hidden border-4 border-white/40 shadow-2xl bg-black"
                style={{
                  width: CAMERA_SIZE,
                  height: CAMERA_SIZE,
                  position: 'relative',
                  margin: '0 auto',
                  borderRadius: '50%'
                }}
              >
                {nativeLiveFrame ? (
                  <img
                    src={nativeLiveFrame}
                    alt="Camera preview"
                    className="w-full h-full object-cover rounded-full"
                    style={{
                      transform: 'scaleX(-1)',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%'
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CameraIcon className="w-12 h-12 text-white/50 animate-pulse" />
                  </div>
                )}
              </div>
            )}

            {/* Web browser video element lives inside the circle */}
            {!isNative && (
              <div
                id="cameraPreview"
                ref={cameraContainerRef}
                className="camera-feed rounded-full overflow-hidden border-4 border-white/40 shadow-2xl bg-black"
                style={{
                  width: CAMERA_SIZE,
                  height: CAMERA_SIZE,
                  position: 'relative',
                  margin: '0 auto',
                  borderRadius: '50%',
                  overflow: 'hidden'
                }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover rounded-full"
                  style={{
                    transform: 'scaleX(-1)',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    zIndex: 1
                  }}
                />
              </div>
            )}
              
            {/* Loading state while camera initializes */}
            {isLoading && step === 1 && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full" style={{ zIndex: 30, backgroundColor: 'rgba(0,0,0,0.35)' }}>
                <div className="text-center text-white">
                  <CameraIcon className="w-12 h-12 mx-auto mb-2 animate-pulse" />
                  <p className="text-sm">Loading camera...</p>
                </div>
              </div>
            )}

            {/* Circular frame (always visible, matches iOS look) - NOT for native as it blocks transparency */}
            {!isNative && (
              <div className="absolute inset-0 rounded-full border-4 border-white/40 shadow-2xl pointer-events-none" style={{ zIndex: 5 }} />
            )}

            {/* Face outline guide */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
              <div className="w-48 h-64 border-2 border-white/60 rounded-full"></div>
            </div>

            {/* Instruction overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ zIndex: 20 }}>
              <div className="bg-black/30 px-6 py-2 rounded-full backdrop-blur-sm">
                <p className="text-white/90 font-normal text-sm tracking-wide">{getInstructionText()}</p>
              </div>
              {statusMessage && (
                <div className="mt-3 bg-black/40 px-4 py-2 rounded-full">
                  <p className="text-white text-sm font-medium">{statusMessage}</p>
                </div>
              )}
              {!isNative && detectionLagging && (
                <div className="mt-3 bg-blue-500/80 px-4 py-2 rounded-full">
                  <p className="text-white text-sm font-medium">Hold still for a moment—we're finding your face</p>
                </div>
              )}
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

        {verificationResult === 'success' && (
          <div className="mt-4 text-center">
            <p className="text-sm text-white/90">Verified — you can continue.</p>
          </div>
        )}
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
  const isVerified = step === 5;
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
      case 5:
        return {
          label: "Verified",
          loadingLabel: "Verified",
          action: () => {},
          icon: <CheckCircle2 className="mr-2 h-5 w-5" />
        };
      default:
        return {
          label: "Start Verification",
          loadingLabel: "Starting Camera...",
          action: startCamera,
          icon: <CameraIcon className="mr-2 h-5 w-5" />
        };
    }
  };

  const config = getConfig();

  return (
    <Button
      onClick={config.action}
      disabled={isLoading || isCaptureDisabled || isVerified}
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
