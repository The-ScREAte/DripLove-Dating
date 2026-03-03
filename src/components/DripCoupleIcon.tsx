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
      aria-hidden="true"
    >
      <circle cx="8.5" cy="7" r="2.25" stroke="currentColor" strokeWidth="2" />
      <circle cx="15.5" cy="7" r="2.25" stroke="currentColor" strokeWidth="2" />
      <path d="M4.5 16.5C4.5 14.291 6.291 12.5 8.5 12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M19.5 16.5C19.5 14.291 17.709 12.5 15.5 12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 19.25C10.2 18 9 16.85 9 15.45C9 14.35 9.85 13.5 10.95 13.5C11.5 13.5 12 13.72 12.35 14.1C12.7 13.72 13.2 13.5 13.75 13.5C14.85 13.5 15.7 14.35 15.7 15.45C15.7 16.85 14.5 18 12.7 19.25L12.35 19.5L12 19.25Z" fill="currentColor" />
    </svg>
  );
};

export default DripCoupleIcon;