import React, { useState, useEffect } from 'react';
import { SELECTABLE_ADINKRA_SYMBOLS } from '@/constants/adinkraSymbols';

interface UserAdinkraDisplayProps {
  adinkraSymbols: string[];
}

const UserAdinkraDisplay: React.FC<UserAdinkraDisplayProps> = ({ adinkraSymbols }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (adinkraSymbols.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % adinkraSymbols.length);
    }, 3000); // Rotate every 3 seconds

    return () => clearInterval(interval);
  }, [adinkraSymbols.length]);

  if (!adinkraSymbols || adinkraSymbols.length === 0) {
    return null;
  }

  const currentSymbolName = adinkraSymbols[currentIndex];
  const currentSymbol = SELECTABLE_ADINKRA_SYMBOLS.find(s => s.name === currentSymbolName);

  if (!currentSymbol) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 bg-transparent p-2 rounded-lg">
      <div 
        className="w-10 h-10 flex items-center justify-center transition-all duration-500 ease-in-out"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
        dangerouslySetInnerHTML={{ __html: currentSymbol.svg }}
      />
      {adinkraSymbols.length > 1 && (
        <div className="flex gap-1">
          {adinkraSymbols.map((_, idx) => (
            <div
              key={idx}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                idx === currentIndex ? 'bg-primary w-3' : 'bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default UserAdinkraDisplay;
