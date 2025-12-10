import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Adinkra symbols data - SVGs stored as strings to avoid JSX parsing issues
const adinkraSymbols = [
  { 
    name: 'Aya', 
    meaning: 'The fern. Symbol of endurance and resourcefulness.',
    svgContent: '<ellipse cx="12" cy="12" rx="10" ry="6" fill="#A5D6A7" stroke="#388E3C" stroke-width="2"/><path d="M12 6v12M9 9l6 6M15 9l-6 6" stroke="#388E3C" stroke-width="2"/>'
  },
  { 
    name: 'Nkyinkyim', 
    meaning: 'Twisting. Symbol of initiative, dynamism, and versatility.',
    svgContent: '<path d="M6 18c6-12 12 0 12-12" stroke="#E53935" stroke-width="2" fill="none"/><circle cx="6" cy="18" r="1.5" fill="#F9A825"/><circle cx="18" cy="6" r="1.5" fill="#43A047"/>'
  },
  { 
    name: 'Eban', 
    meaning: 'Fence. Symbol of love, safety, and security.',
    svgContent: '<rect x="4" y="4" width="16" height="16" rx="4" fill="#FFFDE7" stroke="#E53935" stroke-width="2"/><path d="M7 4v16M12 4v16M17 4v16" stroke="#43A047" stroke-width="2"/>'
  },
  { 
    name: 'Fihankra', 
    meaning: 'House/compound. Symbol of security and safety.',
    svgContent: '<rect x="6" y="10" width="12" height="8" fill="#E3F2FD" stroke="#1E88E5" stroke-width="2"/><polygon points="12,4 6,10 18,10" fill="#F9A825" stroke="#E53935" stroke-width="2"/>'
  },
  { 
    name: 'Gye Nyame', 
    meaning: 'Except for God. Symbol of the supremacy of God.',
    svgContent: '<circle cx="12" cy="12" r="11" stroke="#F9A825" stroke-width="2" fill="#FFFDE7"/><path d="M12 5c-1.5 1.5-1.5 4.5 0 6s1.5 4.5 0 6" stroke="#E53935" stroke-width="2" fill="none"/><path d="M12 19c1.5-1.5 1.5-4.5 0-6s-1.5-4.5 0-6" stroke="#43A047" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="1.5" fill="#1E88E5"/>'
  },
  { 
    name: 'Sankofa', 
    meaning: 'Go back and get it. Symbol of learning from the past.',
    svgContent: '<circle cx="12" cy="12" r="11" stroke="#43A047" stroke-width="2" fill="#E8F5E9"/><path d="M16 12c0-2.2-1.8-4-4-4s-4 1.8-4 4 1.8 4 4 4c1.5 0 3-1.2 3-3" stroke="#E53935" stroke-width="2" fill="none"/><path d="M12 15l3-3-3-3" stroke="#F9A825" stroke-width="2" fill="none"/>'
  },
  { 
    name: 'Duafe', 
    meaning: 'Wooden comb. Symbol of beauty, cleanliness, feminine qualities.',
    svgContent: '<rect x="3" y="6" width="18" height="12" rx="6" fill="#FFF3E0" stroke="#E53935" stroke-width="2"/><rect x="9" y="3" width="6" height="6" rx="3" fill="#F9A825" stroke="#43A047" stroke-width="2"/><rect x="7" y="15" width="1.5" height="4" fill="#1E88E5"/><rect x="11" y="15" width="1.5" height="4" fill="#1E88E5"/><rect x="15" y="15" width="1.5" height="4" fill="#1E88E5"/>'
  },
  { 
    name: 'Fawohodie', 
    meaning: 'Independence. Symbol of freedom, emancipation, independence.',
    svgContent: '<rect x="6" y="6" width="12" height="12" rx="6" fill="#E3F2FD" stroke="#1E88E5" stroke-width="2"/><path d="M12 6v12M6 12h12" stroke="#E53935" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="#F9A825"/>'
  },
  { 
    name: 'Akoma', 
    meaning: 'The heart. Symbol of patience and tolerance.',
    svgContent: '<path d="M12 21s-6-4.5-6-9a6 6 0 0 1 12 0c0 4.5-6 9-6 9z" fill="#E53935" stroke="#F9A825" stroke-width="2"/><circle cx="9" cy="10.5" r="1.5" fill="#FFFDE7"/><circle cx="15" cy="10.5" r="1.5" fill="#FFFDE7"/>'
  },
  { 
    name: 'Akoben', 
    meaning: 'War horn. Symbol of vigilance and wariness.',
    svgContent: '<ellipse cx="12" cy="12" rx="10" ry="6" fill="#a5d6a7" stroke="#388e3c" stroke-width="2"/><path d="M12 6v12M9 9l6 6M15 9l-6 6" stroke="#388e3c" stroke-width="2"/>'
  },
  { 
    name: 'Adinkrahene', 
    meaning: 'Chief of the adinkra symbols. Symbol of greatness, charisma, and leadership.',
    svgContent: '<circle cx="12" cy="12" r="10" fill="#f9a825" stroke="#e53935" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="#43a047"/>'
  },
  { 
    name: 'Bese Saka', 
    meaning: 'Sack of cola nuts. Symbol of affluence, power, abundance, unity.',
    svgContent: '<ellipse cx="12" cy="15" rx="8" ry="5" fill="#e3f2fd" stroke="#1e88e5" stroke-width="2"/><ellipse cx="12" cy="9" rx="5" ry="3" fill="#f9a825" stroke="#e53935" stroke-width="2"/>'
  },
  { 
    name: 'Dame-Dame', 
    meaning: 'Checkerboard. Symbol of intelligence and ingenuity.',
    svgContent: '<rect x="4" y="4" width="16" height="16" fill="#fffde7" stroke="#e53935" stroke-width="2"/><rect x="4" y="4" width="8" height="8" fill="#43a047"/><rect x="12" y="12" width="8" height="8" fill="#f9a825"/>'
  },
  { 
    name: 'Dwennimmen', 
    meaning: "Ram's horns. Symbol of humility together with strength.",
    svgContent: '<circle cx="12" cy="12" r="10" fill="#fff3e0" stroke="#e53935" stroke-width="2"/><path d="M8 16c-3-3 3-9 6-6" stroke="#43a047" stroke-width="2" fill="none"/><path d="M16 16c3-3-3-9-6-6" stroke="#43a047" stroke-width="2" fill="none"/>'
  },
  { 
    name: 'Nyame Dua', 
    meaning: "Tree of God. Symbol of God's presence and protection.",
    svgContent: '<rect x="10" y="14" width="4" height="8" fill="#43a047"/><circle cx="12" cy="10" r="6" fill="#f9a825" stroke="#e53935" stroke-width="2"/>'
  },
  { 
    name: 'Boa Me Na Me Mmoa Wo', 
    meaning: 'Help me and let me help you. Symbol of cooperation and interdependence.',
    svgContent: '<rect x="6" y="6" width="12" height="12" rx="6" fill="#e3f2fd" stroke="#1e88e5" stroke-width="2"/><path d="M12 6v12M6 12h12" stroke="#e53935" stroke-width="2"/>'
  },
];

