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

  // Initialize camera and load models
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        setError(null);
        setInitAttempts(prev => prev + 1);

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
    if (!videoRef.current || !canvasRef.current) return;

    const detectFace = async () => {
      if (!videoRef.current || !canvasRef.current || !modelsReady) return;

      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks();

        const canvas = canvasRef.current;
        const displaySize = {
          width: videoRef.current.videoWidth,
          height: videoRef.current.videoHeight
        };

        faceapi.matchDimensions(canvas, displaySize);
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);

        if (detection) {
          setFaceDetected(true);
          const resizedDetection = faceapi.resizeResults(detection, displaySize);
          faceapi.draw.drawDetections(canvas, [resizedDetection]);
          faceapi.draw.drawFaceLandmarks(canvas, [resizedDetection]);
        } else {
          setFaceDetected(false);
        }
      } catch (err) {
        console.error('Face detection error:', err);
      }

      // Continue detection loop
      if (!scanning) {
        requestAnimationFrame(detectFace);
      }
    };

    detectFace();
  };

  // Capture face descriptor
  const captureFace = async () => {
    if (!videoRef.current) return;

    setScanning(true);
    setError(null);

    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setError('No face detected. Please position your face in the frame and try again.');
        setScanning(false);
        return;
      }

      // Success! Stop camera and return descriptor
      stopCamera();
      onScanComplete(detection.descriptor);
    } catch (err) {
      console.error('Error capturing face:', err);
      setError('Failed to scan face. Please try again.');
      setScanning(false);
    }
  };

  // Retry initialization
  const retryInit = () => {
    console.log('🔄 Retrying camera initialization...');
    stopCamera();
    
    // Reset all state
    setError(null);
    setLoading(true);
    setModelsReady(false);
    setFaceDetected(false);
    setScanning(false);
    
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
            <div className="absolute top-4 left-4 right-4">
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  faceDetected
                    ? 'bg-green-500/90 text-white'
                    : 'bg-yellow-500/90 text-white'
                }`}
              >
                {faceDetected ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Face detected</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Position your face in the frame</span>
                  </>
                )}
              </div>
            </div>
          )}
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
          <p className="text-sm text-blue-800">
            <strong>Tips for best results:</strong>
          </p>
          <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
            <li>Ensure good lighting</li>
            <li>Look directly at the camera</li>
            <li>Remove sunglasses or masks</li>
            <li>Keep your face centered in the frame</li>
          </ul>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            onClick={captureFace}
            disabled={loading || scanning || !faceDetected}
            className="flex-1"
            size="lg"
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 mr-2" />
                Capture Face
              </>
            )}
          </Button>

          {onSkip && (
            <Button
              onClick={onSkip}
              variant="outline"
              disabled={scanning}
              size="lg"
            >
              Skip
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
