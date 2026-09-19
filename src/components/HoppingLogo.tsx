import React from 'react';

interface HoppingLogoProps {
  size?: number;
  opacity?: number;
  className?: string;
}

// Animation lives in index.css (.hopping-logo / @keyframes hop) - shared
// globally instead of each mount injecting its own duplicate <style> tag.
const HoppingLogo: React.FC<HoppingLogoProps> = ({ size = 48, opacity = 1, className = '' }) => {
  return (
    <div className={`flex items-center justify-center ${className}`}>
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
