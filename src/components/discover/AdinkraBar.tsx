import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AFRICAN_SYMBOL_GROUPS, type AfricanSymbol } from '@/constants/africanSymbols';

const ROTATE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const SYMBOLS_PER_SET = 4;

interface AdinkraBarProps {
  userCountry?: string; // User's country to determine which symbols to show
}

const AdinkraSymbol: React.FC<{ svgContent: string }> = ({ svgContent }) => {
  // Extract inner content from SVG (remove outer <svg> tags) and scale viewBox
  const innerContent = svgContent
    .replace(/<svg[^>]*>/, '') // Remove opening svg tag
    .replace(/<\/svg>/, ''); // Remove closing svg tag

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 48 48"
      dangerouslySetInnerHTML={{ __html: innerContent }}
    />
  );
};

const AdinkraBar: React.FC<AdinkraBarProps> = ({ userCountry }) => {
  const [tooltip, setTooltip] = useState<{ idx: number; x: number; y: number } | null>(null);
  const [setIndex, setSetIndex] = useState(0);
  const barRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  
  // Get symbols based on user's country, mixing with European symbols
  const symbolPool = useMemo(() => {
    const europeanGroup = AFRICAN_SYMBOL_GROUPS.find(g => g.id === 'western-zodiac');
    const europeanSymbols = europeanGroup?.symbols || [];
    
    // Try to find user's country symbols
    let userCountrySymbols: AfricanSymbol[] = [];
    if (userCountry) {
      const normalizedCountry = userCountry.toLowerCase().trim();
      
      // Map common country names to symbol group IDs
      const countryMap: Record<string, string> = {
        'ghana': 'ghana-adinkra',
        'nigeria': 'nigeria-nsibidi',
        'ethiopia': 'ethiopia-geez',
        'benin': 'benin-ifa',
        'zimbabwe': 'zimbabwe-ndebele',
        'south africa': 'south-africa-san',
        'congo': 'congo-kuba',
        'mali': 'mali-dogon',
        'morocco': 'morocco-berber',
        'egypt': 'egypt-hieroglyphs',
        'united states': 'western-zodiac',
        'usa': 'western-zodiac',
        'us': 'western-zodiac',
        'canada': 'western-zodiac',
        'mexico': 'western-zodiac',
        'brazil': 'western-zodiac'
      };
      
      const groupId = countryMap[normalizedCountry];
      if (groupId) {
        const group = AFRICAN_SYMBOL_GROUPS.find(g => g.id === groupId);
        userCountrySymbols = group?.symbols || [];
      }
    }
    
    // If no country-specific symbols, use Ghana Adinkra as default
    if (userCountrySymbols.length === 0) {
      const ghanaGroup = AFRICAN_SYMBOL_GROUPS.find(g => g.id === 'ghana-adinkra');
      userCountrySymbols = ghanaGroup?.symbols || [];
    }
    
    // Mix: 60% user country symbols, 40% European symbols
    const totalSymbols = Math.max(userCountrySymbols.length, 8);
    const userSymbolCount = Math.ceil(totalSymbols * 0.6);
    const europeanSymbolCount = Math.ceil(totalSymbols * 0.4);
    
    // Shuffle and combine
    const shuffledUserSymbols = [...userCountrySymbols].sort(() => Math.random() - 0.5);
    const shuffledEuropeanSymbols = [...europeanSymbols].sort(() => Math.random() - 0.5);
    
    const mixed: AfricanSymbol[] = [];
    
    // Alternate between user and European symbols
    for (let i = 0; i < Math.max(userSymbolCount, europeanSymbolCount); i++) {
      if (i < shuffledUserSymbols.length && mixed.length < totalSymbols) {
        mixed.push(shuffledUserSymbols[i]);
      }
      if (i < shuffledEuropeanSymbols.length && mixed.length < totalSymbols) {
        mixed.push(shuffledEuropeanSymbols[i]);
      }
    }
    
    return mixed;
  }, [userCountry]);
  
  useEffect(() => {
    const maxSets = Math.ceil(symbolPool.length / SYMBOLS_PER_SET);
    const interval = setInterval(() => {
      setSetIndex(prev => (prev + 1) % maxSets);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [symbolPool.length]);

  useEffect(() => {
    setTooltip(null);
  }, [setIndex, symbolPool.length]);

  useEffect(() => {
    if (!tooltip) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (tooltipRef.current?.contains(target)) return;
      if (barRef.current?.contains(target)) return;
      setTooltip(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTooltip(null);
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [tooltip]);
  
  const start = setIndex * SYMBOLS_PER_SET;
  const visibleSymbols = symbolPool.slice(start, start + SYMBOLS_PER_SET);
  
  return (
    <div
      ref={barRef}
      className="w-full flex justify-center items-center gap-1.5 relative select-none z-40 leading-none overflow-visible"
      style={{
        backgroundColor: 'rgb(var(--app-light-bg-rgb))',
        backgroundImage: `url('data:image/svg+xml;utf8,<svg width="240" height="36" viewBox="0 0 240 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="36" fill="%23007bdb"/><g><rect x="0" y="0" width="24" height="36" fill="%23ffc72c"/><rect x="24" y="0" width="24" height="36" fill="%23007bdb"/><rect x="48" y="0" width="24" height="36" fill="%23ffc72c"/><rect x="72" y="0" width="24" height="36" fill="%23007bdb"/><rect x="96" y="0" width="24" height="36" fill="%23ffc72c"/><rect x="120" y="0" width="24" height="36" fill="%23007bdb"/><rect x="144" y="0" width="24" height="36" fill="%23ffc72c"/><rect x="168" y="0" width="24" height="36" fill="%23007bdb"/><rect x="192" y="0" width="24" height="36" fill="%23ffc72c"/><rect x="216" y="0" width="24" height="36" fill="%23007bdb"/></g><g><polygon points="24,0 36,18 24,36 48,36 36,18 48,0" fill="%23e63946"/><polygon points="72,0 84,18 72,36 96,36 84,18 96,0" fill="%2300b159"/><polygon points="120,0 132,18 120,36 144,36 132,18 144,0" fill="%23e63946"/><polygon points="168,0 180,18 168,36 192,36 180,18 192,0" fill="%2300b159"/></g><g><rect x="0" y="0" width="240" height="6" fill="%23fff" fill-opacity="0.15"/><rect x="0" y="30" width="240" height="6" fill="%23fff" fill-opacity="0.15"/></g><g><rect x="23" y="0" width="2" height="36" fill="%23fff"/><rect x="47" y="0" width="2" height="36" fill="%23fff"/><rect x="71" y="0" width="2" height="36" fill="%23fff"/><rect x="95" y="0" width="2" height="36" fill="%23fff"/><rect x="119" y="0" width="2" height="36" fill="%23fff"/><rect x="143" y="0" width="2" height="36" fill="%23fff"/><rect x="167" y="0" width="2" height="36" fill="%23fff"/><rect x="191" y="0" width="2" height="36" fill="%23fff"/><rect x="215" y="0" width="2" height="36" fill="%23fff"/></g></svg>')`,
        backgroundRepeat: 'repeat',
        backgroundSize: '200px 30px',
        paddingTop: '2px',
        paddingBottom: '2px',
      }}
    >
      {visibleSymbols.map((symbol, idx) => (
        <button
          key={`${symbol.name}-${idx}`}
          className="focus:outline-none bg-white rounded-full shadow hover:scale-110 transition-transform border border-yellow-300 shrink-0"
          style={{
            width: 'clamp(20px, 5.8vw, 26px)',
            height: 'clamp(17px, 5vw, 22px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={(e) => {
            const buttonRect = e.currentTarget.getBoundingClientRect();
            const barRect = barRef.current?.getBoundingClientRect();
            if (!barRect) return;
            const nextIdx = start + idx;
            setTooltip(prev => (
              prev?.idx === nextIdx
                ? null
                : {
                    idx: nextIdx,
                    x: buttonRect.left - barRect.left + buttonRect.width / 2,
                    y: 0,
                  }
            ));
          }}
          tabIndex={0}
          aria-label={symbol.name + ' symbol'}
        >
          <div style={{ width: '76%', height: '76%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AdinkraSymbol svgContent={symbol.svg} />
          </div>
        </button>
      ))}
      {tooltip !== null && tooltip.idx < symbolPool.length && (
        <div
          ref={tooltipRef}
          className="absolute bottom-full mb-2 z-[120] px-4 py-3 rounded-xl shadow-lg border border-pink-500/40 text-xs text-white animate-fade-in flex flex-col items-center bg-neutral-900/95 backdrop-blur-md"
          style={{ left: tooltip.x, transform: 'translateX(-50%)', minWidth: 180, maxWidth: 260 }}
        >
          <strong className="text-base mb-1">{symbolPool[tooltip.idx].name}</strong>
          <div className="mt-1 text-center">{symbolPool[tooltip.idx].meaning}</div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AdinkraBar);
