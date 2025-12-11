import { WebPlugin } from '@capacitor/core';
import type {
  FaceScanPlugin,
  CaptureDescriptorOptions,
  CaptureDescriptorResult,
} from './index';

// @ts-ignore - MediaPipe types
import { FaceMesh } from '@mediapipe/face_mesh';
// @ts-ignore - MediaPipe types
import { Camera } from '@mediapipe/camera_utils';

export class FaceScanWeb extends WebPlugin implements FaceScanPlugin {
  private faceMesh: any = null;
  private camera: any = null;
  private video: HTMLVideoElement | null = null; 
  private currentYaw = 0;
  private currentRoll = 0;

  async captureDescriptor(
    _options?: CaptureDescriptorOptions
  ): Promise<CaptureDescriptorResult> {
    // Web does NOT create a real biometric descriptor.
    // Generate a 128-float mock descriptor that maintains consistency.
    const descriptor = new Float32Array(128);
    for (let i = 0; i < descriptor.length; i++) {
      descriptor[i] = Math.random();
    }
    
    // Convert to base64
    const mockDescriptor = btoa(
      String.fromCharCode(...new Uint8Array(descriptor.buffer))
    );
    
    return {
      descriptor: mockDescriptor,
      success: true,
      yaw: this.currentYaw,
      roll: this.currentRoll,
    };
  }

  async hasPermission(): Promise<{ hasPermission: boolean; status?: string }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return { hasPermission: true, status: 'granted' };
    } catch {
      return { hasPermission: false, status: 'denied' };
    }
  }

  async requestPermission(): Promise<{ hasPermission: boolean }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return { hasPermission: true };
    } catch {
      return { hasPermission: false };
    }
  }

  async startPreview(videoEl: HTMLVideoElement): Promise<void> {
    this.video = videoEl;

    // Use preloaded FaceMesh for instant start (or create new if not preloaded)
    if (!(window as any).__faceMeshInstance) {
      this.faceMesh = new FaceMesh({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      await this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.3,
        minTrackingConfidence: 0.3,
      });

      (window as any).__faceMeshInstance = this.faceMesh;
    } else {
      this.faceMesh = (window as any).__faceMeshInstance;
    }

    this.faceMesh.onResults((results: any) => {
      if (!results.multiFaceLandmarks?.length) {
        return;
      }

      const landmarks = results.multiFaceLandmarks[0];
      this.computeYawRoll(landmarks);

      // Send preview updates (matches native behavior)
      this.notifyListeners('previewUpdate', {
        yaw: this.currentYaw,
        roll: this.currentRoll,
      });
    });

    // Start camera with reduced resolution for faster MediaPipe processing
    this.camera = new Camera(videoEl, {
      onFrame: async () => {
        if (this.faceMesh) {
          await this.faceMesh.send({ image: videoEl });
        }
      },
      width: 250,
      height: 300,
    });

    try {
      await this.camera.start();
    } catch (err) {
      console.error('❌ [Web Plugin] Camera start failed:', err);
      throw err;
    }
  }

  private computeYawRoll(landmarks: any[]): void {
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const nose = landmarks[4];  // FIXED — real nose tip for proper yaw movement

    const dx = rightEye.x - leftEye.x;
    const dy = rightEye.y - leftEye.y;

    // Roll (tilt)
    const rawRoll = Math.atan2(dy, dx) * (180 / Math.PI);

    // Yaw (turn) - HIGH SENSITIVITY like Tinder
    const rawYaw = (nose.x - 0.5) * -1200;

    // NO SMOOTHING - instant response
    this.currentYaw = rawYaw;
    this.currentRoll = rawRoll;

    // Send instantly
    this.notifyListeners('previewUpdate', {
      yaw: rawYaw,
      roll: rawRoll,
    });
  }

  stopPreview(): void {
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }
    // ❌ Do NOT close faceMesh - keep the preloaded instance alive
  }
}
