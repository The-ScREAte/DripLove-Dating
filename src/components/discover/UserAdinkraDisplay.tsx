import React, { useState, useEffect, useRef } from 'react';
import { SELECTABLE_ADINKRA_SYMBOLS } from '@/constants/adinkraSymbols';
import { AdinkraSvgComponents, type AdinkraSymbolName } from '@/components/adinkra/AdinkraSvgs';

interface UserAdinkraDisplayProps {
  adinkraSymbols: string[];
}

const UserAdinkraDisplay: React.FC<UserAdinkraDisplayProps> = React.memo(({ adinkraSymbols }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const animationFrameRef = useRef<number>();
  const lastUpdateRef = useRef<number>(Date.now());

  useEffect(() => {
    // Dependency guard - only rotate if we have multiple symbols
    if (!adinkraSymbols || adinkraSymbols.length <= 1) return;

    let isActive = true;
    
    const rotateSymbol = () => {
      const now = Date.now();
      // Use 6 seconds interval for better performance
      if (now - lastUpdateRef.current >= 6000) {
        if (isActive) {
          setIsTransitioning(true);
          
          // Start fade out
          setTimeout(() => {
            if (isActive) {
              setCurrentIndex((prev) => (prev + 1) % adinkraSymbols.length);
              setIsTransitioning(false);
              lastUpdateRef.current = now;
            }
          }, 200);
        }
      }
      
      if (isActive) {
        animationFrameRef.current = requestAnimationFrame(rotateSymbol);
      }
    };

    // Start the animation loop
    animationFrameRef.current = requestAnimationFrame(rotateSymbol);

    return () => {
      isActive = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [adinkraSymbols]); // Proper dependency guard

  if (!adinkraSymbols || adinkraSymbols.length === 0) {
    return null;
  }

  const currentSymbolName = adinkraSymbols[currentIndex];
  const currentSymbol = SELECTABLE_ADINKRA_SYMBOLS.find(s => s.name === currentSymbolName);
  const SvgComponent = AdinkraSvgComponents[currentSymbolName as AdinkraSymbolName];

  if (!currentSymbol || !SvgComponent) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-1 bg-transparent p-2 rounded-lg">
      {adinkraSymbols.length > 1 && (
        <div className="flex gap-1">
          {adinkraSymbols.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-700 ease-in-out ${
                idx === currentIndex 
                  ? 'bg-primary w-3 shadow-lg' 
                  : 'bg-muted-foreground/30 w-1.5'
              }`}
              style={{
                transform: idx === currentIndex ? 'scale(1.1)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      )}
      <div 
        className={`w-10 h-10 flex items-center justify-center transition-all duration-500 ease-in-out ${
          isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
        style={{ 
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
          transform: `scale(${isTransitioning ? '0.95' : '1'}) rotate(${isTransitioning ? '5deg' : '0deg'})`
        }}
      >
        <SvgComponent className="w-10 h-10" />
      </div>
    </div>
  );
});

export default UserAdinkraDisplay;
