import { useState, useEffect, useRef } from "react";
import { CameraPreview } from '@capacitor-community/camera-preview';
import { Capacitor } from '@capacitor/core';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";

export default function FaceVerification() {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [faceAngleCorrect, setFaceAngleCorrect] = useState(false);
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
        const parentId = cameraContainerRef.current?.id ?? "cameraPreview";
        console.log('[Camera] Starting preview with parent:', parentId);
        
        await CameraPreview.start({
          parent: parentId,
          position: "front",
          toBack: false,
          className: "camera-feed",
          width: CAMERA_SIZE,
          height: CAMERA_SIZE,
          disableAudio: true
        });
        
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
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }

    // Simple face detection using video brightness and face-like patterns
    detectionIntervalRef.current = window.setInterval(() => {
      if (!videoRef.current) return;

      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;

      // Draw current frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Analyze center region for face detection
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const regionSize = 60;
      
      let totalBrightness = 0;
      let pixelCount = 0;
      let darkPixels = 0;
      
      for (let y = centerY - regionSize; y < centerY + regionSize; y++) {
        for (let x = centerX - regionSize; x < centerX + regionSize; x++) {
          if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
            const i = (y * canvas.width + x) * 4;
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            const brightness = (r + g + b) / 3;
            
            totalBrightness += brightness;
            pixelCount++;
            
            if (brightness < 30) darkPixels++;
          }
        }
      }
      
      const avgBrightness = totalBrightness / pixelCount;
      const darkRatio = darkPixels / pixelCount;
      
      // Face detected if average brightness is reasonable and not too many dark pixels
      const faceDetected = avgBrightness > 40 && avgBrightness < 240 && darkRatio < 0.6;
      setIsFaceDetected(faceDetected);
      
      // Check angle based on brightness distribution
      if (faceDetected) {
        const currentAngle = getCurrentRequiredAngle();
        const angleCorrect = checkFaceAngle(imageData, canvas.width, canvas.height, currentAngle);
        setFaceAngleCorrect(angleCorrect);
      } else {
        setFaceAngleCorrect(false);
      }
    }, 200);
  }

  function getCurrentRequiredAngle(): 'front' | 'left' | 'right' {
    if (step === 1) return 'front';
    if (step === 2) return 'left';
    if (step === 3) return 'right';
    return 'front';
  }

  function checkFaceAngle(
    imageData: ImageData,
    width: number,
    height: number,
    requiredAngle: 'front' | 'left' | 'right'
  ): boolean {
    // Analyze left vs right brightness to detect head angle
    const centerX = width / 2;
    const leftRegionBrightness = getRegionBrightness(imageData, width, height, 0, centerX);
    const rightRegionBrightness = getRegionBrightness(imageData, width, height, centerX, width);
    
    const brightnessDiff = Math.abs(leftRegionBrightness - rightRegionBrightness);
    const leftBrighter = leftRegionBrightness > rightRegionBrightness;
    
    if (requiredAngle === 'front') {
      // Front: Both sides should be similar brightness
      return brightnessDiff < 20;
    } else if (requiredAngle === 'left') {
      // Left turn: Right side of frame (left side of face) should be brighter
      return leftBrighter && brightnessDiff > 15;
    } else {
      // Right turn: Left side of frame (right side of face) should be brighter
      return !leftBrighter && brightnessDiff > 15;
    }
  }

  function getRegionBrightness(
    imageData: ImageData,
    width: number,
    height: number,
    startX: number,
    endX: number
  ): number {
    let totalBrightness = 0;
    let pixelCount = 0;
    
    const centerY = height / 2;
    const regionHeight = 80;
    
    for (let y = centerY - regionHeight / 2; y < centerY + regionHeight / 2; y++) {
      for (let x = startX; x < endX; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const i = (Math.floor(y) * width + Math.floor(x)) * 4;
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          totalBrightness += (r + g + b) / 3;
          pixelCount++;
        }
      }
    }
    
    return totalBrightness / pixelCount;
  }

  function getInstructionText(): string {
    if (step === 1) return 'Look Straight';
    if (step === 2) return 'Turn Left';
    if (step === 3) return 'Turn Right';
    return '';
  }
  function startFaceDetection() {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }

    // Simple face detection using video brightness and face-like patterns
    detectionIntervalRef.current = window.setInterval(() => {
      if (!videoRef.current) return;

      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;

      // Draw current frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Analyze center region for face detection
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const regionSize = 60;
      
      let totalBrightness = 0;
      let pixelCount = 0;
      let darkPixels = 0;
      
      for (let y = centerY - regionSize; y < centerY + regionSize; y++) {
        for (let x = centerX - regionSize; x < centerX + regionSize; x++) {
          if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
            const i = (y * canvas.width + x) * 4;
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            const brightness = (r + g + b) / 3;
            
            totalBrightness += brightness;
            pixelCount++;
            
            if (brightness < 30) darkPixels++;
          }
        }
      }
      
      const avgBrightness = totalBrightness / pixelCount;
      const darkRatio = darkPixels / pixelCount;
      
      // Face detected if:
      // - Average brightness is reasonable (not too dark, not too bright)
      // - Not too many completely dark pixels (indicates face is visible)
      const faceDetected = avgBrightness > 40 && avgBrightness < 240 && darkRatio < 0.6;
      setIsFaceDetected(faceDetected);
      
      // Check angle based on brightness distribution
      if (faceDetected) {
        const currentAngle = getCurrentRequiredAngle();
        const angleCorrect = checkFaceAngle(imageData, canvas.width, canvas.height, currentAngle);
        setFaceAngleCorrect(angleCorrect);
      } else {
        setFaceAngleCorrect(false);
      }
    }, 200);
  }

  function getCurrentRequiredAngle(): 'front' | 'left' | 'right' {
    if (step === 1) return 'front';
    if (step === 2) return 'left';
    if (step === 3) return 'right';
    return 'front';
  }

  function checkFaceAngle(
    imageData: ImageData,
    width: number,
    height: number,
    requiredAngle: 'front' | 'left' | 'right'
  ): boolean {
    // Analyze left vs right brightness to detect head angle
    const centerX = width / 2;
    const leftRegionBrightness = getRegionBrightness(imageData, width, height, 0, centerX);
    const rightRegionBrightness = getRegionBrightness(imageData, width, height, centerX, width);
    
    const brightnessDiff = Math.abs(leftRegionBrightness - rightRegionBrightness);
    const leftBrighter = leftRegionBrightness > rightRegionBrightness;
    
    if (requiredAngle === 'front') {
      // Front: Both sides should be similar brightness
      return brightnessDiff < 20;
    } else if (requiredAngle === 'left') {
      // Left turn: Right side of frame (left side of face) should be brighter
      return leftBrighter && brightnessDiff > 15;
    } else {
      // Right turn: Left side of frame (right side of face) should be brighter
      return !leftBrighter && brightnessDiff > 15;
    }
  }

  function getRegionBrightness(
    imageData: ImageData,
    width: number,
    height: number,
    startX: number,
    endX: number
  ): number {
    let totalBrightness = 0;
    let pixelCount = 0;
    
    const centerY = height / 2;
    const regionHeight = 80;
    
    for (let y = centerY - regionHeight / 2; y < centerY + regionHeight / 2; y++) {
      for (let x = startX; x < endX; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const i = (Math.floor(y) * width + Math.floor(x)) * 4;
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          totalBrightness += (r + g + b) / 3;
          pixelCount++;
        }
      }
    }
    
    return totalBrightness / pixelCount;
  }

  function getInstructionText(): string {
    if (step === 1) return 'Look Straight';
    if (step === 2) return 'Turn Left';
    if (step === 3) return 'Turn Right';
    return '';
  }

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
              className="camera-feed rounded-full overflow-hidden border-4 border-purple-500 shadow-2xl mx-auto bg-gray-900"
              style={{ 
                width: CAMERA_SIZE, 
                height: CAMERA_SIZE,
                position: 'relative',
                zIndex: 2
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
                <div className="bg-black/40 px-6 py-2 rounded-full backdrop-blur-sm">
                  <p className="text-white font-normal text-base tracking-wide">{getInstructionText()}</p>
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
