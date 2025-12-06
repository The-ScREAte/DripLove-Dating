import React from 'react';
import { Capacitor } from '@capacitor/core';
import { CapacitorVideoPlayer } from 'capacitor-video-player';

const VideoBackground: React.FC = () => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isNative, setIsNative] = React.useState(false);

  React.useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsNative(native);

    if (native) {
      const initVideo = async () => {
        try {
          // Initialize and play video with native player
          const result = await CapacitorVideoPlayer.initPlayer({
            mode: 'embedded',
            url: 'public/welcome-video.mov',
            playerId: 'backgroundVideo',
            componentTag: 'div',
            width: window.innerWidth,
            height: window.innerHeight,
            loopOnEnd: true,
            exitOnEnd: false,
            showControls: false,
            rate: 1.2,
          });
          
          if (result.result) {
            // Start playback
            await CapacitorVideoPlayer.play({ playerId: 'backgroundVideo' });
            await CapacitorVideoPlayer.setMuted({ playerId: 'backgroundVideo', muted: true });
          }
        } catch (error) {
          console.error('Failed to initialize native video player:', error);
        }
      };

      initVideo();

      return () => {
        CapacitorVideoPlayer.stopAllPlayers();
      };
    }
  }, []);

  React.useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleTimeUpdate = () => {
      if (!videoEl.duration) return;
      const remaining = videoEl.duration - videoEl.currentTime;
      if (remaining > 0 && remaining < 0.1) {
        videoEl.currentTime = 0;
        videoEl.play().catch(() => {});
      }
    };

    const handleEnded = () => {
      videoEl.currentTime = 0;
      videoEl.play().catch(() => {});
    };

    videoEl.addEventListener('timeupdate', handleTimeUpdate);
    videoEl.addEventListener('ended', handleEnded);

    return () => {
      videoEl.removeEventListener('timeupdate', handleTimeUpdate);
      videoEl.removeEventListener('ended', handleEnded);
    };
  }, []);

  if (isNative) {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <div 
          ref={containerRef} 
          id="backgroundVideo"
          className="absolute top-0 left-0 w-full h-full opacity-30"
          style={{ willChange: 'auto' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-pink-500/10 via-pink-500/20 to-pink-500/30"></div>
      </div>
    );
  }

  // Fallback to HTML5 video for web
  return (
    <div className="absolute inset-0 overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        src="/welcome-video.mov"
        className="absolute top-0 left-0 w-full h-full object-cover opacity-30"
        style={{ willChange: 'auto' }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-pink-500/10 via-pink-500/20 to-pink-500/30"></div>
    </div>
  );
};

export default VideoBackground;