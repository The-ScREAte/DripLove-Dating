/**
 * Multi-angle Native Face Scanner Component
 * Guides users through forward, left, and right captures using the native plugin
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FaceScan } from '@/plugins/FaceScan';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Camera,
  CheckCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  RotateCw,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
} from 'lucide-react';
import type { FaceCaptureAngle, MultiAngleFaceDescriptors } from '@/utils/nativeFaceComparison';

export type FaceDescriptor = string;

interface NativeFaceScannerProps {
  onScanComplete: (descriptors: MultiAngleFaceDescriptors) => void;
  onSkip?: () => void;
}

const CAPTURE_STEPS: FaceCaptureAngle[] = ['front', 'left', 'right'];

const STEP_INSTRUCTIONS: Record<FaceCaptureAngle, string> = {
  front: 'Look straight into the camera. Keep your face centered.',
  left: 'Slowly turn your head to the LEFT while keeping eyes on the camera.',
  right: 'Slowly turn your head to the RIGHT while keeping eyes on the camera.',
};

const STEP_LABELS: Record<FaceCaptureAngle, string> = {
  front: 'Center',
  left: 'Left',
  right: 'Right',
};

const STEP_ICONS: Record<FaceCaptureAngle, React.ReactNode> = {
  front: <Camera className="w-5 h-5" />,
  left: <RotateCcw className="w-5 h-5" />,
  right: <RotateCw className="w-5 h-5" />,
};

export const NativeFaceScanner: React.FC<NativeFaceScannerProps> = ({ onScanComplete, onSkip: _onSkip }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [previewActive, setPreviewActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [descriptors, setDescriptors] = useState<Partial<MultiAngleFaceDescriptors>>({});
  const [progressMessage, setProgressMessage] = useState('');
  const [yaw, setYaw] = useState(0);
  const [roll, setRoll] = useState(0);
  const [alignmentGood, setAlignmentGood] = useState(false);
  const [capturingProgress, setCapturingProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureLocked = useRef(false);
  const stepIndexRef = useRef(currentStepIndex);

  // Keep ref in sync with state
  useEffect(() => {
    stepIndexRef.current = currentStepIndex;
  }, [currentStepIndex]);

  // Ensure currentStepIndex never exceeds bounds
  const safeStepIndex = Math.min(currentStepIndex, CAPTURE_STEPS.length - 1);
  const currentAngle = CAPTURE_STEPS[safeStepIndex];
  const isLastStep = safeStepIndex === CAPTURE_STEPS.length - 1;

  const isWeb = typeof window !== 'undefined' ? !window.Capacitor?.isNativePlatform() : false;
  const canPreview = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  const allStepsCompleted = useMemo(
    () => CAPTURE_STEPS.every(angle => Boolean(descriptors[angle])),
    [descriptors]
  );

  // More forgiving thresholds for better UX across all devices
  const FRONT_TOLERANCE = isWeb ? 20 : 10;
  const SIDE_THRESHOLD = isWeb ? 35 : 25;
  const MAX_ROLL = 18;

  const evaluateAlignment = (currentYaw: number, currentRoll: number) => {
    // Use ref for latest step index to avoid stale closure issues
    const angle = CAPTURE_STEPS[stepIndexRef.current];

    let aligned = false;

    if (Math.abs(currentRoll) <= MAX_ROLL) {
      if (angle === 'front' && Math.abs(currentYaw) <= FRONT_TOLERANCE) aligned = true;
      if (angle === 'left' && currentYaw <= -SIDE_THRESHOLD) aligned = true;
      if (angle === 'right' && currentYaw >= SIDE_THRESHOLD) aligned = true;
    }

    setAlignmentGood(aligned);

    if (aligned && !captureLocked.current) {
      captureLocked.current = true;
      setCapturing(true);

      // Start capture after 3 second animation
      setTimeout(() => {
        startCapture();
      }, 3000);
    }
  };

  useEffect(() => {
    checkPermission();
  }, []);

  // Start preview immediately for instant detection (both web and native)
  useEffect(() => {
    if (videoRef.current && !previewActive && hasPermission) {
      setTimeout(() => {
        startPreview();
      }, 10);
    }
  }, [hasPermission]);

  useEffect(() => {
    if (hasPermission && canPreview && !previewActive && !capturing && !loading) {
      startPreview();
    }

    // Never stop preview during capturing or loading on web
    if (!hasPermission && previewActive) {
      stopPreview();
    }
  }, [hasPermission, canPreview, previewActive, capturing, loading]);

  useEffect(() => {
    // Listen for real-time preview updates from native plugin
    const listener = FaceScan.addListener('previewUpdate', ({ yaw, roll }) => {
      setYaw(yaw);
      setRoll(roll);
      evaluateAlignment(yaw, roll);
    });

    return () => {
      listener.then(l => l.remove());
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [capturing]); // Removed currentStepIndex - using ref instead

  const checkPermission = async () => {
    try {
      if (canPreview) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(track => track.stop());
          setHasPermission(true);
        } catch {
          setHasPermission(false);
        }
      } else {
        const result = await FaceScan.hasPermission();
        setHasPermission(result.hasPermission);
      }
    } catch (err) {
      console.error('Permission check failed:', err);
      setHasPermission(false);
    }
  };

  const requestPermission = async () => {
    setLoading(true);
    setError(null);

    try {
      if (canPreview) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(track => track.stop());
          setHasPermission(true);
        } catch (err: any) {
          setError('Camera access denied: ' + err.message);
          setHasPermission(false);
        }
      } else {
        const result = await FaceScan.requestPermission();
        setHasPermission(result.hasPermission);

        if (!result.hasPermission) {
          setError('Camera permission is required for face verification');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to request permission');
    } finally {
      setLoading(false);
    }
  };

  const startPreview = async () => {
    if (!canPreview || previewActive || capturing) return;

    if (!videoRef.current) {
      return;
    }

    try {
      if (isWeb && videoRef.current) {
        // Use MediaPipe FaceMesh for web preview with real-time yaw/roll detection
        await (FaceScan as any).startPreview(videoRef.current);
        setPreviewActive(true);
      } else {
        // Fallback to regular getUserMedia if MediaPipe not available
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setPreviewActive(true);
      }
    } catch (err: any) {
      console.error('Camera preview failed:', err);
      setError('Failed to access camera preview: ' + err.message);
    }
  };

  const stopPreview = () => {
    if (isWeb && (FaceScan as any).stopPreview) {
      (FaceScan as any).stopPreview();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setPreviewActive(false);
  };

  const startCapture = async () => {
    if (canPreview && !previewActive) {
      setError('Camera preview must be active before scanning');
      return;
    }

    setCapturing(true);
    setLoading(true);
    setError(null);
    setProgressMessage(STEP_INSTRUCTIONS[currentAngle]);

    try {
      // ONLY STOP CAMERA ON NATIVE (web needs preview running for MediaPipe)
      if (!isWeb && canPreview && previewActive) {
        await new Promise(resolve => setTimeout(resolve, 150));
        stopPreview();
      }

      const result = await FaceScan.captureDescriptor({ angle: currentAngle });

      if (!result?.descriptor) {
        throw new Error('No descriptor returned.');
      }

      const updatedDescriptors = {
        ...descriptors,
        [currentAngle]: result.descriptor,
      } as Partial<MultiAngleFaceDescriptors>;

      setDescriptors(updatedDescriptors);

      if (isLastStep) {
        const missingAngles = CAPTURE_STEPS.filter(angle => !updatedDescriptors[angle]);

        if (missingAngles.length) {
          throw new Error(`Missing descriptors for: ${missingAngles.join(', ')}`);
        }

        setProgressMessage('✅ All angles captured. Finalizing...');
        onScanComplete(updatedDescriptors as MultiAngleFaceDescriptors);
      } else {
        setProgressMessage('Angle captured. Follow the next instruction.');
        // Add 200ms delay for MediaPipe to settle before next capture
        await new Promise(res => setTimeout(res, 200));
        setCurrentStepIndex(prev => prev + 1);
        // Reset attempts on successful capture
        setAttempts(0);
      }
    } catch (err: any) {
      console.error('Face capture failed:', err);
      setError(err.message || 'Face capture failed. Please try again.');
      setAttempts(prev => prev + 1);
      setProgressMessage('');
    } finally {
      setLoading(false);
      setCapturing(false);
      captureLocked.current = false;

      // WEB MUST KEEP PREVIEW RUNNING
      if (canPreview && isWeb && !allStepsCompleted) {
        startPreview().catch(() => {});
      }
    }
  };

  // Safety timeout to reset capture lock
  useEffect(() => {
    if (capturing && captureLocked.current) {
      const timeout = setTimeout(() => {
        setCapturing(false);
        captureLocked.current = false;
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [capturing]);

  const retry = () => {
    setError(null);
    setAttempts(0);
    setProgressMessage('');
    if (canPreview) {
      startPreview().catch(() => {});
    }
  };

  const resetFlow = () => {
    setDescriptors({});
    setCurrentStepIndex(0);
    setProgressMessage('');
    setError(null);
    if (canPreview) {
      startPreview().catch(() => {});
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-3 text-xs">
      {CAPTURE_STEPS.map((angle, index) => {
        const isCompleted = Boolean(descriptors[angle]);
        const isActive = index === currentStepIndex && !isCompleted;

        return (
          <React.Fragment key={angle}>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border font-medium transition-colors ${
                isCompleted
                  ? 'border-green-500 text-green-600 bg-green-50'
                  : isActive
                  ? 'border-primary text-primary bg-primary/10 shadow-sm'
                  : 'border-muted text-muted-foreground bg-muted/30'
              }`}
            >
              {STEP_ICONS[angle]}
              <span>{STEP_LABELS[angle]}</span>
            </div>
            {index < CAPTURE_STEPS.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
          </React.Fragment>
        );
      })}
    </div>
  );

  const renderInstructions = () => {
    // Ensure step number never exceeds total steps
    const displayStep = Math.min(currentStepIndex + 1, CAPTURE_STEPS.length);
    const safeAngle = CAPTURE_STEPS[Math.min(currentStepIndex, CAPTURE_STEPS.length - 1)];
    
    return (
      <div className="space-y-3 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">
          Step {displayStep} of {CAPTURE_STEPS.length}
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40 text-sm font-semibold">
          {STEP_ICONS[safeAngle]}
          <span>{STEP_LABELS[safeAngle]}</span>
        </div>
        <p className="text-sm font-medium text-balance">{STEP_INSTRUCTIONS[safeAngle]}</p>
      </div>
    );
  };

  if (hasPermission === null) {
    return (
      <Card className="w-full max-w-sm mx-auto border-0 shadow-lg">
        <CardContent className="p-8 text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Checking permissions...</p>
        </CardContent>
      </Card>
    );
  }

  if (hasPermission === false) {
    return (
      <Card className="w-full max-w-sm mx-auto border-0 shadow-lg">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-3">
            <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
            <h2 className="text-lg font-semibold">Camera Access Required</h2>
            <p className="text-sm text-muted-foreground">
              We need camera access to capture multiple angles of your face. This keeps the community safe and authentic.
            </p>
          </div>

          <Button onClick={requestPermission} className="w-full" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Grant Camera Access
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm mx-auto border border-border shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="space-y-3">
          {renderInstructions()}
        </div>

        <div className="relative mx-auto" style={{ width: '250px', height: '300px' }}>
          {/* Spinner overlay - ON TOP of frame */}
          {capturing && (
            <svg 
              className="absolute inset-0 w-full h-full -rotate-90 z-20 pointer-events-none" 
              viewBox="0 0 250 300"
              style={{ transform: 'rotate(-90deg)' }}
            >
              <ellipse
                cx="125"
                cy="150"
                rx="121"
                ry="146"
                fill="none"
                stroke="#22c55e"
                strokeWidth="6"
                strokeDasharray="850"
                strokeDashoffset="850"
                className="animate-[ellipse-dash_3s_linear_forwards]"
                strokeLinecap="round"
              />
            </svg>
          )}
          
          {/* Oval frame with video */}
          <div
            className={`relative overflow-hidden w-full h-full transition-colors duration-200 ${
              alignmentGood && !capturing
                ? 'ring-4 ring-green-500'
                : capturing
                ? 'ring-4 ring-green-500'
                : 'ring-4 ring-red-500'
            }`}
            style={{ borderRadius: '50%' }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover bg-black transition-opacity duration-200 ${
                previewActive ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ transform: 'scaleX(-1)', objectPosition: '50% 40%' }}
            />

            {/* Direction icons overlay */}
            {previewActive && !capturing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                {alignmentGood ? (
                  <CheckCircle className="w-16 h-16 text-green-400 drop-shadow-lg" />
                ) : currentAngle === 'left' ? (
                  <ArrowLeft className="w-14 h-14 text-white drop-shadow-lg animate-pulse" />
                ) : currentAngle === 'right' ? (
                  <ArrowRight className="w-14 h-14 text-white drop-shadow-lg animate-pulse" />
                ) : (
                  <ArrowUp className="w-14 h-14 text-white drop-shadow-lg animate-pulse" />
                )}
              </div>
            )}
            
            {/* Scanning text */}
            {capturing && (
              <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10">
                <p className="text-sm font-semibold text-white bg-green-500/90 px-4 py-1.5 rounded-full">
                  Scanning...
                </p>
              </div>
            )}
            {!previewActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 text-center p-6">
                {capturing ? (
                  <>
                    <div className="relative w-16 h-16">
                      <div className="absolute inset-0 border-4 border-green-500 rounded-full animate-ping opacity-75" />
                      <div className="absolute inset-0 border-4 border-green-500 rounded-full" />
                      <CheckCircle className="w-8 h-8 text-green-500 absolute inset-0 m-auto" />
                    </div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">Analyzing...</p>
                  </>
                ) : loading ? (
                  <>
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <p className="text-sm font-medium">Initializing camera...</p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full border-4 border-dashed border-muted-foreground/30 flex items-center justify-center">
                      <Camera className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm text-muted-foreground">Ready to capture</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {progressMessage && !error && (
          <div className="text-sm text-center font-medium text-muted-foreground">{progressMessage}</div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <p className="text-sm font-medium text-red-900 dark:text-red-100">{error}</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {error && (
            <Button onClick={retry} variant="outline" className="w-full" disabled={loading || capturing}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          )}

          {attempts >= 3 && _onSkip && (
            <Button onClick={_onSkip} variant="ghost" className="w-full" disabled={loading || capturing}>
              Skip Verification
            </Button>
          )}

          {allStepsCompleted && (
            <Button onClick={resetFlow} variant="outline" className="w-full" disabled={loading || capturing}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-capture Angles
            </Button>
          )}
        </div>

        {isWeb && (
          <p className="text-[11px] text-center text-muted-foreground">
            Web preview uses mock descriptors. Build native apps to capture real data.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default NativeFaceScanner;
