import { useState, useEffect, useRef } from "react";
import { CameraPreview } from '@capacitor-community/camera-preview';
import type { CameraPreviewOptions } from '@capacitor-community/camera-preview';
import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera } from '@capacitor/camera';
import * as faceapi from '@vladmandic/face-api';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera as CameraIcon, CheckCircle2 } from "lucide-react";

type FaceVerificationProps = {
  onVerified?: () => void;
};

type Angle = 'front' | 'left' | 'right' | null;

const CAMERA_SIZE = 280;
const DETECTION_SIZE = 416;
const DETECTION_TIMEOUT_MS = 2000;
const DETECTION_INTERVAL_MS = 1200; // slower loop, less CPU

export default function FaceVerification({ onVerified }: FaceVerificationProps) {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [faceAngleCorrect, setFaceAngleCorrect] = useState(false);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [verificationResult, setVerificationResult] = useState<'none' | 'success' | 'duplicate'>('none');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [detectionLagging, setDetectionLagging] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);
  const isDetecting = useRef<boolean>(false);
  const detectionLagRef = useRef<number | null>(null);

  const isNative = Capacitor.isNativePlatform();

  // Native live preview via <img>
  const [nativeLiveFrame, setNativeLiveFrame] = useState<string | null>(null);
  const nativeFrameIntervalRef = useRef<number | null>(null);

  const waitForNextFrame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  // ✅ IMPORTANT:
  // Preview (what user sees) is mirrored like a selfie.
  // Detection runs on unmirrored pixels.
  // So we ALWAYS invert left/right when mapping detection → UI instructions.
  const normalizeAngleForUi = (angle: Angle): Angle => {
    if (!angle) return null;
    if (angle === 'left') return 'right';
    if (angle === 'right') return 'left';
    return angle; // 'front'
  };

  const setTransientStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 1800);
  };

  // Load face-api models once
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
    return () => {
      mounted = false;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDetectionLoop();
      stopNativeLiveFrameCapture();
      if (isNative) {
        CameraPreview.stop().catch(() => {});
      } else if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isNative]);

  // Native live frame capture for preview only (NOT used for detection)
  function startNativeLiveFrameCapture() {
    if (nativeFrameIntervalRef.current) {
      clearInterval(nativeFrameIntervalRef.current);
      nativeFrameIntervalRef.current = null;
    }

    const captureFrame = async () => {
      try {
        const result = await CameraPreview.captureSample({ quality: 60 });
        if (result?.value) {
          const rawDataUri = result.value.startsWith('data:')
            ? result.value
            : `data:image/jpeg;base64,${result.value}`;

          const img = await loadImageFromDataUri(rawDataUri);
          if (!img.width || !img.height) return;

          // 🔁 Flip ONLY for preview (selfie look)
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0);

          const flipped = canvas.toDataURL('image/jpeg', 0.8);
          setNativeLiveFrame(flipped);
        }
      } catch {
        // ignore preview frame errors
      }
    };

    captureFrame();
    nativeFrameIntervalRef.current = window.setInterval(captureFrame, 70);
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
    right: null,
  });

  function getImageSrc(value: string | null): string | null {
    if (!value) return null;
    return value.startsWith('data:') ? value : `data:image/jpeg;base64,${value}`;
  }

  // 🎥 Start camera (native or web)
  async function startCamera() {
    try {
      setIsLoading(true);
      setStatusMessage(null);
      setStep(1);
      await waitForNextFrame();

      const withTimeout = async <T,>(
        promise: Promise<T>,
        ms: number,
        label: string
      ): Promise<T> => {
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

        // Permissions
        try {
          const perm = await CapacitorCamera.requestPermissions({
            permissions: ['camera'],
          });
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

        // No need to fully rely on transparent webview for preview anymore,
        // we use sample frames in an <img>, but we keep toBack for native.
        await new Promise((resolve) => setTimeout(resolve, 120));

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
          iosFillSpace: true,
        } as any;

        await CameraPreview.stop().catch(() => {});
        await withTimeout(
          CameraPreview.start(previewOptions),
          4500,
          'Camera start timed out'
        );

        startNativeLiveFrameCapture();
        await waitForNextFrame();
        startFaceDetection();
      } else {
        // Web
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: CAMERA_SIZE },
            height: { ideal: CAMERA_SIZE },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          await videoRef.current.play();
          startFaceDetection();
        }
      }
    } catch (error) {
      console.error('Camera error:', error);
      setTransientStatus('Camera permission required');
      setStep(0);
    } finally {
      setIsLoading(false);
    }
  }

  // 📸 Capture still image ONLY when face + angle are correct
  async function takePicture(angle: "front" | "left" | "right") {
    try {
      setIsLoading(true);

      const isOrientationValid = await ensureRequiredAngle(angle);
      if (!isOrientationValid) {
        setTransientStatus(
          angle === 'left' ? 'Turn your head more left' : 'Turn your head more right'
        );
        setIsLoading(false);
        return;
      }

      let base64 = "";

      if (isNative) {
        const result = await CameraPreview.capture({ quality: 90 });
        base64 = result.value;
      } else {
        if (videoRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = CAMERA_SIZE;
          canvas.height = CAMERA_SIZE;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Draw raw pixels (not mirrored) for storage (backend doesn’t care about flip)
            ctx.drawImage(videoRef.current, 0, 0, CAMERA_SIZE, CAMERA_SIZE);
            base64 = canvas.toDataURL('image/jpeg', 0.9);
          }
        }
      }

      setImages((prev) => ({ ...prev, [angle]: base64 }));

      if (angle === "front") setStep(2);
      if (angle === "left") setStep(3);
      if (angle === "right") {
        // Done capturing all angles
        if (isNative) {
          stopNativeLiveFrameCapture();
          await CameraPreview.stop().catch(() => {});
        } else if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        stopDetectionLoop();
        setStep(4);
      }
    } catch (error) {
      console.error('Capture error:', error);
      alert('Failed to capture photo. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // ✅ Ensure user is actually at the required angle before capture
  async function ensureRequiredAngle(angle: "front" | "left" | "right") {
    if (!faceApiReady) return true; // don't block if ML isn't ready

    try {
      let frame: HTMLCanvasElement | null = null;

      if (isNative) {
        frame = await getNativeFrame();
      } else {
        if (!videoRef.current) return false;
        frame = getUnmirroredCanvas(videoRef.current, DETECTION_SIZE);
      }

      if (!frame) return true; // don't hard fail

      const detectedAngle = await detectFaceAngleFromElement(frame);
      const uiAngle = normalizeAngleForUi(detectedAngle);

      if (!uiAngle) return true;

      // Accept also front if user is between front & side
      if (angle === 'left') {
        return uiAngle === 'left' || uiAngle === 'front';
      }
      if (angle === 'right') {
        return uiAngle === 'right' || uiAngle === 'front';
      }
      return true; // front is always fine
    } catch (error) {
      console.error('[Camera] Orientation validation failed', error);
      return false;
    }
  }

  // 🔍 Core face + angle detection logic
  async function detectFaceAngleFromElement(
    element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
  ): Promise<Angle> {
    if (!faceApiReady) return null;

    const detection = await faceapi
      .detectSingleFace(
        element,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 224,        // smaller, faster
          scoreThreshold: 0.1,   // slightly stricter, less noise
        })
      )
      .withFaceLandmarks(true);

    if (!detection) return null;
    const nose = detection.landmarks.getNose();
    const nosePoint = nose[Math.floor(nose.length / 2)];
    const frameWidth = getElementWidth(element);
    if (!frameWidth) return null;

    const ratio = nosePoint.x / frameWidth;
    // Looser: front = wider zone, left/right only when clearly off-center
    if (ratio < 0.30) return 'left';
    if (ratio > 0.70) return 'right';
    return 'front';
  }

  function getElementWidth(
    element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
  ) {
    if (element instanceof HTMLVideoElement) {
      return element.videoWidth || element.clientWidth;
    }
    if (element instanceof HTMLImageElement) {
      return element.naturalWidth || element.width;
    }
    return element.width;
  }

  async function loadImageFromDataUri(dataUri: string) {
    return new Promise<HTMLImageElement>((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
      img.src = dataUri;
    });
  }

  // For detection, we want **unmirrored** pixel data from <video>
  function getUnmirroredCanvas(video: HTMLVideoElement, size = CAMERA_SIZE) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, size, size);
    return canvas;
  }

  // For native detection, we also want unflipped pixels
  async function getNativeFrame(): Promise<HTMLCanvasElement | null> {
    try {
      const result = await CameraPreview.captureSample({
        quality: 90,
      });

      if (!result?.value) return null;

      const src = result.value.startsWith('data:')
        ? result.value
        : `data:image/jpeg;base64,${result.value}`;

      const img = await loadImageFromDataUri(src);
      if (!img.width || !img.height) return null;

      // Upscale to DETECTION_SIZE (no crop, no flip)
      const canvas = document.createElement('canvas');
      canvas.width = DETECTION_SIZE;
      canvas.height = DETECTION_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(img, 0, 0, DETECTION_SIZE, DETECTION_SIZE);
      return canvas;
    } catch (error) {
      console.error('[Detection] Failed to capture frame:', error);
      return null;
    }
  }

  function stopDetectionLoop() {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    isDetecting.current = false;
    detectionLagRef.current = null;
    setDetectionLagging(false);
  }

  // 🎯 Real-time detection loop (like Tinder’s green outline)
  function startFaceDetection() {
    if (!faceApiReady) return;    if (step < 1 || step > 3) return; // no need to detect outside capture flow
    stopDetectionLoop(); // reset everything

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
      if (isDetecting.current || !faceApiReady) return;
      isDetecting.current = true;

      try {
        if (isNative) {
          await new Promise((res) => setTimeout(res, 80));
        }

        let frame: HTMLCanvasElement | HTMLImageElement | null = null;

        if (isNative) {
          frame = await getNativeFrame();
        } else {
          if (!videoRef.current) return;
          frame = getUnmirroredCanvas(videoRef.current, DETECTION_SIZE);
        }

        if (!frame) {
          registerDetectionFailure();
          setIsFaceDetected(false);
          setFaceAngleCorrect(false);
          return;
        }

        const angle = await detectFaceAngleFromElement(frame);
        const uiAngle = normalizeAngleForUi(angle);
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
    detectionIntervalRef.current = window.setInterval(
      checkFrame,
      DETECTION_INTERVAL_MS
    );
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

  async function submit() {
    try {
      setIsLoading(true);

      const tempUserId = `temp_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const { data, error } = await supabase.functions.invoke("face-verify", {
        body: {
          front: images.front,
          left: images.left,
          right: images.right,
          userId: tempUserId,
        },
      });

      if (error) {
        alert("❌ Verification failed: " + error.message);
        return;
      }

      if (data.success) {
        setVerificationResult('success');
        setStep(5);
        stopDetectionLoop();
        if (isNative) {
          stopNativeLiveFrameCapture();
          await CameraPreview.stop().catch(() => {});
        } else if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
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
    setStatusMessage(null);
    setDetectionLagging(false);

    stopDetectionLoop();
    stopNativeLiveFrameCapture();

    if (isNative) {
      CameraPreview.stop().catch(() => {});
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  const captureOrder: Array<{ key: keyof typeof images; label: string }> = [
    { key: 'front', label: 'Front' },
    { key: 'left', label: 'Left' },
    { key: 'right', label: 'Right' },
  ];

  return (
    <div className="space-y-4">
      {/* Live Video Preview - Circular Camera Feed (Like Tinder) */}
      {step > 0 && step < 4 && (
        <div className="space-y-4 animate-fade-in">
          {/* Hidden native container required by CameraPreview */}
          {isNative && (
            <div
              id="cameraPreview"
              ref={cameraContainerRef}
              style={{
                position: 'fixed',
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: 'none',
                zIndex: -9999,
              }}
            />
          )}

          <div
            className="relative mx-auto"
            style={{ width: CAMERA_SIZE, height: CAMERA_SIZE }}
          >
            {/* Native preview via <img> */}
            {isNative && (
              <div
                className="rounded-full overflow-hidden border-4 border-white/40 shadow-2xl bg-black"
                style={{
                  width: CAMERA_SIZE,
                  height: CAMERA_SIZE,
                  position: 'relative',
                  margin: '0 auto',
                  borderRadius: '50%',
                }}
              >
                {nativeLiveFrame ? (
                  <img
                    src={nativeLiveFrame}
                    alt="Camera preview"
                    className="w-full h-full object-cover rounded-full"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CameraIcon className="w-12 h-12 text-white/50 animate-pulse" />
                  </div>
                )}
              </div>
            )}

            {/* Web preview via <video>, mirrored for selfie UX */}
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
                  overflow: 'hidden',
                }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover rounded-full"
                  style={{
                    transform: 'scaleX(-1)', // mirror preview ONLY
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    zIndex: 1,
                  }}
                />
              </div>
            )}

            {/* Loading state */}
            {isLoading && step === 1 && (
              <div
                className="absolute inset-0 flex items-center justify-center rounded-full"
                style={{
                  zIndex: 30,
                  backgroundColor: 'rgba(0,0,0,0.35)',
                }}
              >
                <div className="text-center text-white">
                  <CameraIcon className="w-12 h-12 mx-auto mb-2 animate-pulse" />
                  <p className="text-sm">Loading camera...</p>
                </div>
              </div>
            )}

            {/* Face outline */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 10 }}
            >
              <div className="w-48 h-64 border-2 border-white/60 rounded-full" />
            </div>

            {/* Instruction + status chips */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
              style={{ zIndex: 20 }}
            >
              <div className="bg-black/30 px-6 py-2 rounded-full backdrop-blur-sm">
                <p className="text-white/90 font-normal text-sm tracking-wide">
                  {getInstructionText()}
                </p>
              </div>

              {statusMessage && (
                <div className="mt-3 bg-black/40 px-4 py-2 rounded-full">
                  <p className="text-white text-sm font-medium">
                    {statusMessage}
                  </p>
                </div>
              )}

              {detectionLagging && (
                <div className="mt-3 bg-blue-500/80 px-4 py-2 rounded-full">
                  <p className="text-white text-sm font-medium">
                    Hold still for a moment — we&apos;re finding your face
                  </p>
                </div>
              )}

              {!isFaceDetected && !detectionLagging && (
                <div className="mt-3 bg-red-500/80 px-4 py-2 rounded-full">
                  <p className="text-white text-sm font-medium">
                    No face detected
                  </p>
                </div>
              )}

              {isFaceDetected && !faceAngleCorrect && (
                <div className="mt-3 bg-yellow-500/80 px-4 py-2 rounded-full">
                  <p className="text-white text-sm font-medium">
                    Adjust position
                  </p>
                </div>
              )}

              {isFaceDetected && faceAngleCorrect && (
                <div className="mt-3 bg-green-500/80 px-4 py-2 rounded-full">
                  <p className="text-white text-sm font-medium">✓ Ready</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Thumbnails */}
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
                  <span className="text-[10px] uppercase text-white/50 tracking-widest">
                    {label}
                  </span>
                )}
              </div>
              <p className="text-[10px] uppercase text-white/60 tracking-widest">
                {images[key] ? 'Captured' : 'Pending'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Main action button */}
      <div className="mt-6">
        <ActionButton
          step={step}
          isLoading={isLoading}
          isFaceDetected={isFaceDetected}
          faceAngleCorrect={faceAngleCorrect}
          startCamera={startCamera}
          takePicture={takePicture}
          submit={submit}
        />

        {verificationResult === 'success' && (
          <div className="mt-4 text-center">
            <p className="text-sm text-white/90">
              Verified — you can continue.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type ActionButtonProps = {
  step: number;
  isLoading: boolean;
  isFaceDetected: boolean;
  faceAngleCorrect: boolean;
  startCamera: () => Promise<void>;
  takePicture: (angle: "front" | "left" | "right") => Promise<void>;
  submit: () => Promise<void>;
};

function ActionButton({
  step,
  isLoading,
  isFaceDetected,
  faceAngleCorrect,
  startCamera,
  takePicture,
  submit,
}: ActionButtonProps) {
  const isCaptureStep = step > 0 && step < 4;
  // Only disable if NO face, not if angle is slightly off
  const isCaptureDisabled = isCaptureStep && !isFaceDetected;
  const isVerified = step === 5;

  const getConfig = () => {
    switch (step) {
      case 1:
        return {
          label: "Capture Photo",
          loadingLabel: "Capturing...",
          action: () => takePicture("front"),
          icon: null as JSX.Element | null,
        };
      case 2:
        return {
          label: "Capture Photo",
          loadingLabel: "Capturing...",
          action: () => takePicture("left"),
          icon: null as JSX.Element | null,
        };
      case 3:
        return {
          label: "Capture Photo",
          loadingLabel: "Capturing...",
          action: () => takePicture("right"),
          icon: null as JSX.Element | null,
        };
      case 4:
        return {
          label: "Submit for Verification",
          loadingLabel: "Verifying...",
          action: submit,
          icon: <CheckCircle2 className="mr-2 h-5 w-5" />,
        };
      case 5:
        return {
          label: "Verified",
          loadingLabel: "Verified",
          action: () => {},
          icon: <CheckCircle2 className="mr-2 h-5 w-5" />,
        };
      default:
        return {
          label: "Start Verification",
          loadingLabel: "Starting Camera...",
          action: startCamera,
          icon: <CameraIcon className="mr-2 h-5 w-5" />,
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
