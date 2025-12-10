/**
 * FaceScanner Component
 * Captures live face scan from user's camera for verification
 */

import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { loadFaceModels } from '@/utils/faceModels';
import { FaceDescriptor } from '@/utils/faceComparison';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const POSE_STEPS = [
  { key: 'center', label: 'Look straight ahead', prompt: 'Center your face in the frame.' },
  { key: 'left', label: 'Turn slightly left', prompt: 'Slowly rotate your head to the left.' },
  { key: 'right', label: 'Turn slightly right', prompt: 'Now rotate your head to the right.' }
] as const;

type PoseKey = typeof POSE_STEPS[number]['key'];
type PoseSnapshots = Partial<Record<PoseKey, string>>;

const MAX_FAILED_ATTEMPTS_BEFORE_SKIP = 3;

// Average descriptors to keep API contract unchanged while using three angles
function averageDescriptors(descriptors: FaceDescriptor[]): FaceDescriptor {
  if (!descriptors.length) {
    throw new Error('No descriptors available to average');
  }

  const length = descriptors[0].length;
  const averaged = new Float32Array(length);

  descriptors.forEach(desc => {
    for (let i = 0; i < length; i += 1) {
      averaged[i] += desc[i];
    }
  });

  for (let i = 0; i < length; i += 1) {
    averaged[i] /= descriptors.length;
  }

  return averaged;
}

