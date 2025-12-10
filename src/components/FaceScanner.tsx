/**
 * FaceScanner Component
 * 3-step face capture for better accuracy
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { loadFaceModels } from '@/utils/faceModels';
import { FaceDescriptor } from '@/utils/faceComparison';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, CheckCircle, Loader2, RefreshCw } from 'lucide-react';

const POSE_STEPS = [
  { key: 'center', label: 'Center' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' }
] as const;

type PoseKey = typeof POSE_STEPS[number]['key'];

function averageDescriptors(descriptors: FaceDescriptor[]): FaceDescriptor {
  if (!descriptors.length) throw new Error('No descriptors');
  const length = descriptors[0].length;
  const averaged = new Float32Array(length);
  descriptors.forEach(desc => {
    for (let i = 0; i < length; i++) averaged[i] += desc[i];
  });
  for (let i = 0; i < length; i++) averaged[i] /= descriptors.length;
  return averaged;
}

function captureSnapshot(video: HTMLVideoElement): string | null {
  if (!video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.8);
}

interface FaceScannerProps {
  onScanComplete: (descriptor: FaceDescriptor) => void;
  onSkip?: () => void;
}

export const FaceScanner: React.FC<FaceScannerProps> = ({ onScanComplete, onSkip }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const descriptorsRef = useRef<FaceDescriptor[]>([]);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const faceStartTimeRef = useRef<number | null>(null);
  const isCapturingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [poseIndex, setPoseIndex] = useState(0);
  const [snapshots, setSnapshots] = useState<Partial<Record<PoseKey, string>>>({});
  const [attempts, setAttempts] = useState(0);

  const currentPose = POSE_STEPS[Math.min(poseIndex, POSE_STEPS.length - 1)];

  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const captureFace = useCallback(async () => {
    if (!videoRef.current || isCapturingRef.current) return;
    
    isCapturingRef.current = true;
    setCountdown(null);
    faceStartTimeRef.current = null;

    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.4 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (detection) {
        const snapshot = captureSnapshot(videoRef.current);
        if (snapshot) {
          setSnapshots(prev => ({ ...prev, [currentPose.key]: snapshot }));
        }
        
        descriptorsRef.current.push(detection.descriptor);

        if (poseIndex >= POSE_STEPS.length - 1) {
          // All done
          const averaged = averageDescriptors(descriptorsRef.current);
          stopCamera();
          onScanComplete(averaged);
        } else {
          // Next pose
          setPoseIndex(prev => prev + 1);
          isCapturingRef.current = false;
        }
      } else {
        setError('Face lost. Try again.');
        setAttempts(prev => prev + 1);
        isCapturingRef.current = false;
      }
    } catch {
      setError('Capture failed. Try again.');
      setAttempts(prev => prev + 1);
      isCapturingRef.current = false;
    }
  }, [currentPose.key, onScanComplete, poseIndex, stopCamera]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        await loadFaceModels();
        if (!mounted) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false
        });

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();
        
        if (!mounted) return;
        setLoading(false);

        // Detection loop
        const detect = async () => {
          if (!mounted || !video || !canvasRef.current || isCapturingRef.current) {
            if (mounted) animationRef.current = requestAnimationFrame(detect);
            return;
          }

          try {
            const detection = await faceapi
              .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.4 }))
              .withFaceLandmarks(true);

            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx && video.videoWidth) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.clearRect(0, 0, canvas.width, canvas.height);

              if (detection) {
                setFaceDetected(true);
                const resized = faceapi.resizeResults(detection, { width: canvas.width, height: canvas.height });
                faceapi.draw.drawDetections(canvas, [resized]);

                if (!faceStartTimeRef.current && !countdownTimerRef.current) {
                  faceStartTimeRef.current = Date.now();
                  setCountdown(3);
                  countdownTimerRef.current = setInterval(() => {
                    setCountdown(prev => {
                      if (prev === null || prev <= 1) {
                        if (countdownTimerRef.current) {
                          clearInterval(countdownTimerRef.current);
                          countdownTimerRef.current = null;
                        }
                        captureFace();
                        return null;
                      }
                      return prev - 1;
                    });
                  }, 1000);
                }
              } else {
                setFaceDetected(false);
                if (faceStartTimeRef.current) {
                  faceStartTimeRef.current = null;
                  setCountdown(null);
                  if (countdownTimerRef.current) {
                    clearInterval(countdownTimerRef.current);
                    countdownTimerRef.current = null;
                  }
                }
              }
            }
          } catch {
            // Ignore detection errors
          }

          if (mounted) animationRef.current = requestAnimationFrame(detect);
        };

        detect();
      } catch (err: any) {
        if (!mounted) return;
        
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found.');
        } else {
          setError('Camera error. Try again.');
        }
        setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
      stopCamera();
    };
  }, [captureFace, stopCamera]);

  const retry = () => {
    stopCamera();
    setError(null);
    setLoading(true);
    setFaceDetected(false);
    setCountdown(null);
    setPoseIndex(0);
    setSnapshots({});
    descriptorsRef.current = [];
    isCapturingRef.current = false;
    faceStartTimeRef.current = null;
    
    setTimeout(() => window.location.reload(), 100);
  };

  const showSkip = attempts >= 3 && onSkip;

  return (
    <Card className="w-full max-w-sm mx-auto border-0 shadow-lg">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="text-center">
          <Camera className="w-8 h-8 text-primary mx-auto mb-2" />
          <h2 className="text-lg font-semibold">Face Verification</h2>
          <p className="text-sm text-muted-foreground">
            Step {poseIndex + 1}/3: Turn {currentPose.label.toLowerCase()}
          </p>
        </div>

        {/* 3 Capture Previews */}
        <div className="grid grid-cols-3 gap-2">
          {POSE_STEPS.map((pose, idx) => {
            const snapshot = snapshots[pose.key];
            const isCurrent = idx === poseIndex;
            const isDone = Boolean(snapshot);
            
            return (
              <div 
                key={pose.key} 
                className={`rounded-lg border-2 p-1 text-center transition-all ${
                  isDone ? 'border-green-500 bg-green-50' :
                  isCurrent ? 'border-primary bg-primary/5' :
                  'border-muted bg-muted/30'
                }`}
              >
                <div className="aspect-square rounded overflow-hidden bg-muted mb-1">
                  {snapshot ? (
                    <img src={snapshot} alt={pose.label} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      {isCurrent ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <span className="text-xs">{idx + 1}</span>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs font-medium flex items-center justify-center gap-1">
                  {isDone && <CheckCircle className="w-3 h-3 text-green-500" />}
                  {pose.label}
                </p>
              </div>
            );
          })}
        </div>

        {/* Video Feed */}
        <div className="relative bg-black rounded-xl overflow-hidden aspect-[3/4]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none scale-x-[-1]"
          />

          {/* Loading */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center text-white">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-sm">Starting camera...</p>
              </div>
            </div>
          )}

          {/* Status */}
          {!loading && !error && (
            <div className="absolute bottom-4 left-4 right-4">
              <div className={`flex items-center justify-center gap-2 px-4 py-2 rounded-full text-white text-sm font-medium ${
                countdown !== null ? 'bg-green-500' : faceDetected ? 'bg-blue-500' : 'bg-orange-500'
              }`}>
                {countdown !== null ? (
                  <><span className="text-lg font-bold">{countdown}</span><span>Hold still...</span></>
                ) : faceDetected ? (
                  <><CheckCircle className="w-4 h-4" /><span>Face detected</span></>
                ) : (
                  <span>Position your face</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="space-y-3">
            <p className="text-sm text-destructive text-center">{error}</p>
            <Button onClick={retry} variant="outline" className="w-full" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        {/* Skip */}
        {showSkip && (
          <Button onClick={onSkip} variant="ghost" className="w-full text-muted-foreground" size="sm">
            Skip for now
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
