/**
 * Video preloader utility
 * Loads video asynchronously in background without blocking the app
 * Video always loads but won't prevent page from being interactive
 */

class VideoPreloader {
  private static instance: VideoPreloader;
  private videoUrl = '/welcome-video.mp4';
  private videoBlob: string | null = null;
  private isLoading = false;
  private loadPromise: Promise<string> | null = null;

  private constructor() {
    // Start loading immediately in background
    this.preloadVideo();
  }

  static getInstance(): VideoPreloader {
    if (!VideoPreloader.instance) {
      VideoPreloader.instance = new VideoPreloader();
    }
    return VideoPreloader.instance;
  }

  async preloadVideo(): Promise<string> {
    // If already loaded, return the blob URL
    if (this.videoBlob) {
      return this.videoBlob;
    }

    // If currently loading, wait for the existing load
    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    // Start loading
    this.isLoading = true;
    this.loadPromise = this.loadVideoBlob();
    
    try {
      this.videoBlob = await this.loadPromise;
      return this.videoBlob;
    } finally {
      this.isLoading = false;
    }
  }

  private async loadVideoBlob(): Promise<string> {
    try {
      const response = await fetch(this.videoUrl);
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Failed to preload video:', error);
      // Fall back to direct URL if blob creation fails
      return this.videoUrl;
    }
  }

  getVideoUrl(): string {
    // Return blob URL if available, otherwise direct URL
    return this.videoBlob || this.videoUrl;
  }

  cleanup(): void {
    if (this.videoBlob) {
      URL.revokeObjectURL(this.videoBlob);
      this.videoBlob = null;
    }
  }
}

export const videoPreloader = VideoPreloader.getInstance();
