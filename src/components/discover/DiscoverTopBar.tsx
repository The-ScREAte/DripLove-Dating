import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';

export type DiscoverCategory = 'mine' | 'doubleDate' | 'signMatch';

interface DiscoverTopBarProps {
  // Gates the portal on the Discover TAB itself being the active app tab
  // (not to be confused with MatchCard's own isActiveTab, which means "the
  // front card of the deck") - without this, the portal would keep floating
  // over Chat/Circle/Profile too, since a `position: fixed` element rendered
  // via a portal escapes the `display:none` MainApp otherwise hides an
  // inactive tab's content with.
  isActiveTab: boolean;
  activeCategory: DiscoverCategory;
  onCategoryChange: (category: DiscoverCategory) => void;
  onFilterClick: () => void;
}

// Double Date is hidden for now - it needs a "set your goal, invite up to 2
// friends" setup flow on the Profile page first, which doesn't exist yet.
// The type/state still supports it (see DiscoverPage's discoverCategory and
// its "coming soon" overlay) so wiring the tab back in later is just adding
// a row here, not rebuilding anything.
const CATEGORIES: { key: DiscoverCategory; labelKey: string }[] = [
  { key: 'mine', labelKey: 'discover.modeForYou' },
  { key: 'signMatch', labelKey: 'discover.modeSignMatch' },
];

// The one-line "what is Sign Match" caption is shown a single time, the first
// time someone opens that mode, then never again - no standing instructions.
const SIGN_MATCH_HINT_KEY = 'dl_sign_match_hint_seen';
const readHintSeen = () => {
  try {
    return localStorage.getItem(SIGN_MATCH_HINT_KEY) === '1';
  } catch {
    return false;
  }
};