function captureSnapshot(video: HTMLVideoElement): string | null {
  if (!video.videoWidth || !video.videoHeight) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

interface FaceScannerProps {
  onScanComplete: (descriptor: FaceDescriptor) => void;
  onSkip?: () => void;
}

export const FaceScanner: React.FC<FaceScannerProps> = ({ onScanComplete, onSkip }) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [initAttempts, setInitAttempts] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [poseIndex, setPoseIndex] = useState(0);
  const [poseSnapshots, setPoseSnapshots] = useState<PoseSnapshots>({});
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [poseArmed, setPoseArmed] = useState(true);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const faceDetectedTimeRef = useRef<number | null>(null);
  const modelsReadyRef = useRef(false);
  const descriptorsRef = useRef<FaceDescriptor[]>([]);
  const poseArmedRef = useRef(true);
  const currentPose = POSE_STEPS[Math.min(poseIndex, POSE_STEPS.length - 1)];
  const skipUnlocked = failedAttempts >= MAX_FAILED_ATTEMPTS_BEFORE_SKIP || initAttempts >= MAX_FAILED_ATTEMPTS_BEFORE_SKIP;
  const canShowSkipButton = Boolean(onSkip && skipUnlocked);

  const setPoseArmedState = (value: boolean) => {
    poseArmedRef.current = value;
    setPoseArmed(value);
  };

  const armCurrentPose = () => {
    faceDetectedTimeRef.current = null;
    setCountdown(null);
    setFaceDetected(false);
    setPoseArmedState(true);
  };

  const renderPosePreview = (pose: typeof POSE_STEPS[number], index: number) => {
    const snapshot = poseSnapshots[pose.key];
    const isCurrent = index === poseIndex;
    const isCaptured = Boolean(snapshot);
    const poseState = isCaptured
      ? 'complete'
      : isCurrent && poseArmed
      ? 'active'
      : isCurrent
      ? 'waiting'
      : 'pending';
    const cardTone =
      poseState === 'complete'
        ? 'border-green-500 bg-green-50 text-green-800'
        : poseState === 'active'
        ? 'border-blue-500 bg-blue-50 text-blue-800'
        : poseState === 'waiting'
        ? 'border-amber-400 bg-amber-50 text-amber-800'
        : 'border-gray-200 bg-white text-gray-600';
    const statusLabel =
      poseState === 'complete'
        ? 'Captured'
        : poseState === 'active'
        ? 'Capturing'
        : poseState === 'waiting'
        ? 'Rotate & tap Ready'
        : 'Upcoming';

    return (
      <div key={pose.key} className={`rounded-lg border p-2 text-center text-xs transition ${cardTone}`}>
        <p className="font-semibold uppercase tracking-wide">{pose.label}</p>
        <p className="mt-1 text-[11px] opacity-80">{pose.prompt}</p>
        <div className="mt-2 aspect-[4/3] w-full overflow-hidden rounded-md bg-white/70">
          {snapshot ? (
            <img
              src={snapshot}
              alt={`${pose.label} snapshot`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px]">
              {poseState === 'pending'
                ? 'Waiting…'
                : poseState === 'waiting'
                ? 'Rotate now'
                : 'Capturing…'}
            </div>
          )}
        </div>
        <p className="mt-1 font-semibold text-[11px]">{statusLabel}</p>
      </div>
    );
  };

  // Initialize camera and load models
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        setError(null);
        setInitAttempts(prev => prev + 1);
        setPoseIndex(0);
        setPoseSnapshots({});
        setFailedAttempts(0);
        armCurrentPose();
        descriptorsRef.current = [];

        console.log(`🎥 Starting camera initialization (attempt ${initAttempts + 1})...`);
        console.log('📱 Environment:', {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          mediaDevices: !!navigator.mediaDevices,
          getUserMedia: !!(navigator.mediaDevices?.getUserMedia),
          origin: window.location.origin,
          href: window.location.href
        });

        // Load face recognition models
        console.log('📦 Loading face recognition models...');
        await loadFaceModels();
        
        if (!mounted) return;
        modelsReadyRef.current = true;
        setModelsReady(true);
        console.log('✅ Face models loaded successfully');

        // Request camera access with iOS-compatible constraints
        console.log('📸 Requesting camera access...');
        const constraints = {
          video: {
            facingMode: 'user'
          },
          audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('✅ Camera stream obtained');

        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          const video = videoRef.current;
          
          // Set attributes for iOS compatibility
          video.setAttribute('autoplay', 'true');
          video.setAttribute('playsinline', 'true');
          video.setAttribute('muted', 'true');
          video.srcObject = stream;

          // Wait for video to be ready
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Video load timeout'));
            }, 15000);

            video.onloadedmetadata = async () => {
              clearTimeout(timeout);
              console.log('📹 Video metadata loaded');
              
              try {
                await video.play();
                console.log('▶️ Video playing');
                
                if (mounted) {
                  setLoading(false);
                  console.log('🎬 Starting face detection');
                  startFaceDetection();
                }
                resolve();
              } catch (playErr) {
                console.error('Play error:', playErr);
                reject(playErr);
              }
            };

            video.onerror = (err) => {
              clearTimeout(timeout);
              console.error('Video error:', err);
              reject(err);
            };
          });
        }
      } catch (err: any) {
        if (!mounted) return;
        
        console.error('❌ Error initializing camera:', err);
        
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera access denied. Please allow camera in Settings, or tap Skip to continue without face verification.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('No camera found. If you\'re on a device without a camera, tap Skip to continue.');
        } else if (err.message?.includes('timeout')) {
          setError('Camera timed out. Try the Retry button below, or tap Skip to continue.');
        } else if (err.message?.includes('models') || err.message?.includes('load')) {
          setError('Failed to load face recognition. Check your internet connection and retry, or tap Skip.');
        } else {
          setError(`Camera error: ${err.message || 'Unknown'}. Try Retry below, or tap Skip to continue.`);
        }
        
        setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
      stopCamera();
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [retryKey]);


  // Stop camera and cleanup
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Continuous face detection for visual feedback
  const startFaceDetection = async () => {
    if (!videoRef.current || !canvasRef.current) {
      console.error('❌ Cannot start detection: video or canvas not ready');
      return;
    }

    console.log('🎬 Face detection loop starting...');

    const detectFace = async () => {
      if (!videoRef.current || !canvasRef.current || !modelsReadyRef.current) {
        requestAnimationFrame(detectFace);
        return;
      }

      if (scanning || !poseArmedRef.current) {
        requestAnimationFrame(detectFace);
        return;
      }

      try {
        const detection = await faceapi
          .detectSingleFace(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions({
              inputSize: 256,
              scoreThreshold: 0.4,
            })
          )
          .withFaceLandmarks(true);

        const canvas = canvasRef.current;
        const displaySize = {
          width: videoRef.current.videoWidth,
          height: videoRef.current.videoHeight
        };

        canvas.width = displaySize.width;
        canvas.height = displaySize.height;

        faceapi.matchDimensions(canvas, displaySize);
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);

        if (detection) {
          console.log('✔ FACE FOUND');
          setFaceDetected(true);
          const resizedDetection = faceapi.resizeResults(detection, displaySize);
          faceapi.draw.drawDetections(canvas, [resizedDetection]);
          faceapi.draw.drawFaceLandmarks(canvas, [resizedDetection]);

          // Start countdown if face just detected
          if (faceDetectedTimeRef.current === null && !scanning && poseArmedRef.current) {
            console.log('⏱️ Starting 3 second countdown...');
            faceDetectedTimeRef.current = Date.now();
            setCountdown(3);
            
            // Countdown timer
            let count = 3;
            const timer = setInterval(() => {
              count--;
              console.log(`Countdown: ${count}`);
              setCountdown(count);
              if (count === 0) {
                clearInterval(timer);
                captureFace();
              }
            }, 1000);
            countdownTimerRef.current = timer;
          }
        } else {
          console.log('❌ NO FACE');
          setFaceDetected(false);
          // Reset countdown if face lost
          if (faceDetectedTimeRef.current !== null) {
            console.log('😕 Face lost, resetting countdown');
            faceDetectedTimeRef.current = null;
            setCountdown(null);
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }
          }
        }
      } catch (err) {
        console.error('❌ Face detection error:', err);
      }

      // Continue detection loop - CRITICAL: Always continue
      requestAnimationFrame(detectFace);
    };

    // Start the loop
    detectFace();
  };

  // Capture face descriptor
  const captureFace = async () => {
    if (!videoRef.current || scanning) return;

    setScanning(true);
    setError(null);
    setCountdown(null);
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    try {
      console.log('📸 Capturing face descriptor...');
      const detection = await faceapi
        .detectSingleFace(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 256,
            scoreThreshold: 0.4,
          })
        )
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        setError('Face lost. Please look at camera and hold still.');
        setScanning(false);
        faceDetectedTimeRef.current = null;
        setFailedAttempts(prev => prev + 1);
        return;
      }

      const snapshot = captureSnapshot(videoRef.current);
      if (snapshot) {
        setPoseSnapshots(prev => ({ ...prev, [currentPose.key]: snapshot }));
      }

      descriptorsRef.current.push(detection.descriptor);
      console.log(`✅ Face captured successfully for ${currentPose.label}`);

      const isLastPose = poseIndex >= POSE_STEPS.length - 1;

      if (isLastPose) {
        const averagedDescriptor = averageDescriptors(descriptorsRef.current);
        setScanning(false);
        stopCamera();
        onScanComplete(averagedDescriptor);
        return;
      }

      setPoseIndex(prev => prev + 1);
      faceDetectedTimeRef.current = null;
      setCountdown(null);
      setScanning(false);
      setFaceDetected(false);
      setPoseArmedState(false);
    } catch (err) {
      console.error('Error capturing face:', err);
      setError('Failed to scan face. Please try again.');
      setScanning(false);
      faceDetectedTimeRef.current = null;
      setFailedAttempts(prev => prev + 1);
    }
  };

  // Retry initialization
  const retryInit = () => {
    console.log('🔄 Retrying camera initialization...');
    stopCamera();
    
    // Clean up timers
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    
    // Reset all state
    setError(null);
    setLoading(true);
    setModelsReady(false);
    modelsReadyRef.current = false;
    setFaceDetected(false);
    setScanning(false);
    setPoseIndex(0);
    setPoseSnapshots({});
    setFailedAttempts(0);
    armCurrentPose();
    descriptorsRef.current = [];
    
    // Increment retry key to force useEffect to re-run
    setRetryKey(prev => prev + 1);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <Camera className="w-12 h-12 text-pink-500" />
        </div>
        <CardTitle>Verify Your Face</CardTitle>
        <CardDescription>
          Take a quick selfie to verify your identity and prevent fake profiles
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Video Feed */}
        <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-[4/3]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            webkit-playsinline="true"
            className="w-full h-full object-cover"
            style={{ objectFit: 'cover' }}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-center text-white">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p>Initializing camera...</p>
              </div>
            </div>
          )}

          {/* Face detection indicator */}
          {!loading && !scanning && (
            <div className="absolute top-4 left-4 right-4 space-y-1">
              <p className="text-xs font-semibold tracking-wide text-white/80 uppercase">
                Step {poseIndex + 1} of {POSE_STEPS.length} • {currentPose.label}
              </p>
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  !poseArmed
                    ? 'bg-amber-500/90 text-white'
                    : countdown !== null
                    ? 'bg-green-500/90 text-white'
                    : faceDetected
                    ? 'bg-blue-500/90 text-white'
                    : 'bg-yellow-500/90 text-white'
                }`}
              >
                {!poseArmed ? (
                  <>
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">
                      Turn to {currentPose.key} view, then tap Ready below.
                    </span>
                  </>
                ) : countdown !== null ? (
                  <>
                    <div className="w-5 h-5 flex items-center justify-center font-bold text-lg">
                      {countdown}
                    </div>
                    <span className="text-sm font-medium">
                      Capturing {currentPose.key} in {countdown}...
                    </span>
                  </>
                ) : faceDetected ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Hold still • {currentPose.prompt}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Align your face • {currentPose.prompt}</span>
                  </>
                )}
              </div>
            </div>
          )}
          
          {/* Scanning overlay */}
          {scanning && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-center text-white">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-2" />
                <p className="text-lg font-medium">Processing...</p>
              </div>
            </div>
          )}
        </div>

        {!poseArmed && !scanning && (
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-2">
              Rotate to {currentPose.label.toLowerCase()} and tap Ready when you’re set.
            </p>
            <Button size="sm" onClick={armCurrentPose}>
              Ready for Step {poseIndex + 1}
            </Button>
          </div>
        )}

        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Capture progress</p>
          <div className="grid grid-cols-3 gap-2">
            {POSE_STEPS.map((pose, index) => renderPosePreview(pose, index))}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
              <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">{error}</p>
                <p className="text-xs mt-1 text-red-600">
                  Attempt {initAttempts} • Models: {modelsReady ? '✓' : '✗'} • Camera: ✗
                </p>
              </div>
            </div>
            <Button
              onClick={retryInit}
              variant="outline"
              className="w-full"
              size="sm"
            >
              Retry Camera Initialization
            </Button>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-900 font-semibold mb-1">
            We'll capture three quick angles for better accuracy:
          </p>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            {POSE_STEPS.map((pose, index) => (
              <li key={pose.key}>
                Step {index + 1}: {pose.prompt}
              </li>
            ))}
            <li>Each capture happens automatically after a 3‑second countdown.</li>
            <li>Tap “Ready” for each step after you turn so we only capture when you’re aligned.</li>
            <li>You’ll see each snapshot above so you know it worked.</li>
          </ul>
        </div>

        {/* Action button */}
        {onSkip && (
          <div className="space-y-2">
            {!canShowSkipButton && (
              <p className="text-center text-xs text-gray-500">
                Having trouble? Skip becomes available after three unsuccessful attempts.
              </p>
            )}
            {canShowSkipButton && (
              <Button
                onClick={onSkip}
                variant="outline"
                disabled={scanning}
                size="lg"
                className="w-full"
              >
                Skip Face Verification
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
