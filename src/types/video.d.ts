// Type declarations for mobile video attributes
declare module 'react' {
  interface VideoHTMLAttributes<T> extends HTMLAttributes<T> {
    'webkit-playsinline'?: string;
    'x5-playsinline'?: string;
  }
}

export {};