// No outer pill/card - a plain feathered gradient (opaque at the header,
// fading to nothing into the photo) that reads as one continuous surface
// with the header above it, the same visual language MatchCard's own name/
// caption gradient already uses lower down the same photo. Same portal
// reasoning as MatchCard's own overlays (report button, slide dots):
// `discover-container` is `position: fixed`, which always establishes its
// own stacking context regardless of z-index, so nothing inside it can ever
// paint above a sibling with an explicit z-index like the global header.
// The right edge is left empty on purpose - MatchCard's own report button
// (a separate portal, its own component) lines up at the same top offset to
// sit in that slot, so the row reads as one bar without duplicating report's
// logic here.
const DiscoverTopBar: React.FC<DiscoverTopBarProps> = ({
  isActiveTab,
  activeCategory,
  onCategoryChange,
  onFilterClick,
}) => {
  const { t } = useTranslation();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<number | null>(null);
  const [hintDone, setHintDone] = useState(readHintSeen);
  const showHint = activeCategory === 'signMatch' && !hintDone;

  // Sliding indicator: the active label's centre is READ from layout, but the move
  // itself is a transform, so the animation stays compositor-only.
  const measure = useCallback(() => {
    const el = tabRefs.current[activeCategory];
    if (el) setIndicator(el.offsetLeft + el.offsetWidth / 2 - 10);
  }, [activeCategory]);

  useLayoutEffect(() => {
    if (isActiveTab) measure();
  }, [isActiveTab, measure, t]);

  useEffect(() => {
    if (!isActiveTab) return;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isActiveTab, measure]);

  // One-time Sign Match caption (auto-hides, never blocks touches).
  useEffect(() => {
    if (!isActiveTab || !showHint) return;
    const id = window.setTimeout(() => {
      setHintDone(true);
      try {
        localStorage.setItem(SIGN_MATCH_HINT_KEY, '1');
      } catch {
        /* ignore - the caption may show once more next session */
      }
    }, 4000);
    return () => window.clearTimeout(id);
  }, [isActiveTab, showHint]);

  // Arrow / Home / End move between modes (roving tabindex, WAI-ARIA tabs pattern).
  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % CATEGORIES.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + CATEGORIES.length) % CATEGORIES.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = CATEGORIES.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const key = CATEGORIES[next].key;
    onCategoryChange(key);
    tabRefs.current[key]?.focus();
  };

  if (!isActiveTab) return null;

  return createPortal(
    <div
      className="dl-under-popup fixed inset-x-0 z-[9999] pointer-events-none"
      style={{
        // Starts right under the header's (pink) bottom border: the header paints a black strip behind its rounded
        // corners and 2px past its edge, so there is no photo sliver between the two and the border stays visible.
        top: 'var(--app-header-height, 72px)',
        // Feathering under the header border: darkest right at the border and fading the whole way down (no flat dark
        // band at the top, which read as a solid line), over many small stops so there is no banding.
        // identical on iOS and Android.
        background:
          'linear-gradient(to bottom, rgba(0,0,0,0.960) 0.0%, rgba(0,0,0,0.930) 2.5%, rgba(0,0,0,0.900) 5.0%, rgba(0,0,0,0.871) 7.5%, rgba(0,0,0,0.842) 10.0%, rgba(0,0,0,0.812) 12.5%, rgba(0,0,0,0.784) 15.0%, rgba(0,0,0,0.755) 17.5%, rgba(0,0,0,0.726) 20.0%, rgba(0,0,0,0.698) 22.5%, rgba(0,0,0,0.670) 25.0%, rgba(0,0,0,0.642) 27.5%, rgba(0,0,0,0.615) 30.0%, rgba(0,0,0,0.587) 32.5%, rgba(0,0,0,0.560) 35.0%, rgba(0,0,0,0.533) 37.5%, rgba(0,0,0,0.507) 40.0%, rgba(0,0,0,0.481) 42.5%, rgba(0,0,0,0.455) 45.0%, rgba(0,0,0,0.429) 47.5%, rgba(0,0,0,0.404) 50.0%, rgba(0,0,0,0.379) 52.5%, rgba(0,0,0,0.354) 55.0%, rgba(0,0,0,0.329) 57.5%, rgba(0,0,0,0.305) 60.0%, rgba(0,0,0,0.282) 62.5%, rgba(0,0,0,0.258) 65.0%, rgba(0,0,0,0.236) 67.5%, rgba(0,0,0,0.213) 70.0%, rgba(0,0,0,0.191) 72.5%, rgba(0,0,0,0.170) 75.0%, rgba(0,0,0,0.149) 77.5%, rgba(0,0,0,0.128) 80.0%, rgba(0,0,0,0.109) 82.5%, rgba(0,0,0,0.090) 85.0%, rgba(0,0,0,0.071) 87.5%, rgba(0,0,0,0.054) 90.0%, rgba(0,0,0,0.038) 92.5%, rgba(0,0,0,0.023) 95.0%, rgba(0,0,0,0.010) 97.5%, rgba(0,0,0,0.000) 100.0%)',
        paddingTop: 6,
        paddingBottom: 76,
        textShadow: '0 1px 4px rgba(0,0,0,0.45)',
      }}
    >
      {/* Every element on this row shares the same fixed 24px height (the
          filter icon, each pill, and the reserved report-button slot) so
          they land on one true line via their own height instead of relying
          on differing content (icon vs. pill vs. text) to happen to line up
          under items-center. min-h-0 is required on every button here - a
          global mobile touch-target rule (index.css) forces every <button>
          to min-height: 44px, which silently wins over Tailwind's h-6 and
          was the actual reason these looked big no matter what height was
          set. MatchCard's own report button already works around the same
          rule by setting min-height explicitly in its CSS module. */}
      <div className="flex items-center gap-1.5 px-3 pointer-events-auto">
        <button
          type="button"
          onClick={onFilterClick}
          aria-label={t('discover.filtersAria')}
          className="dl-hit shrink-0 w-9 h-9 min-h-0 flex items-center justify-center rounded-full text-white bg-black/20 active:scale-90 transition-transform outline-none focus:outline-none focus-visible:outline-none"
        >
          <SlidersHorizontal className="w-[22px] h-[22px]" />
        </button>

        {/* Only this middle strip scrolls horizontally (for whenever more
            categories bring it back to 3+ and they don't all fit) - the
            filter icon and the reserved report-button slot on either side
            are separate flex siblings with shrink-0, outside this
            overflow-x-auto, so they stay put; the carousel dots are an
            entirely separate portal in MatchCard.tsx and were never part of
            this row to begin with. */}
        <div
          role="tablist"
          aria-label={t('discover.discover')}
          className="relative flex-1 flex items-center justify-center gap-3 overflow-x-auto scrollbar-hide py-2 -my-2"
        >
          {CATEGORIES.map(({ key, labelKey }, i) => {
            const selected = activeCategory === key;
            return (
              <button
                key={key}
                ref={(el) => { tabRefs.current[key] = el; }}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onCategoryChange(key)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
                className="dl-hit shrink-0 h-7 min-h-0 px-1 flex items-center justify-center text-[13px] leading-none font-semibold outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-full"
              >
                <span
                  className={selected ? 'text-white' : 'text-white/80'}
                  style={{ transition: 'color var(--dl-dur) var(--dl-ease-out)' }}
                >
                  {t(labelKey)}
                </span>
              </button>
            );
          })}
          {/* Sliding indicator: decorative (the selection is announced by aria-selected). */}
          {indicator !== null && (
            <span
              aria-hidden="true"
              className="absolute left-0 w-5 h-[2px] rounded-full bg-brand-gradient pointer-events-none"
              style={{
                bottom: 6,
                transform: `translate3d(${indicator}px, 0, 0)`,
                transition: 'transform var(--dl-dur-slow) var(--dl-ease-out)',
                willChange: 'transform',
              }}
            />
          )}
        </div>

        {/* Reserved so the tabs stay centered against the filter icon - this
            is the exact size of MatchCard's report button (24x24, see
            .reportButton in MatchCard.module.css), which visually occupies
            this slot at the same top offset. */}
        <div className="w-9 h-9 shrink-0" aria-hidden="true" />
      </div>
      {showHint && (
        <p
          role="status"
          className="dl-rise absolute inset-x-0 bottom-1.5 text-center text-[11px] leading-none text-white/80 pointer-events-none"
        >
          {t('discover.signMatchHint')}
        </p>
      )}
    </div>,
    document.body
  );
};

export default React.memo(DiscoverTopBar);
