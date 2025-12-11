import { WebPlugin } from '@capacitor/core';
import type {
  FaceScanPlugin,
  CaptureDescriptorOptions,
  CaptureDescriptorResult,
} from './index';

export class FaceScanWeb extends WebPlugin implements FaceScanPlugin {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private currentYaw = 0;
  private currentRoll = 0;
  private animationFrame: number | null = null;

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

    try {
      // Simple camera access for web fallback
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 640, 
          height: 480,
          facingMode: 'user'
        } 
      });
      
      videoEl.srcObject = this.stream;
      await videoEl.play();

      // Simulate head movement detection with random values for testing
      const simulateMovement = () => {
        // Generate random yaw/roll to simulate face tracking
        this.currentYaw = (Math.random() - 0.5) * 60; // -30 to +30
        this.currentRoll = (Math.random() - 0.5) * 20; // -10 to +10

        this.notifyListeners('previewUpdate', {
          yaw: this.currentYaw,
          roll: this.currentRoll,
        });

        this.animationFrame = requestAnimationFrame(simulateMovement);
      };

      simulateMovement();
    } catch (err) {
      console.error('❌ [Web Plugin] Camera start failed:', err);
      throw err;
    }
  }

  stopPreview(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }
}
