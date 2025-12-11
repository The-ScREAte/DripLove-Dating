import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export type FaceCaptureAngle = 'front' | 'left' | 'right';

export interface CaptureDescriptorOptions {
  angle?: FaceCaptureAngle;
}

export interface CaptureDescriptorResult {
  descriptor: string;
  success: boolean;
  yaw?: number; // Degrees, positive/negative depending on turn direction
  roll?: number; // Degrees of tilt
}

export interface PreviewUpdateEvent {
  yaw: number;
  roll: number;
}

export interface FaceScanPlugin {
  /**
   * Capture a face descriptor using native camera and ML
   * Returns a base64-encoded 128-dimensional descriptor plus orientation metadata
   */
  captureDescriptor(options?: CaptureDescriptorOptions): Promise<CaptureDescriptorResult>;

  /**
   * Check if camera permission is granted
   */
  hasPermission(): Promise<{ hasPermission: boolean; status?: string }>;

  /**
   * Request camera permission
   */
  requestPermission(): Promise<{ hasPermission: boolean }>;

  /**
   * Listen for real-time preview updates with yaw/roll data
   */
  addListener(
    eventName: 'previewUpdate',
    listenerFunc: (event: PreviewUpdateEvent) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Remove all listeners for this plugin
   */
  removeAllListeners(): Promise<void>;
}

const FaceScan = registerPlugin<FaceScanPlugin>('FaceScan', {
  web: () => import('./web').then(m => new m.FaceScanWeb()),
});

export default FaceScan;
