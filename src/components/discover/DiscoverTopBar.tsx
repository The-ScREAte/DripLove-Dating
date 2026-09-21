import React from 'react';
import { createPortal } from 'react-dom';
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
const CATEGORIES: { key: DiscoverCategory; label: string }[] = [
  { key: 'mine', label: 'For Me' },
  { key: 'signMatch', label: 'Sign Match' },
];

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
  if (!isActiveTab) return null;

  return createPortal(
    <div
      className="fixed inset-x-0 z-[9999] pointer-events-none"
      style={{
        top: 'var(--app-header-height, 72px)',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0) 100%)',
        paddingTop: 8,
        paddingBottom: 28,
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
          aria-label="Discover filters"
          className="shrink-0 w-8 h-8 min-h-0 flex items-center justify-center rounded-full text-white active:scale-90 transition-transform outline-none focus:outline-none focus-visible:outline-none"
        >
          <SlidersHorizontal className="w-[20px] h-[20px]" />
        </button>

        {/* Only this middle strip scrolls horizontally (for whenever more
            categories bring it back to 3+ and they don't all fit) - the
            filter icon and the reserved report-button slot on either side
            are separate flex siblings with shrink-0, outside this
            overflow-x-auto, so they stay put; the carousel dots are an
            entirely separate portal in MatchCard.tsx and were never part of
            this row to begin with. */}
        <div className="flex-1 flex items-center justify-center gap-3 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onCategoryChange(key)}
              className="shrink-0 h-7 min-h-0 flex flex-col items-center justify-center gap-0.5 text-[13px] leading-none font-semibold outline-none focus:outline-none focus-visible:outline-none"
            >
              <span className={activeCategory === key ? 'text-white' : 'text-white/70'}>
                {label}
              </span>
              <span
                className={`h-[2px] rounded-full transition-all duration-200 ${
                  activeCategory === key ? 'w-5 bg-pink-500' : 'w-0 bg-transparent'
                }`}
              />
            </button>
          ))}
        </div>

        {/* Reserved so the tabs stay centered against the filter icon - this
            is the exact size of MatchCard's report button (24x24, see
            .reportButton in MatchCard.module.css), which visually occupies
            this slot at the same top offset. */}
        <div className="w-8 h-8 shrink-0" aria-hidden="true" />
      </div>
    </div>,
    document.body
  );
};

export default React.memo(DiscoverTopBar);
