import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
      width="24" 
      height="24" 
      viewBox="0 0 48 48"
      dangerouslySetInnerHTML={{ __html: innerContent }}
    />
  );
};

const AdinkraBar: React.FC<AdinkraBarProps> = ({ userCountry }) => {
  const { t } = useTranslation();
  const [tooltipIdx, setTooltipIdx] = useState<number | null>(null);
  const [setIndex, setSetIndex] = useState(0);
  
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
  
  const start = setIndex * SYMBOLS_PER_SET;
  const visibleSymbols = symbolPool.slice(start, start + SYMBOLS_PER_SET);
  
  return (
    <div
      className="w-full flex justify-center items-center gap-2 relative select-none z-40 leading-none border-2 border-pink-300 overflow-hidden rounded-t-xl"
      style={{
        backgroundColor: 'rgb(253 242 248)',
        backgroundImage: `url('data:image/svg+xml;utf8,<svg width="240" height="36" viewBox="0 0 240 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="36" fill="%23007bdb"/><g><rect x="0" y="0" width="24" height="36" fill="%23ffc72c"/><rect x="24" y="0" width="24" height="36" fill="%23007bdb"/><rect x="48" y="0" width="24" height="36" fill="%23ffc72c"/><rect x="72" y="0" width="24" height="36" fill="%23007bdb"/><rect x="96" y="0" width="24" height="36" fill="%23ffc72c"/><rect x="120" y="0" width="24" height="36" fill="%23007bdb"/><rect x="144" y="0" width="24" height="36" fill="%23ffc72c"/><rect x="168" y="0" width="24" height="36" fill="%23007bdb"/><rect x="192" y="0" width="24" height="36" fill="%23ffc72c"/><rect x="216" y="0" width="24" height="36" fill="%23007bdb"/></g><g><polygon points="24,0 36,18 24,36 48,36 36,18 48,0" fill="%23e63946"/><polygon points="72,0 84,18 72,36 96,36 84,18 96,0" fill="%2300b159"/><polygon points="120,0 132,18 120,36 144,36 132,18 144,0" fill="%23e63946"/><polygon points="168,0 180,18 168,36 192,36 180,18 192,0" fill="%2300b159"/></g><g><rect x="0" y="0" width="240" height="6" fill="%23fff" fill-opacity="0.15"/><rect x="0" y="30" width="240" height="6" fill="%23fff" fill-opacity="0.15"/></g><g><rect x="23" y="0" width="2" height="36" fill="%23fff"/><rect x="47" y="0" width="2" height="36" fill="%23fff"/><rect x="71" y="0" width="2" height="36" fill="%23fff"/><rect x="95" y="0" width="2" height="36" fill="%23fff"/><rect x="119" y="0" width="2" height="36" fill="%23fff"/><rect x="143" y="0" width="2" height="36" fill="%23fff"/><rect x="167" y="0" width="2" height="36" fill="%23fff"/><rect x="191" y="0" width="2" height="36" fill="%23fff"/><rect x="215" y="0" width="2" height="36" fill="%23fff"/></g></svg>')`,
        backgroundRepeat: 'repeat',
        backgroundSize: '240px 36px',
        transform: 'translateY(-1px)',
      }}
    >
      {visibleSymbols.map((symbol, idx) => (
        <button
          key={`${symbol.name}-${idx}`}
          className="focus:outline-none bg-white rounded-full shadow hover:scale-110 transition-transform border border-yellow-300"
          style={{ width: 32, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setTooltipIdx(start + idx)}
          tabIndex={0}
          aria-label={symbol.name + ' symbol'}
        >
          <AdinkraSymbol svgContent={symbol.svg} />
        </button>
      ))}
      {tooltipIdx !== null && tooltipIdx < symbolPool.length && (
        <div
          className="fixed left-1/2 top-1/12 z-50 px-4 py-3 rounded-lg shadow-lg bg-white border border-gray-300 text-xs text-gray-800 animate-fade-in flex flex-col items-center"
          style={{ transform: 'translate(-50%, -75%)', minWidth: 180, maxWidth: 260 }}
          onClick={() => setTooltipIdx(null)}
        >
          <strong className="text-base mb-1">{symbolPool[tooltipIdx].name}</strong>
          <div className="mt-1 text-center">{symbolPool[tooltipIdx].meaning}</div>
          <div className="text-[10px] text-gray-400 mt-2">({t('common.clickToClose')})</div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AdinkraBar);
