import React from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, MapPin } from 'lucide-react';
import { formatFavoriteLabel, type FavoriteEntry } from '@/constants/favorites';
import { formatHeightShort } from '@/utils/profileFormat';
import { truncateChipLabel } from '../discover/MatchCardHelpers';
import MusicLinkBadge from '../discover/MusicLinkBadge';
import UserAdinkraDisplay from '../discover/UserAdinkraDisplay';
import { relationshipIntentLabel } from './profileCardUtils';
import { BoostButton } from '../boost/BoostButton';

export interface ProfileCaptionProps {
  /** Already title-cased "First Last". */
  name: string;
  age?: number | null;
  online?: boolean;
  verified?: boolean;
  city?: string | null;
  country?: string | null;
  /** Pre-formatted distance (e.g. "3 km"), or empty when unknown. */
  distanceLabel?: string | null;
  heightCm?: number | null;
  relationshipIntent?: string | null;
  bio?: string | null;
  highlights: string[];
  signHighlights: string[];
  musicHighlight?: FavoriteEntry | null;
  /** Photo index; location / "looking for" alternate by photo. */
  currentSlide: number;
  /** Show the bio excerpt instead of the highlight chips (and hide "looking for"). */
  showAbout: boolean;
  expanded: boolean;
  onToggle: () => void;
  /**
   * Where the expand button sits. 'above-undo' (Discover, Circle, profile preview - screens with the floating undo
   * button) pins it just above that button; 'corner' (Liked Me, no undo button) pins it low in the corner.
   * Either way it is fixed to the card, so it never moves with how much caption text there is.
   */
  togglePlacement?: 'above-undo' | 'corner';
  /** Ease the caption in when it mounts (Discover keys it per profile so every new card animates in). */
  animateIn?: boolean;
  /** Discover only: my own Boost control, pinned right above the expand button (hidden while details are open). */
  showBoost?: boolean;
}

/**
 * The name / location / highlights caption pinned to the bottom of a profile
 * photo, with the expand-details control. One component for Discover, Liked
 * Me and the preview so every screen shows the same header.
 */
/** Eased (smootherstep) scrim under the caption: many small steps instead of 4 hard ones, so there are no visible
 *  bands/lines where the photo turns dark. Light through the middle so the photo stays bright, then deepening to 90% black
 *  at the very bottom so the card melts into the black nav below (the same way the top feathers out of the header). */
const CAPTION_SCRIM =
  'linear-gradient(to bottom, rgba(0,0,0,0.000) 0.0%, rgba(0,0,0,0.000) 5.0%, rgba(0,0,0,0.002) 10.0%, rgba(0,0,0,0.008) 15.0%, rgba(0,0,0,0.022) 20.0%, rgba(0,0,0,0.047) 25.0%, rgba(0,0,0,0.085) 30.0%, rgba(0,0,0,0.137) 35.0%, rgba(0,0,0,0.202) 40.0%, rgba(0,0,0,0.280) 45.0%, rgba(0,0,0,0.366) 50.0%, rgba(0,0,0,0.456) 55.0%, rgba(0,0,0,0.548) 60.0%, rgba(0,0,0,0.635) 65.0%, rgba(0,0,0,0.714) 70.0%, rgba(0,0,0,0.781) 75.0%, rgba(0,0,0,0.833) 80.0%, rgba(0,0,0,0.869) 85.0%, rgba(0,0,0,0.890) 90.0%, rgba(0,0,0,0.899) 95.0%, rgba(0,0,0,0.900) 100.0%)';
const CAPTION_TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.45), 0 0 12px rgba(0,0,0,0.25)';

