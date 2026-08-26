import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapPin,
  Heart,
  Briefcase,
  GraduationCap,
  Languages,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { PotentialMatch } from '@/types';
import { calculateAge } from '@/utils/dateUtils';
import { getLanguageName } from '@/utils/languageNames';
import { optimizeImageUrl } from '@/utils/imageOptimizer';
import { buildSlides, getPreviewHighlights, getUserColorHash, HIGHLIGHT_CHIP_BORDER_COLORS, truncateChipLabel } from '../discover/MatchCardHelpers';
import { SlideRenderer } from '../discover/SlideRenderer';
import UserAdinkraDisplay from '../discover/UserAdinkraDisplay';
import SwipeButtons from '../discover/SwipeButtons';

interface ProfilePreviewModalProps {
  profile: PotentialMatch;
  images: string[];
  onClose: () => void;
}

const BACKGROUND_COLORS = [
  'bg-gradient-to-br from-pink-600 to-rose-900',
  'bg-gradient-to-br from-purple-600 to-indigo-900',
  'bg-gradient-to-br from-rose-600 to-pink-900',
  'bg-gradient-to-br from-fuchsia-600 to-purple-900',
];

const formatRelationshipIntent = (intent?: string | null) => {
  if (!intent) return '';
  if (intent === 'serious') return 'Looking for something serious';
  if (intent === 'open_to_anything') return 'Open to anything';
  return `Looking for ${intent.replace(/_/g, ' ').toLowerCase()}`;
};

const getSafeImageSrc = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('blob:')) return url;
  if (url.includes('supabase')) return optimizeImageUrl(url, { width: 520, quality: 60 });
  return url;
};

