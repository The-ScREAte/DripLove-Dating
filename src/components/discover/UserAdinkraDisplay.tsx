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
      <div className="flex items-center gap-2 bg-transparent p-1 rounded-full">
        {visibleSymbols.map(({ name, symbol, SvgComponent }, index) => {
          const isCenter = index === centerIndex;
          const size = isCenter ? CENTER_ICON_SIZE : SIDE_ICON_SIZE;
          const boxSize = size + (isCenter ? 8 : 6);

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
              className="rounded-full bg-white/90 flex items-center justify-center shrink-0 transition-transform duration-150 active:scale-90"
              style={{
                width: boxSize,
                height: boxSize,
                boxShadow: isCenter ? '0 3px 8px rgba(0,0,0,0.3)' : '0 2px 5px rgba(0,0,0,0.22)',
                border: '1px solid rgba(255,255,255,0.6)',
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
        <div
          className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-48 rounded-xl bg-black border border-pink-500/30 shadow-xl p-3 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setActiveMeaning(null)}
            className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
          <p className="text-pink-400 font-semibold text-xs mb-1">{activeMeaning.name}</p>
          <p className="text-gray-200 text-[11px] leading-snug">{activeMeaning.meaning}</p>
        </div>
      )}
    </div>
  );
});

export default UserAdinkraDisplay;
