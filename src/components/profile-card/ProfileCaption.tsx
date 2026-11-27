import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Heart, MapPin } from 'lucide-react';
import { formatFavoriteLabel, type FavoriteEntry } from '@/constants/favorites';
import { formatHeightShort } from '@/utils/profileFormat';
import { HIGHLIGHT_CHIP_BORDER_COLORS, truncateChipLabel } from '../discover/MatchCardHelpers';
import MusicLinkBadge from '../discover/MusicLinkBadge';
import UserAdinkraDisplay from '../discover/UserAdinkraDisplay';
import { relationshipIntentLabel } from './profileCardUtils';

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
}

/**
 * The name / location / highlights caption pinned to the bottom of a profile
 * photo, with the expand-details control. One component for Discover, Liked
 * Me and the preview so every screen shows the same header.
 */
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
      className={`dl-caption-pad absolute inset-x-0 bottom-0 z-20 px-4 pt-16 ${expanded ? 'pb-2' : 'pb-5'}`}
      style={{
        background:
          'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.6) 45%, rgba(0,0,0,0.85) 58%, rgba(0,0,0,0.92) 70%)',
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
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
            <div className="flex items-start text-[clamp(12px,3.4vw,14px)] text-gray-300">
              <MapPin className="mr-1 mt-[2px] h-[clamp(13px,3.6vw,16px)] w-[clamp(13px,3.6vw,16px)] shrink-0" />
              <span dir="auto" className="min-w-0 break-words">
                {[city, country].filter(Boolean).join(', ')}
                {distanceLabel ? <span className="ml-2">• {distanceLabel}</span> : null}
                {hasHeight ? <span className="ml-2 whitespace-nowrap">• {formatHeightShort(heightCm as number)}</span> : null}
              </span>
            </div>
          )}

          {showIntent && (
            <div className="mt-2 flex items-center text-[clamp(11px,3.2vw,13px)] font-medium text-gray-300">
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
                        className={`max-w-[100px] shrink-0 truncate rounded-full border bg-white/10 px-2 py-0.5 text-[clamp(9px,2.8vw,12px)] font-medium text-white/85 min-[400px]:max-w-[140px] ${HIGHLIGHT_CHIP_BORDER_COLORS[index % HIGHLIGHT_CHIP_BORDER_COLORS.length]}`}
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full dl-focus"
          style={{ margin: '-13px -7px -7px 0' }}
        >
          <span
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-white backdrop-blur-md transition-colors duration-200"
            style={{
              background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
              boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
            }}
          >
            <ArrowDown size={15} strokeWidth={2.5} className="dl-chevron" data-open={expanded ? 'true' : 'false'} />
          </span>
        </button>
      </div>
    </div>
  );
};