// A light, read-only rendering of "how this profile looks to others" - reuses
// Discover's slide builder/renderer, highlight chips, and cultural-sign glow.
// The name/age caption is pinned to the bottom of the photo with a feathered
// gradient (an ordinary caption overlay, clipped by the photo's own
// overflow-hidden - no transform/negative-margin tricks, which is what
// produced a hard seam, a duplicated strip of photo, and a dead black gap when
// this was borrowed from Discover's fixed-viewport flex-card layout). Tapping
// the arrow reveals the rest of the sections as a normal block below the
// photo. Rendered inline in place of ProfilePage's own content (see
// ProfilePage.tsx), so it keeps MainApp's header and bottom nav visible
// instead of covering the screen; leaving the tab (including tapping the
// Profile nav icon again) drops back to the real profile page, handled by
// ProfilePage via onClose/isActiveTab.
const ProfilePreviewModal: React.FC<ProfilePreviewModalProps> = ({ profile, images, onClose }) => {
  const { t } = useTranslation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const expandedDetailsRef = useRef<HTMLDivElement>(null);

  const slides = useMemo(() => buildSlides(profile, images), [profile, images]);
  const previewHighlights = useMemo(() => getPreviewHighlights(profile), [profile]);
  const userBackgroundColor = useMemo(
    () => getUserColorHash(profile.id, BACKGROUND_COLORS),
    [profile.id]
  );
  const preferredLanguageName = useMemo(
    () => getLanguageName((profile as unknown as { preferred_language?: string }).preferred_language),
    [profile]
  );

  const currentSlideData = slides[currentSlide] || slides[0];

  const handleNavigationClick = useCallback((e: React.MouseEvent) => {
    const x = e.clientX;
    const width = window.innerWidth;
    const clickX = (x / width) * 100;
    if (clickX < 50) {
      setCurrentSlide(prev => Math.max(0, prev - 1));
    } else {
      setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1));
    }
  }, [slides.length]);

  const lifestyleFields = [profile.smoking, profile.drinking, profile.exercise_level, profile.sleeping_schedule];
  const hasLifestyle = lifestyleFields.some(val => val && val !== 'not_specified');

  return (
    <div className="h-full w-full bg-black flex flex-col overflow-hidden">
      {/* Photo area - sized close to Discover's near-full-bleed swipe card
          (a viewport-relative height rather than a fixed aspect ratio, so it
          fills the screen the same way) with a sensible floor for short
          screens; the caption overlay below is clipped to this box so it can
          never bleed past the photo's own edges. flex-shrink-0 keeps it a
          static block - like Discover, only the info panel scrolls, never
          the photo. */}
      <div
        className="relative w-full flex-shrink-0 overflow-hidden"
        style={{
          height: showMoreInfo ? '42vh' : '78vh',
          minHeight: showMoreInfo ? '240px' : '420px',
          transition: 'height 300ms ease-out, min-height 300ms ease-out',
        }}
      >
        <div className="w-full h-full relative" onClick={handleNavigationClick} style={{ cursor: 'pointer' }}>
          {currentSlideData && (
            <SlideRenderer
              slide={currentSlideData}
              userBackgroundColor={userBackgroundColor}
              matchFirstName={profile.first_name || ''}
              matchLastName={profile.last_name || ''}
              getOptimizedUrl={(url) => getSafeImageSrc(url) || url}
            />
          )}
        </div>

        {slides.length > 1 && (
          <div className="absolute left-4 flex gap-1.5 z-10" style={{ top: '41px' }}>
            {slides.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  idx === currentSlide ? 'bg-white w-7' : 'bg-white/50 w-1.5'
                }`}
              />
            ))}
          </div>
        )}

        {/* Cultural sign - same centered glow treatment as Discover's MatchCard.
            No portal needed here: unlike the swipe card, this photo area isn't
            inside a `position: fixed` ancestor, so a plain absolute overlay
            already paints above everything else on the page. */}
        {profile.adinkra_symbols && profile.adinkra_symbols.length > 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
            <div className="relative w-16 h-16 flex items-center justify-center overflow-visible">
              <div
                className="absolute w-full"
                style={{
                  left: 0,
                  right: 0,
                  top: '50%',
                  height: '160%',
                  transform: 'translateY(-50%)',
                  background: 'radial-gradient(ellipse 100% 50% at center, rgba(0,0,0,0.45), transparent 75%)',
                }}
              />
              <div className="relative z-10">
                <UserAdinkraDisplay adinkraSymbols={profile.adinkra_symbols} />
              </div>
            </div>
          </div>
        )}

        {/* Name/age caption - pinned to the bottom of the photo with the same
            feathered gradient curve as Discover's .detailsContainer (transparent
            at the top, but crossing 85% opacity by just 10% down and settling
            fully solid by 24%) so the blend into the photo reads the same way,
            not the much lighter/slower fade this had before. Always in the same
            spot (never "empty gap" below it) since it's clipped to the photo. */}
        <div
          className={`absolute inset-x-0 bottom-0 z-20 px-4 pt-16 ${showMoreInfo ? 'pb-2' : 'pb-5'}`}
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.88) 60%, rgba(0,0,0,1) 85%)',
          }}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-xl font-bold mb-1 text-white">
                {profile.first_name} {profile.last_name}, {calculateAge(profile.date_of_birth)}
              </h2>
              {!showMoreInfo && profile.city && (
                <div className="flex items-center text-xs text-gray-300">
                  <MapPin className="w-3 h-3 mr-1" />
                  <span>{profile.city}, {profile.country}</span>
                </div>
              )}

              {!showMoreInfo && (previewHighlights.length > 0 || (profile.adinkra_symbols && profile.adinkra_symbols.length > 0)) && (
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {previewHighlights.map((highlight, index) => (
                    <span
                      key={index}
                      className={`text-[clamp(9px,2.8vw,12px)] font-medium text-white/85 bg-white/10 border ${HIGHLIGHT_CHIP_BORDER_COLORS[index % HIGHLIGHT_CHIP_BORDER_COLORS.length]} px-2 py-0.5 rounded-full truncate max-w-[100px] min-[400px]:max-w-[140px] shrink-0`}
                    >
                      {truncateChipLabel(highlight)}
                    </span>
                  ))}
                  {profile.adinkra_symbols && profile.adinkra_symbols.length > 0 && (
                    <span className="flex items-center justify-center bg-yellow-400/10 border border-yellow-400/60 rounded-full w-8 h-8 shrink-0">
                      <UserAdinkraDisplay adinkraSymbols={[profile.adinkra_symbols[0]]} />
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Expandable info button - same style/behavior as Discover's MatchCard toggle. */}
            <button
              onClick={() => setShowMoreInfo(prev => !prev)}
              className="text-white rounded-full p-2 transition-colors duration-200 shrink-0 backdrop-blur-md"
              style={{
                background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
                boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
              }}
              aria-label={showMoreInfo ? t('discover.matchCard.hideDetails', 'Hide details') : t('discover.matchCard.showDetails', 'Show details')}
            >
              {showMoreInfo ? (
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              ) : (
                <ArrowDown className="w-4 h-4" strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details - directly beneath the name caption (the photo
          shrinks to make room, same as the collapsed<->expanded relationship
          in Discover), scrolling independently on its own from here down.
          Same solid black background and minimal top padding so it reads as
          one continuous panel with the caption above rather than a separate
          block with a gap. */}
      {showMoreInfo && (
        <div
          ref={expandedDetailsRef}
          className="bg-black px-4 pt-1 space-y-3 flex-1 overflow-y-auto"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 80px)',
            WebkitOverflowScrolling: 'touch',
            // Overlaps the photo box by a hair to paper over the subpixel seam
            // that shows up between the gradient's solid-black bottom edge and
            // this panel's own bg-black - rounding on the photo's percentage
            // (vh) height can leave a sliver exposing whatever's behind it.
            marginTop: '-2px',
          }}
        >
          {profile.relationship_intent && (
            <div className="flex items-center text-xs text-gray-300">
              <Heart className="w-3 h-3 mr-1" />
              <span>{formatRelationshipIntent(profile.relationship_intent)}</span>
            </div>
          )}
          {profile.bio && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-1">{t('discover.matchCard.about')}</h4>
              <p className="text-gray-200 text-sm leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {hasLifestyle && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.lifestyle')}</h4>
              <div className="space-y-2">
                {profile.smoking && profile.smoking !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.smoking')}:</span>
                    <span className="text-gray-200">{profile.smoking}</span>
                  </div>
                )}
                {profile.drinking && profile.drinking !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.drinking')}:</span>
                    <span className="text-gray-200">{profile.drinking}</span>
                  </div>
                )}
                {profile.exercise_level && profile.exercise_level !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.exercise')}:</span>
                    <span className="text-gray-200">{profile.exercise_level}</span>
                  </div>
                )}
                {profile.sleeping_schedule && profile.sleeping_schedule !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.sleep')}:</span>
                    <span className="text-gray-200">{profile.sleeping_schedule}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(profile.occupation || profile.education_level) && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.workEducation')}</h4>
              <div className="space-y-2">
                {profile.occupation && (
                  <div className="flex items-center text-sm">
                    <Briefcase className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                    <span className="text-gray-200">{profile.occupation}</span>
                  </div>
                )}
                {profile.education_level && (
                  <div className="flex items-center text-sm">
                    <GraduationCap className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                    <span className="text-gray-200">{profile.education_level}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {profile.interests && profile.interests.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.interests')}</h4>
              <div className="flex flex-wrap gap-1">
                {profile.interests.map((interest, index) => (
                  <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}

          {preferredLanguageName && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.language')}</h4>
              <div className="flex items-center text-sm">
                <Languages className="w-3.5 h-3.5 mr-2 text-pink-500 shrink-0" />
                <span className="text-gray-200">{preferredLanguageName}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Undo button - same fixed-position control as Discover's SwipeButtons.
          There's no swipe to undo in a read-only preview, so it steps back
          through this profile's own photos instead; disabled on the first one. */}
      <SwipeButtons
        onReverse={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
        canReverse={currentSlide > 0}
      />
    </div>
  );
};

export default ProfilePreviewModal;
