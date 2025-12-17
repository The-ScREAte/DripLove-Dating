import React from 'react';
import { Heart } from 'lucide-react';

interface HoppingLogoProps {
  size?: number;
  opacity?: number;
}

const HoppingLogo: React.FC<HoppingLogoProps> = ({ size = 48, opacity = 0.6 }) => {
  return (
    <div className="flex items-center justify-center">
      <style>{`
        @keyframes hop {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          25% {
            transform: translateY(-20px) scale(1.1);
          }
          50% {
            transform: translateY(-10px) scale(1.05);
          }
          75% {
            transform: translateY(-15px) scale(1.08);
          }
        }
        .hopping-logo {
          animation: hop 1.2s ease-in-out infinite;
        }
      `}</style>
      <Heart 
        className="hopping-logo fill-pink-500 text-pink-500" 
        size={size}
        style={{ opacity }}
      />
    </div>
  );
};

export default HoppingLogo;