export const ProfileCaption: React.FC<ProfileCaptionProps> = ({
  name,
  age,
  online,
  verified,
  city,
  country,
  distanceLabel,
  heightCm,
  relationshipIntent,
  bio,
  highlights,
  signHighlights,
  musicHighlight,
  currentSlide,
  showAbout,
  expanded,
  onToggle,
  togglePlacement = 'above-undo',
  animateIn = false,
  showBoost = false,
}) => {
  const { t } = useTranslation();

  const hasLocation = !!city;
  const hasIntent = !!relationshipIntent;
  const showLocation = hasLocation && (!hasIntent || currentSlide % 2 === 0);
  // Never alongside About - a bio excerpt already speaks for the person.
  const showIntent = !showAbout && hasIntent && (!hasLocation || currentSlide % 2 === 1);
  const hasHeight = typeof heightCm === 'number' && heightCm > 0;
  const hasChips = highlights.length > 0 || signHighlights.length > 0 || !!musicHighlight;

  return (
    <div
      className={`dl-caption-pad absolute inset-x-0 bottom-0 z-20 px-4 pt-16 ${expanded ? 'pb-2' : 'pb-5'}${animateIn ? ' dl-card-fade-now' : ''}`}
      style={{ background: CAPTION_SCRIM, textShadow: CAPTION_TEXT_SHADOW }}
    >
      <div className={`flex items-start justify-between gap-1${animateIn ? ' dl-card-enter' : ''}`}>
        <div className="min-w-0 flex-1 pr-11">
          <div className="mb-1 flex items-center gap-2 leading-tight">
            <h2 dir="auto" className="min-w-0 break-words text-[clamp(15px,4.4vw,18px)] font-bold text-white">
              {name}
              {typeof age === 'number' && !Number.isNaN(age) ? `, ${age}` : ''}
            </h2>
            {online && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-black bg-green-500"
                role="img"
                aria-label={t('chat.activeNow', 'Active now')}
              />
            )}
            {verified && (
              <img
                loading="lazy"
                decoding="async"
                src="/images/verified.svg"
                alt={t('discover.matchCard.verifiedProfile', 'Verified profile')}
                title={t('discover.matchCard.verifiedProfile', 'Verified profile')}
                className="h-[clamp(18px,5vw,24px)] w-[clamp(18px,5vw,24px)] shrink-0"
              />
            )}
          </div>

          {showLocation && (
            <div className="flex items-start text-[clamp(12px,3.4vw,14px)] text-white/85">
              <MapPin className="mr-1 mt-[2px] h-[clamp(13px,3.6vw,16px)] w-[clamp(13px,3.6vw,16px)] shrink-0" />
              <span dir="auto" className="min-w-0 break-words">
                {[city, country].filter(Boolean).join(', ')}
                {distanceLabel ? <span className="ml-2">• {distanceLabel}</span> : null}
                {hasHeight ? <span className="ml-2 whitespace-nowrap">• {formatHeightShort(heightCm as number)}</span> : null}
              </span>
            </div>
          )}

          {showIntent && (
            <div className="mt-2 flex items-center text-[clamp(11px,3.2vw,13px)] font-medium text-white/85">
              <Heart className="mr-1 h-[clamp(13px,3.6vw,16px)] w-[clamp(13px,3.6vw,16px)] shrink-0" />
              <span className="min-w-0 break-words">{relationshipIntentLabel(relationshipIntent, t as never)}</span>
            </div>
          )}

          {/* Folds away (grid 1fr -> 0fr + fade) while details are open; stays mounted so closing unfolds it again. */}
          <div className="dl-fold" data-folded={expanded ? 'true' : 'false'} aria-hidden={expanded || undefined}>
            <div>
              {showAbout && bio ? (
                <p dir="auto" className="mt-2 line-clamp-2 pr-8 text-[clamp(11px,3.2vw,13px)] text-white/85">
                  {bio}
                </p>
              ) : (
                hasChips && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pr-8">
                    {highlights.map((highlight, index) => (
                      <span
                        key={index}
                        className="max-w-[100px] shrink-0 truncate rounded-full dl-chip px-2.5 py-0.5 text-[clamp(9px,2.8vw,12px)] font-medium text-white/95 min-[400px]:max-w-[140px]"
                      >
                        {truncateChipLabel(highlight)}
                      </span>
                    ))}
                    {signHighlights.map((sign) => (
                      <UserAdinkraDisplay key={sign} adinkraSymbols={[sign]} showLabel />
                    ))}
                    {musicHighlight?.link && (
                      <MusicLinkBadge link={musicHighlight.link} label={formatFavoriteLabel(musicHighlight)} />
                    )}
                  </div>
                )
              )}
            </div>
          </div>

        </div>

        {showBoost && togglePlacement === 'above-undo' && <BoostButton hidden={expanded} />}

        {/* 44px hit area around the 30px glass circle (visual size unchanged). */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? t('discover.matchCard.hideDetails', 'Hide details')
              : t('discover.matchCard.showDetails', 'Show details')
          }
          className="dl-expand-btn absolute z-10 flex h-11 w-11 items-center justify-center rounded-full dl-focus"
          data-placement={togglePlacement}
          data-expanded={expanded ? 'true' : 'false'}
        >
          <span className="dl-expand-orb" aria-hidden="true">
            {/* Slim double chevron; opening flips it up and folds the trailing stroke into the lead one (see index.css). */}
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="dl-chevron"
              data-open={expanded ? 'true' : 'false'}
            >
              <path className="dl-chev-tail" d="M7 6.5l5 5 5-5" />
              <path d="M7 12.5l5 5 5-5" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
};
