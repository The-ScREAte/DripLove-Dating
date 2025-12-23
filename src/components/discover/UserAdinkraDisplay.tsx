import React, { useState, useEffect, useRef } from 'react';
import { AFRICAN_SYMBOL_GROUPS } from '@/constants/africanSymbols';
import { AdinkraSvgComponents, type AdinkraSymbolName } from '@/components/adinkra/AdinkraSvgs';

// Flatten all symbols for easy lookup
const ALL_SYMBOLS = AFRICAN_SYMBOL_GROUPS.flatMap(group => group.symbols);

interface UserAdinkraDisplayProps {
  adinkraSymbols: string[];
}

const normalizeSvgSize = (svg: string, size: number) => {
  // Ensure the rendered SVG fits inside our fixed-size container.
  // Preserve stroke-width and other attributes, only adjust dimensions.
  return svg
    .replace(/width=("|')\d+("|')/g, `width="${size}"`)
    .replace(/height=("|')\d+("|')/g, `height="${size}"`)
    .replace(/stroke-width=("|')40("|')/g, `stroke-width="3"`) // Fix malformed stroke-width
    .replace(/stroke-width=("|')(\d+)("|')/g, (match, q1, width, q2) => {
      // Scale stroke-width proportionally if original was for 48px
      const originalSize = 48;
      const scaledWidth = Math.max(1, Math.round((parseInt(width) * size) / originalSize));
      return `stroke-width="${scaledWidth}"`;
    });
};

const UserAdinkraDisplay: React.FC<UserAdinkraDisplayProps> = React.memo(({ adinkraSymbols }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(0);
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
          const next = (currentIndex + 1) % adinkraSymbols.length;
          setNextIndex(next);
          setIsTransitioning(true);
          
          // After crossfade completes, smoothly update current index
          setTimeout(() => {
            if (isActive) {
              // Use requestAnimationFrame to ensure smooth state update
              requestAnimationFrame(() => {
                if (isActive) {
                  setCurrentIndex(next);
                  // Small delay to prevent flash, then end transition
                  setTimeout(() => {
                    if (isActive) {
                      setIsTransitioning(false);
                      lastUpdateRef.current = now;
                    }
                  }, 50);
                }
              });
            }
          }, 4000); // Slightly before CSS transition ends
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
  }, [adinkraSymbols, currentIndex]); // Include currentIndex in dependencies

  if (!adinkraSymbols || adinkraSymbols.length === 0) {
    return null;
  }

  const currentSymbolName = adinkraSymbols[currentIndex];
  const currentSymbol = ALL_SYMBOLS.find(s => s.name === currentSymbolName);
  const CurrentSvgComponent = AdinkraSvgComponents[currentSymbolName as AdinkraSymbolName];

  const nextSymbolName = adinkraSymbols[nextIndex];
  const nextSymbol = ALL_SYMBOLS.find(s => s.name === nextSymbolName);
  const NextSvgComponent = AdinkraSvgComponents[nextSymbolName as AdinkraSymbolName];

  if (!currentSymbol || (!CurrentSvgComponent && !currentSymbol.svg)) {
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
      <div className="relative w-10 h-10 flex items-center justify-center">
        {/* Current Symbol - always rendered */}
        <div 
          className="absolute inset-0 w-10 h-10 flex items-center justify-center transition-opacity duration-500 ease-in-out"
          style={{ 
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
            opacity: isTransitioning ? 0 : 1,
            transform: 'scale(1) rotate(0deg)',
            zIndex: isTransitioning ? 1 : 2
          }}
        >
          {CurrentSvgComponent ? (
            <CurrentSvgComponent className="w-10 h-10" />
          ) : (
            <span
              className="block"
              style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              dangerouslySetInnerHTML={{ __html: normalizeSvgSize(currentSymbol.svg, 40) }}
            />
          )}
        </div>
        
        {/* Next Symbol - rendered during transition and becomes visible */}
        {(NextSvgComponent || nextSymbol?.svg) && (
          <div 
            className="absolute inset-0 w-10 h-10 flex items-center justify-center transition-opacity duration-500 ease-in-out"
            style={{ 
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
              opacity: isTransitioning ? 1 : 0,
              transform: 'scale(1) rotate(0deg)',
              zIndex: isTransitioning ? 2 : 1
            }}
          >
            {NextSvgComponent ? (
              <NextSvgComponent className="w-10 h-10" />
            ) : nextSymbol?.svg ? (
              <span
                className="block"
                style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: normalizeSvgSize(nextSymbol.svg, 40) }}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});

export default UserAdinkraDisplay;
