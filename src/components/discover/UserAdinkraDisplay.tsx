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
  const [activeMeaning, setActiveMeaning] = useState<{ name: string; meaning: string; align: 'left' | 'center' | 'right' } | null>(null);

  if (!adinkraSymbols || adinkraSymbols.length === 0) {
    return null;
  }

  const visibleSymbols = adinkraSymbols
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
          const align: 'left' | 'center' | 'right' =
            index === 0 ? 'left' : index === visibleSymbols.length - 1 ? 'right' : 'center';

          return (
            <button
              key={name}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMeaning({ name, meaning: symbol?.meaning || '', align });
              }}
              className="flex items-center justify-center shrink-0 transition-transform duration-150 active:scale-90"
              style={{
                width: size,
                height: size,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
                zIndex: isCenter ? 2 : 1,
              }}
              aria-label={`Show meaning of ${name}`}
            >
              {renderSymbolContent(name, symbol, SvgComponent, size)}
            </button>
          );
        })}
      </div>

      {activeMeaning && (
        <>
          {/* Full-viewport tap-catcher — any tap outside the popup itself closes it. A plain
              backdrop like this is far more reliable across touch/mouse/devices than a
              document-level click listener (no risk of missing the event due to stopPropagation
              elsewhere in the tree, no passive-listener/touch quirks to work around). */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setActiveMeaning(null)}
            className="fixed inset-0 z-40"
            style={{ background: 'transparent', border: 'none', padding: 0 }}
          />
          <div
            className={`absolute top-full mt-2 z-50 flex flex-col ${
              activeMeaning.align === 'left'
                ? 'left-0 items-start'
                : activeMeaning.align === 'right'
                  ? 'right-0 items-end'
                  : 'left-1/2 -translate-x-1/2 items-center'
            }`}
          >
            {/* Little speech-bubble tail pointing up at the symbols */}
            <div
              className="w-3 h-3 rotate-45 -mb-1.5"
              style={{ background: 'rgba(10,10,10,0.85)', borderLeft: '1px solid rgba(236,72,153,0.35)', borderTop: '1px solid rgba(236,72,153,0.35)' }}
            />
            <div
              className="relative w-44 rounded-xl backdrop-blur-md border border-pink-500/35 shadow-xl px-1.5 py-1 text-left cursor-pointer"
              style={{ background: 'rgba(10,10,10,0.85)' }}
              onClick={(e) => {
                e.stopPropagation();
                setActiveMeaning(null);
              }}
            >
              <p className="text-[10.5px] leading-snug">
                <span className="text-pink-400 font-semibold">{activeMeaning.name}</span>
                <span className="text-gray-200">: {activeMeaning.meaning}</span>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default UserAdinkraDisplay;
