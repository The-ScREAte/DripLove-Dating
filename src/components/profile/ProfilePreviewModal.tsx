import React, { useState, useCallback, useMemo } from 'react';
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
import { buildSlides, getPreviewHighlights, getUserColorHash } from '../discover/MatchCardHelpers';
import { SlideRenderer } from '../discover/SlideRenderer';
import UserAdinkraDisplay from '../discover/UserAdinkraDisplay';
import styles from '../discover/MatchCard.module.css';

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
// Discover's slide builder/renderer, highlight chips, and expand/collapse details
// panel so it looks and behaves exactly like a MatchCard in Discover. Rendered
// inline in place of ProfilePage's own content (see ProfilePage.tsx), so it keeps
// MainApp's header and bottom nav visible instead of covering the screen; leaving
// the tab (including tapping the Profile nav icon again) drops back to the real
// profile page, handled by ProfilePage via onClose/isActiveTab.
const ProfilePreviewModal: React.FC<ProfilePreviewModalProps> = ({ profile, images, onClose }) => {
  const { t } = useTranslation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showMoreInfo, setShowMoreInfo] = useState(false);

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
    <div className="h-full w-full bg-black overflow-y-auto">
      {/* Photo area - fixed aspect, not viewport-capped, since the whole page
          scrolls now instead of the photo eating most of the screen height. */}
      <div className="relative w-full aspect-[4/5] max-h-[65vh] overflow-hidden">
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
          <div className="absolute top-3 left-1/2 transform -translate-x-1/2 flex gap-1.5 z-10">
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
      </div>

      {/* Details - same expand/collapse behavior as MatchCard in Discover: basic
          info + highlight chips always show, everything else is gated behind the
          toggle button. */}
      <div className="px-4 py-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 24px)' }}>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h2 className="text-xl font-bold mb-1 text-white">
              {profile.first_name} {profile.last_name}, {calculateAge(profile.date_of_birth)}
            </h2>
            {profile.city && (
              <div className="flex items-center text-xs text-gray-300">
                <MapPin className="w-3 h-3 mr-1" />
                <span>{profile.city}, {profile.country}</span>
              </div>
            )}
            {profile.relationship_intent && (
              <div className="flex items-center mt-1.5 text-xs text-gray-300">
                <Heart className="w-3 h-3 mr-1" />
                <span>{formatRelationshipIntent(profile.relationship_intent)}</span>
              </div>
            )}

            {!showMoreInfo && previewHighlights.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {previewHighlights.map((highlight, index) => (
                  <span
                    key={index}
                    className="text-xs font-medium text-white/85 bg-white/10 border border-white/15 px-2 py-0.5 rounded-full"
                  >
                    {highlight}
                  </span>
                ))}
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

        {showMoreInfo && (
          <div className="mt-4 space-y-3">
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

            {profile.adinkra_symbols && profile.adinkra_symbols.length > 0 && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2">Cultural Signs</h4>
                <div className="flex flex-wrap gap-1">
                  {profile.adinkra_symbols.map((symbol, index) => (
                    <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                      {symbol}
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
      </div>
    </div>
  );
};

export default ProfilePreviewModal;
