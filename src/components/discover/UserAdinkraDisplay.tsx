import React from 'react';
import { AFRICAN_SYMBOL_GROUPS } from '@/constants/africanSymbols';
import { AdinkraSvgComponents, type AdinkraSymbolName } from '@/components/adinkra/AdinkraSvgs';

// Flatten all symbols for easy lookup
const ALL_SYMBOLS = AFRICAN_SYMBOL_GROUPS.flatMap(group => group.symbols);

const ICON_SIZE = 26;
const MAX_VISIBLE = 4;

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

// Shows all of the user's sign symbols lined up together (instead of rotating through them
// one at a time), so a viewer can see everything at a glance.
const UserAdinkraDisplay: React.FC<UserAdinkraDisplayProps> = React.memo(({ adinkraSymbols }) => {
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

  return (
    <div className="flex items-center gap-1.5 bg-transparent p-1 rounded-full">
      {visibleSymbols.map(({ name, symbol, SvgComponent }) => (
        <div
          key={name}
          className="rounded-full bg-white/90 flex items-center justify-center shrink-0"
          style={{
            width: ICON_SIZE + 8,
            height: ICON_SIZE + 8,
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}
        >
          {SvgComponent ? (
            <SvgComponent className="w-[26px] h-[26px]" />
          ) : symbol?.svg ? (
            <span
              className="block"
              style={{ width: ICON_SIZE, height: ICON_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              dangerouslySetInnerHTML={{ __html: normalizeSvgSize(symbol.svg, ICON_SIZE) }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
});

export default UserAdinkraDisplay;
