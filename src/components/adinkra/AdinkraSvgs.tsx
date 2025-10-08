import React from 'react';

// Optimized React components for Adinkra symbols
// Converted from dangerouslySetInnerHTML to proper React components for better performance

export const GyeNyameSvg: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="22" stroke="#F9A825" strokeWidth="3" fill="#FFFDE7" />
    <path d="M24 10c-3 3-3 9 0 12s3 9 0 12" stroke="#E53935" strokeWidth="3" fill="none" />
    <path d="M24 38c3-3 3-9 0-12s-3-9 0-12" stroke="#43A047" strokeWidth="3" fill="none" />
    <circle cx="24" cy="24" r="3" fill="#1E88E5" />
  </svg>
);

export const SankofaSvg: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="22" stroke="#43A047" strokeWidth="3" fill="#E8F5E9" />
    <path d="M32 24c0-4.4-3.6-8-8-8s-8 3.6-8 8 3.6 8 8 8c3 0 6-2.4 6-6" stroke="#E53935" strokeWidth="3" fill="none" />
    <path d="M24 30l6-6-6-6" stroke="#F9A825" strokeWidth="3" fill="none" />
  </svg>
);

export const DuafeSvg: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <rect x="6" y="12" width="36" height="24" rx="12" fill="#FFF3E0" stroke="#E53935" strokeWidth="3" />
    <rect x="18" y="6" width="12" height="12" rx="6" fill="#F9A825" stroke="#43A047" strokeWidth="3" />
    <rect x="14" y="30" width="3" height="8" fill="#1E88E5" />
    <rect x="22" y="30" width="3" height="8" fill="#1E88E5" />
    <rect x="30" y="30" width="3" height="8" fill="#1E88E5" />
  </svg>
);

export const AkomaSvg: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <path d="M24 42s-12-9-12-18a12 12 0 0 1 24 0c0 9-12 18-12 18z" fill="#E53935" stroke="#F9A825" strokeWidth="3" />
    <circle cx="18" cy="21" r="3" fill="#FFFDE7" />
    <circle cx="30" cy="21" r="3" fill="#FFFDE7" />
  </svg>
);

export const AdinkraheneSvg: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="22" fill="#F9A825" stroke="#E53935" strokeWidth="3" />
    <circle cx="24" cy="24" r="14" fill="#43A047" stroke="#1E88E5" strokeWidth="2" />
  </svg>
);

export const DwennimmenSvg: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="22" fill="#FFF3E0" stroke="#E53935" strokeWidth="3" />
    <path d="M20 40c-8-8 8-24 16-16" stroke="#43A047" strokeWidth="3" fill="none" />
    <path d="M44 40c8-8-8-24-16-16" stroke="#43A047" strokeWidth="3" fill="none" />
  </svg>
);

export const AyaSvg: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <ellipse cx="24" cy="24" rx="20" ry="12" fill="#A5D6A7" stroke="#388E3C" strokeWidth="3" />
    <path d="M24 12v24M18 18l12 12M30 18l-12 12" stroke="#388E3C" strokeWidth="3" />
  </svg>
);

export const NkyinkyimSvg: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <path d="M12 36c12-24 24 0 24-24" stroke="#E53935" strokeWidth="4" fill="none" />
    <circle cx="12" cy="36" r="3" fill="#F9A825" />
    <circle cx="36" cy="12" r="3" fill="#43A047" />
  </svg>
);

export const EbanSvg: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <rect x="8" y="8" width="32" height="32" rx="8" fill="#FFFDE7" stroke="#E53935" strokeWidth="3" />
    <path d="M14 8v32M24 8v32M34 8v32" stroke="#43A047" strokeWidth="3" />
  </svg>
);

export const NyameDuaSvg: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <rect x="20" y="26" width="8" height="16" fill="#43A047" />
    <circle cx="24" cy="18" r="12" fill="#F9A825" stroke="#E53935" strokeWidth="3" />
  </svg>
);

// Component mapping for easy lookup
export const AdinkraSvgComponents = {
  'Gye Nyame': GyeNyameSvg,
  'Sankofa': SankofaSvg,
  'Duafe': DuafeSvg,
  'Akoma': AkomaSvg,
  'Adinkrahene': AdinkraheneSvg,
  'Dwennimmen': DwennimmenSvg,
  'Aya': AyaSvg,
  'Nkyinkyim': NkyinkyimSvg,
  'Eban': EbanSvg,
  'Nyame Dua': NyameDuaSvg,
} as const;

export type AdinkraSymbolName = keyof typeof AdinkraSvgComponents;