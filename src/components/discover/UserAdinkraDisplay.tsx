import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AFRICAN_SYMBOL_GROUPS } from '@/constants/africanSymbols';
import { AdinkraSvgComponents, type AdinkraSymbolName } from '@/components/adinkra/AdinkraSvgs';

// Flatten all symbols for easy lookup
const ALL_SYMBOLS = AFRICAN_SYMBOL_GROUPS.flatMap(group => group.symbols);

const CENTER_ICON_SIZE = 20;
const SIDE_ICON_SIZE = 14;
const MAX_VISIBLE = 3;
const POPUP_WIDTH = 176; // matches w-44 below
const VIEWPORT_MARGIN = 8;
const POPUP_GAP = 10; // space between the tapped badge and the popup

interface UserAdinkraDisplayProps {
  adinkraSymbols: string[];
  // Shows the sign's name next to its icon, matching the other "at a glance"
  // trait chips (Extrovert, Messy, etc.) instead of an icon-only badge.
  showLabel?: boolean;
}

const LABEL_ICON_SIZE = 13;

interface ActiveMeaning {
  name: string;
  meaning: string;
  left: number;
  tailLeft: number; // horizontal offset of the speech-bubble tail within the popup
  placement: 'above' | 'below';
  verticalOffset: number; // top (below) or bottom (above) px, depending on placement
}

// Rough popup height used only to decide whether there's room above the
// badge - the box itself sizes to its actual content either way.
const ESTIMATED_POPUP_HEIGHT = 64;

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

// The photo card these badges sit on top of (Discover's MatchCard, and the
// same swipe layout Circle/Liked Me/profile preview all share) tracks
// swipe-to-like/pass gestures with raw onTouchStart/onTouchMove/onTouchEnd
// on the whole card, above this component in the tree. Those fire and
// bubble on ANY touch inside the card, badges included, before a tap ever
// becomes a click - stopPropagation() on the button's own onClick was never
// enough, since it only stops the click, not the touch sequence the card
// already consumed first. Stopping propagation at the touch level itself
// (below) keeps that touch out of the card's swipe tracking entirely, so
// the tap resolves into a normal click afterward instead of being
// swallowed as a (zero-distance) swipe.
const stopTouchPropagation = (e: React.TouchEvent) => e.stopPropagation();

// Every card that hosts these badges (photo card, profile-preview panel,
// Circle/Liked Me detail views) clips its own content with overflow-hidden
// or overflow-y-auto so photos and scroll areas stay within their rounded
// bounds - and each is also its own transformed/positioned stacking context
// for the swipe animation. A popup rendered in-place (position: absolute)
// inherits both problems: it gets clipped by the nearest overflow ancestor,
// or renders behind other UI even when unclipped, since z-index only ever
// wins within its own stacking context. Portaling straight to document.body
// and positioning with fixed coordinates (computed from the tapped badge's
// own bounding rect) sidesteps every ancestor's overflow/transform entirely,
// the same fix already used for MessageBubble's context menu.
const clampPopupLeft = (center: number) => {
  const raw = center - POPUP_WIDTH / 2;
  const maxLeft = window.innerWidth - POPUP_WIDTH - VIEWPORT_MARGIN;
  return Math.max(VIEWPORT_MARGIN, Math.min(raw, maxLeft));
};