const ROTATE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const SYMBOLS_PER_SET = 4;

const AdinkraSymbol: React.FC<{ svgContent: string }> = ({ svgContent }) => (
  <svg 
    width="24" 
    height="24" 
    viewBox="0 0 24 24"
    dangerouslySetInnerHTML={{ __html: svgContent }}
  />
);

const AdinkraBar: React.FC = () => {
  const { t } = useTranslation();
  const [tooltipIdx, setTooltipIdx] = useState<number | null>(null);
  const [setIndex, setSetIndex] = useState(() => Math.floor(Math.random() * Math.ceil(adinkraSymbols.length / SYMBOLS_PER_SET)));
  
  useEffect(() => {
    const interval = setInterval(() => {
      let next;
      do {
        next = Math.floor(Math.random() * Math.ceil(adinkraSymbols.length / SYMBOLS_PER_SET));
      } while (next === setIndex && Math.ceil(adinkraSymbols.length / SYMBOLS_PER_SET) > 1);
      setSetIndex(next);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [setIndex]);
  
  const start = setIndex * SYMBOLS_PER_SET;
  const visibleSymbols = adinkraSymbols.slice(start, start + SYMBOLS_PER_SET);
  
  return (
    <div
      className="w-full flex justify-center items-center gap-2 relative select-none z-40 leading-none"
      style={{
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
          <AdinkraSymbol svgContent={symbol.svgContent} />
        </button>
      ))}
      {tooltipIdx !== null && tooltipIdx < adinkraSymbols.length && (
        <div
          className="fixed left-1/2 top-1/12 z-50 px-4 py-3 rounded-lg shadow-lg bg-white border border-gray-300 text-xs text-gray-800 animate-fade-in flex flex-col items-center"
          style={{ transform: 'translate(-50%, -75%)', minWidth: 180, maxWidth: 260 }}
          onClick={() => setTooltipIdx(null)}
        >
          <strong className="text-base mb-1">{adinkraSymbols[tooltipIdx].name}</strong>
          <div className="mt-1 text-center">{t(`adinkraMeanings.${adinkraSymbols[tooltipIdx].name}`)}</div>
          <div className="text-[10px] text-gray-400 mt-2">({t('common.clickToClose')})</div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AdinkraBar);
