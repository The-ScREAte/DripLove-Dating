import React from 'react';

interface HoppingLogoProps {
  size?: number;
  opacity?: number;
  className?: string;
  /** Set false to show the logo still (e.g. while a pull-to-refresh is being dragged). */
  animate?: boolean;
}

// Animation lives in index.css (.hopping-logo / @keyframes hop) - shared
// globally instead of each mount injecting its own duplicate <style> tag.
const HoppingLogo: React.FC<HoppingLogoProps> = ({ size = 48, opacity = 1, className = '', animate = true }) => {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src="/driplove-logo.webp"
        alt="DripLove Logo"
        className={animate ? 'hopping-logo' : undefined}
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