// Shows the user's sign symbols as a small stack — a bigger one in the center flanked by
// two smaller ones on the sides. Tapping any symbol opens a meaning popup near it.
const UserAdinkraDisplay: React.FC<UserAdinkraDisplayProps> = React.memo(({ adinkraSymbols, showLabel = false }) => {
  const [activeMeaning, setActiveMeaning] = useState<ActiveMeaning | null>(null);

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

  const openMeaning = (name: string, meaning: string, targetEl: HTMLElement) => {
    const rect = targetEl.getBoundingClientRect();
    const badgeCenter = rect.left + rect.width / 2;
    const left = clampPopupLeft(badgeCenter);
    const tailLeft = Math.max(12, Math.min(badgeCenter - left - 6, POPUP_WIDTH - 24));

    // Prefer directly above the tapped sign (what "meaning on top of the
    // sign" means here) - fall back to below only when there's genuinely
    // not enough room above (e.g. the badge sits right at the top edge).
    const spaceAbove = rect.top;
    const placement: 'above' | 'below' =
      spaceAbove >= ESTIMATED_POPUP_HEIGHT + POPUP_GAP + VIEWPORT_MARGIN ? 'above' : 'below';
    const verticalOffset = placement === 'above'
      ? window.innerHeight - rect.top + POPUP_GAP
      : rect.bottom + POPUP_GAP;

    setActiveMeaning({ name, meaning, left, tailLeft, placement, verticalOffset });
  };

  // Chip mode: the component IS the pill (a single flat <button>, no
  // wrapper divs) so it sits in an "at a glance" chip row exactly like the
  // plain-text trait chips next to it (Extrovert, Messy, ...) - same box
  // model, same height. The earlier version wrapped UserAdinkraDisplay's
  // whole multi-symbol stack (relative + flex divs) inside the caller's own
  // pill <span>, which nested a block layout inside an inline one and threw
  // off both the height and the truncation of long sign names (truncate on
  // the outer span never reaches text buried in a child element - min-w-0
  // below is what actually lets the inner text span shrink and ellipsize).
  if (showLabel) {
    const { name, symbol, SvgComponent } = visibleSymbols[0];
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openMeaning(name, symbol?.meaning || '', e.currentTarget);
          }}
          onTouchStart={stopTouchPropagation}
          onTouchMove={stopTouchPropagation}
          onTouchEnd={stopTouchPropagation}
          className="inline-flex items-center gap-1 min-h-0 max-w-[110px] shrink-0 rounded-full border border-yellow-400/60 bg-yellow-400/10 px-2 py-0.5 text-[clamp(9px,2.8vw,12px)] font-medium text-white/85 transition-transform duration-150 active:scale-90"
          aria-label={`Show meaning of ${name}`}
        >
          {renderSymbolContent(name, symbol, SvgComponent, LABEL_ICON_SIZE)}
          <span className="min-w-0 truncate capitalize">{name}</span>
        </button>
        {activeMeaning && createPortal(
          <>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setActiveMeaning(null)}
              onTouchStart={stopTouchPropagation}
              onTouchMove={stopTouchPropagation}
              onTouchEnd={(e) => { e.stopPropagation(); setActiveMeaning(null); }}
              className="fixed inset-0 z-[9998]"
              style={{ background: 'transparent', border: 'none', padding: 0 }}
            />
            <div
              className={`fixed z-[9999] flex items-start ${
                activeMeaning.placement === 'above' ? 'flex-col-reverse' : 'flex-col'
              }`}
              style={{
                left: activeMeaning.left,
                width: POPUP_WIDTH,
                ...(activeMeaning.placement === 'above'
                  ? { bottom: activeMeaning.verticalOffset }
                  : { top: activeMeaning.verticalOffset }),
              }}
            >
              <div
                className={`w-3 h-3 rotate-45 ${activeMeaning.placement === 'above' ? '-mt-1.5' : '-mb-1.5'}`}
                style={{
                  marginLeft: activeMeaning.tailLeft,
                  background: 'rgba(10,10,10,0.92)',
                  ...(activeMeaning.placement === 'above'
                    ? { borderRight: '1px solid rgba(236,72,153,0.35)', borderBottom: '1px solid rgba(236,72,153,0.35)' }
                    : { borderLeft: '1px solid rgba(236,72,153,0.35)', borderTop: '1px solid rgba(236,72,153,0.35)' }),
                }}
              />
              <div
                className="relative w-44 rounded-xl backdrop-blur-md border border-pink-500/35 shadow-xl px-2.5 py-2 text-left cursor-pointer"
                style={{ background: 'rgba(10,10,10,0.92)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMeaning(null);
                }}
                onTouchStart={stopTouchPropagation}
                onTouchMove={stopTouchPropagation}
                onTouchEnd={(e) => { e.stopPropagation(); setActiveMeaning(null); }}
              >
                <p className="text-[11px] leading-snug">
                  <span className="text-pink-400 font-semibold">{activeMeaning.name}</span>
                  <span className="text-gray-200">: {activeMeaning.meaning}</span>
                </p>
              </div>
            </div>
          </>,
          document.body
        )}
      </>
    );
  }

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
                openMeaning(name, symbol?.meaning || '', e.currentTarget);
              }}
              onTouchStart={stopTouchPropagation}
              onTouchMove={stopTouchPropagation}
              onTouchEnd={stopTouchPropagation}
              className="flex items-center justify-center shrink-0 min-h-0 min-w-0 transition-transform duration-150 active:scale-90"
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

      {activeMeaning && createPortal(
        <>
          {/* Full-viewport tap-catcher — any tap outside the popup itself closes it. A plain
              backdrop like this is far more reliable across touch/mouse/devices than a
              document-level click listener (no risk of missing the event due to stopPropagation
              elsewhere in the tree, no passive-listener/touch quirks to work around). */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setActiveMeaning(null)}
            onTouchStart={stopTouchPropagation}
            onTouchMove={stopTouchPropagation}
            onTouchEnd={(e) => { e.stopPropagation(); setActiveMeaning(null); }}
            className="fixed inset-0 z-[9998]"
            style={{ background: 'transparent', border: 'none', padding: 0 }}
          />
          <div
            className={`fixed z-[9999] flex items-start ${
              activeMeaning.placement === 'above' ? 'flex-col-reverse' : 'flex-col'
            }`}
            style={{
              left: activeMeaning.left,
              width: POPUP_WIDTH,
              ...(activeMeaning.placement === 'above'
                ? { bottom: activeMeaning.verticalOffset }
                : { top: activeMeaning.verticalOffset }),
            }}
          >
            {/* Speech-bubble tail pointing at the tapped symbol - points down
                when the popup sits above it, up when it sits below. */}
            <div
              className={`w-3 h-3 rotate-45 ${activeMeaning.placement === 'above' ? '-mt-1.5' : '-mb-1.5'}`}
              style={{
                marginLeft: activeMeaning.tailLeft,
                background: 'rgba(10,10,10,0.92)',
                ...(activeMeaning.placement === 'above'
                  ? { borderRight: '1px solid rgba(236,72,153,0.35)', borderBottom: '1px solid rgba(236,72,153,0.35)' }
                  : { borderLeft: '1px solid rgba(236,72,153,0.35)', borderTop: '1px solid rgba(236,72,153,0.35)' }),
              }}
            />
            <div
              className="relative w-44 rounded-xl backdrop-blur-md border border-pink-500/35 shadow-xl px-2.5 py-2 text-left cursor-pointer"
              style={{ background: 'rgba(10,10,10,0.92)' }}
              onClick={(e) => {
                e.stopPropagation();
                setActiveMeaning(null);
              }}
              onTouchStart={stopTouchPropagation}
              onTouchMove={stopTouchPropagation}
              onTouchEnd={(e) => { e.stopPropagation(); setActiveMeaning(null); }}
            >
              <p className="text-[11px] leading-snug">
                <span className="text-pink-400 font-semibold">{activeMeaning.name}</span>
                <span className="text-gray-200">: {activeMeaning.meaning}</span>
              </p>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
});

export default UserAdinkraDisplay;
