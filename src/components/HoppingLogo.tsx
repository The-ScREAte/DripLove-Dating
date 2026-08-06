import React from 'react';

interface HoppingLogoProps {
  size?: number;
  opacity?: number;
}

const HoppingLogo: React.FC<HoppingLogoProps> = ({ size = 48, opacity = 1 }) => {
  return (
    <div className="flex items-center justify-center">
      <style>{`
        /* A single smooth up-and-down arc instead of several uneven direction changes — the old
           4-stop keyframe (up, partway down, up again, down again all within one cycle) read as
           jittery/rapid shaking rather than one clean hop, especially on iOS WebKit. */
        @keyframes hop {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-14px) scale(1.05);
          }
        }
        .hopping-logo {
          animation: hop 1.4s cubic-bezier(0.45, 0, 0.55, 1) infinite;
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform: translateZ(0);
        }
      `}</style>
      <img
        src="/driplove-logo.webp"
        alt="DripLove Logo"
        className="hopping-logo"
        style={{
          width: size,
          height: size,
          opacity,
          objectFit: 'contain'
        }}
      />
    </div>
  );
};

export default HoppingLogo;
