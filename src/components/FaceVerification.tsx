import { useState, useEffect, useRef } from "react";
import { CameraPreview } from '@capacitor-community/camera-preview';
import { Capacitor } from '@capacitor/core';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";

export default function FaceVerification() {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isNative = Capacitor.isNativePlatform();

  // Add CSS to ensure camera video displays properly in circular container
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      #cameraPreview, .camera-feed {
        position: relative !important;
        overflow: hidden !important;
        border-radius: 50% !important;
        width: 320px !important;
        height: 320px !important;
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
      
      if (isNative) {
        // Native mobile camera - render inside circular container
        await CameraPreview.start({
          parent: "cameraPreview",
          position: "front",
          toBack: false,
          className: "camera-feed",
          width: 320,
          height: 320,
          disableAudio: true
        });
      } else {
        // Web browser camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'user',
            width: { ideal: 320 },
            height: { ideal: 320 }
          },
          audio: false
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          await videoRef.current.play();
        }
      }
      
      setStep(1);
    } catch (error) {
      console.error("Camera error:", error);
      alert("Failed to start camera. Please allow camera permissions.");
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
          canvas.width = 320;
          canvas.height = 320;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, 320, 320);
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
      const { data, error } = await supabase.functions.invoke("face-verify", {
        body: {
          front: images.front,
          left: images.left,
          right: images.right
        }
      });

      if (error) {
        alert("❌ Verification failed: " + error.message);
        return;
      }

      if (data.success) {
        alert("✅ Face verified! You can now complete your registration.");
        setStep(5);
      } else {
        alert("⚠️ Duplicate account detected! This face is already registered.");
        setStep(0);
        setImages({ front: null, left: null, right: null });
      }
    } catch (error) {
      console.error("Submit error:", error);
      alert("Failed to verify. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const getStepIndicator = () => {
    return (
      <div className="flex justify-center gap-2 mb-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full transition-all ${
              step >= i ? "bg-purple-600 w-8" : "bg-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  const getInstructions = () => {
    switch (step) {
      case 1:
        return "📸 Look straight at the camera";
      case 2:
        return "← Turn your head LEFT";
      case 3:
        return "Turn your head RIGHT →";
      case 4:
        return "✓ All photos captured!";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Live Video Preview - Circular Camera Feed (Like Tinder) */}
      {step > 0 && step < 4 && (
        <div className="space-y-4 animate-fade-in">
          {getStepIndicator()}
          <div className="relative mx-auto" style={{ width: 320, height: 320 }}>
            {/* Camera Video Container */}
            <div 
              id="cameraPreview" 
              className="camera-feed rounded-full overflow-hidden border-4 border-purple-500 shadow-2xl mx-auto bg-gray-900"
              style={{ 
                width: 320, 
                height: 320,
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
            </div>
          </div>
          
          {/* Live instructions */}
          <p className="text-center text-sm font-medium text-purple-700 animate-pulse">
            {getInstructions()}
          </p>
          
          {/* Tip text */}
          <p className="text-center text-[11px] text-gray-500 mt-1">
            Align your face within the circle
          </p>
        </div>
      )}

      {/* Completed Photos Preview */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex justify-center gap-2">
            {images.front && (
              <div className="relative">
                <img 
                  src={images.front} 
                  alt="Front" 
                  className="w-20 h-20 rounded-full object-cover border-2 border-green-500"
                />
                <CheckCircle2 className="absolute -top-1 -right-1 w-5 h-5 text-green-500 bg-white rounded-full" />
              </div>
            )}
            {images.left && (
              <div className="relative">
                <img 
                  src={images.left} 
                  alt="Left" 
                  className="w-20 h-20 rounded-full object-cover border-2 border-green-500"
                />
                <CheckCircle2 className="absolute -top-1 -right-1 w-5 h-5 text-green-500 bg-white rounded-full" />
              </div>
            )}
            {images.right && (
              <div className="relative">
                <img 
                  src={images.right} 
                  alt="Right" 
                  className="w-20 h-20 rounded-full object-cover border-2 border-green-500"
                />
                <CheckCircle2 className="absolute -top-1 -right-1 w-5 h-5 text-green-500 bg-white rounded-full" />
              </div>
            )}
          </div>
          <p className="text-center text-sm text-green-600 font-medium">
            ✓ All 3 angles captured successfully!
          </p>
        </div>
      )}

      {/* Success State */}
      {step === 5 && (
        <div className="text-center py-6">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-3 animate-bounce" />
          <p className="text-lg font-semibold text-green-700">Face Verified!</p>
          <p className="text-sm text-gray-600 mt-2">You can now continue with registration</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        {step === 0 && (
          <Button 
            onClick={startCamera}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-6 rounded-xl shadow-lg transition-all"
          >
            <Camera className="mr-2 h-5 w-5" />
            {isLoading ? "Starting Camera..." : "Start Verification"}
          </Button>
        )}

        {step === 1 && (
          <Button 
            onClick={() => takePicture("front")}
            disabled={isLoading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-6 rounded-xl shadow-lg"
          >
            📸 Capture Front Photo
          </Button>
        )}

        {step === 2 && (
          <Button 
            onClick={() => takePicture("left")}
            disabled={isLoading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-6 rounded-xl shadow-lg"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Capture Left Angle
          </Button>
        )}

        {step === 3 && (
          <Button 
            onClick={() => takePicture("right")}
            disabled={isLoading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-6 rounded-xl shadow-lg"
          >
            <ArrowRight className="mr-2 h-5 w-5" />
            Capture Right Angle
          </Button>
        )}

        {step === 4 && (
          <Button 
            onClick={submit}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-6 rounded-xl shadow-lg"
          >
            <CheckCircle2 className="mr-2 h-5 w-5" />
            {isLoading ? "Verifying..." : "Submit for Verification"}
          </Button>
        )}
      </div>
    </div>
  );
}
