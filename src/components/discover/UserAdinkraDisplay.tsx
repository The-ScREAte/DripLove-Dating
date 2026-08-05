import React, { useState } from 'react';
import { AFRICAN_SYMBOL_GROUPS } from '@/constants/africanSymbols';
import { AdinkraSvgComponents, type AdinkraSymbolName } from '@/components/adinkra/AdinkraSvgs';

// Flatten all symbols for easy lookup
const ALL_SYMBOLS = AFRICAN_SYMBOL_GROUPS.flatMap(group => group.symbols);

const CENTER_ICON_SIZE = 22;
const SIDE_ICON_SIZE = 15;
const MAX_VISIBLE = 3;

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

// Shows the user's sign symbols as a small stack — a bigger one in the center flanked by
// two smaller ones on the sides. Tapping the center symbol opens a meaning popup; tapping
// a side symbol dismisses it from the stack.
const UserAdinkraDisplay: React.FC<UserAdinkraDisplayProps> = React.memo(({ adinkraSymbols }) => {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [activeMeaning, setActiveMeaning] = useState<{ name: string; meaning: string } | null>(null);

  if (!adinkraSymbols || adinkraSymbols.length === 0) {
    return null;
  }

  const visibleSymbols = adinkraSymbols
    .filter(name => !dismissed.has(name))
    .slice(0, MAX_VISIBLE)
    .map(name => ({
      name,
      symbol: ALL_SYMBOLS.find(s => s.name === name),
      SvgComponent: AdinkraSvgComponents[name as AdinkraSymbolName],
    }))
    .filter(({ symbol, SvgComponent }) => SvgComponent || symbol?.svg);

  if (visibleSymbols.length === 0) {
    return null;
  }

  const centerIndex = Math.floor((visibleSymbols.length - 1) / 2);

  const renderSymbolContent = (
    name: string,
    symbol: (typeof ALL_SYMBOLS)[number] | undefined,
    SvgComponent: React.ComponentType<{ className?: string }> | undefined,
    size: number
  ) => (
    SvgComponent ? (
      <span className="block" style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SvgComponent className="w-full h-full" />
      </span>
    ) : symbol?.svg ? (
      <span
        className="block"
        style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        dangerouslySetInnerHTML={{ __html: normalizeSvgSize(symbol.svg, size) }}
      />
    ) : null
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-3">
        {visibleSymbols.map(({ name, symbol, SvgComponent }, index) => {
          const isCenter = index === centerIndex;
          const size = isCenter ? CENTER_ICON_SIZE : SIDE_ICON_SIZE;

          return (
            <button
              key={name}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isCenter) {
                  setActiveMeaning({ name, meaning: symbol?.meaning || '' });
                } else {
                  setDismissed(prev => new Set(prev).add(name));
                }
              }}
              className="flex items-center justify-center shrink-0 transition-transform duration-150 active:scale-90"
              style={{
                width: size,
                height: size,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
                zIndex: isCenter ? 2 : 1,
              }}
              aria-label={isCenter ? `Show meaning of ${name}` : `Dismiss ${name}`}
            >
              {renderSymbolContent(name, symbol, SvgComponent, size)}
            </button>
          );
        })}
      </div>

      {activeMeaning && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
          {/* Little speech-bubble tail pointing up at the symbols */}
          <div
            className="w-3 h-3 rotate-45 -mb-1.5"
            style={{ background: '#0a0a0a', borderLeft: '1px solid rgba(236,72,153,0.35)', borderTop: '1px solid rgba(236,72,153,0.35)' }}
          />
          <div
            className="relative w-44 rounded-2xl bg-[#0a0a0a] border border-pink-500/35 shadow-xl px-2.5 py-2 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveMeaning(null)}
              className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 text-[10px] leading-none"
              aria-label="Close"
            >
              ✕
            </button>
            <p className="text-pink-400 font-semibold text-[11px] mb-0.5 pr-3">{activeMeaning.name}</p>
            <p className="text-gray-200 text-[10.5px] leading-snug">{activeMeaning.meaning}</p>
          </div>
        </div>
      )}
    </div>
  );
});

export default UserAdinkraDisplay;
