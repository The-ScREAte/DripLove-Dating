import React from 'react';

interface DripCoupleIconProps {
  className?: string;
  size?: number;
}

const DripCoupleIcon: React.FC<DripCoupleIconProps> = ({ className = '', size = 28 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Couple silhouettes */}
      {/* Person 1 (left) */}
      <circle cx="8" cy="6" r="2.5" fill="currentColor" />
      <path d="M8 10c-2.5 0-4.5 1.5-4.5 3.5v2c0 0.5 0.5 1 1 1h7c0.5 0 1-0.5 1-1v-2c0-2-2-3.5-4.5-3.5z" fill="currentColor" />
      
      {/* Person 2 (right) */}
      <circle cx="16" cy="6" r="2.5" fill="currentColor" />
      <path d="M16 10c-2.5 0-4.5 1.5-4.5 3.5v2c0 0.5 0.5 1 1 1h7c0.5 0 1-0.5 1-1v-2c0-2-2-3.5-4.5-3.5z" fill="currentColor" />
      
      {/* Heart between them */}
      <path d="M12 18c-0.5-0.5-2-2-2-3.5 0-1 0.5-1.5 1.5-1.5s1.5 0.5 1.5 1.5c0 0 0-1 1.5-1s1.5 0.5 1.5 1.5c0 1.5-1.5 3-2 3.5z" fill="#ff6b7d" />
    </svg>
  );
};

export default DripCoupleIcon;