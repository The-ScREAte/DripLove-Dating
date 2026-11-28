import SlideDots from './SlideDots';
import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import ReportButton from '../ReportButton';
import styles from './MatchCard.module.css';
import { PotentialMatch } from '@/types';
import { useTranslation } from 'react-i18next';
import { buildSlides, getUserColorHash, getPreviewHighlights, seedFromString, mulberry32, seededShuffle } from './MatchCardHelpers';
import { SlideRenderer } from './SlideRenderer';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import { findFavoriteWithLink } from '@/constants/favorites';
import { calculateProfileCompletion } from '@/utils/profileCompletion';
import { ProfileDetailsPanel } from '../profile-card/ProfileDetailsPanel';
import { useCaptionedPhotos, toTitleCase } from '../profile-card/profileCardUtils';
import { ProfileCaption } from '../profile-card/ProfileCaption';
import { ProfileReportModal } from '../profile-card/ProfileReportModal';
import { useProfileReport } from '../profile-card/useProfileReport';
import { formatDistance } from '@/utils/distanceUnits';
import { isRecentlyOnline, SWIPE_ONLINE_WINDOW_MS } from '@/utils/onlineStatus';
import { useViewerVibe } from '@/utils/viewerVibe';

interface MatchCardProps {
  match: PotentialMatch;
  imageIndex: number;
  showMoreInfo: boolean;
  isPremium: boolean;
  isVerified?: boolean; // New prop for verified status
  currentUserLatitude?: number;
  currentUserLongitude?: number;
  userImages: string[]; // New prop for user images
  preloadedBlobImages?: { [url: string]: string }; // ⭐ Blob URLs for instant rendering
  preferredLanguageName?: string; // ⭐ Pre-fetched language name (no DB call needed)
  onImageClick: () => void;
  onImageIndexChange?: (currentIndex: number, totalImages: number) => void; // ⭐ SMART LOADING: Callback when user flips through images
  onToggleInfo: () => void;
  calculateAge: (dateOfBirth: string) => number;
  calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => number;
  swipeDirection: 'left' | 'right' | null;
  swipeDistance: number;
  isDragging?: boolean; // Whether the card is actively being dragged (used to avoid a WebKit mask+backdrop-filter flicker)
  isSwipeAreaOnly?: boolean; // New prop to render only swipeable image area
  isDetailsAreaOnly?: boolean; // New prop to render only details area
  getOptimizedUrl?: (url: string) => string; // New prop for image optimization
  preCalculatedDistance?: number; // Distance already calculated by location service
  imageStatus?: Record<string, 'idle'|'loading'|'loaded'|'error'>;
  isActiveTab?: boolean; // Whether the Discover/DripCheck tab is the one currently visible — gates the portaled overlays below so they don't leak onto other tabs
  onReportModalOpenChange?: (isOpen: boolean) => void; // Lets the parent suspend swipe/drag gestures while the report modal is up
  currentUserAdinkraSymbols?: string[]; // Used to prefer a sign this profile shares with the viewer for the collapsed sign chip
  onUserBlocked?: (userId: string) => void; // Fired once the block is finalized (undo window expired/dismissed) so the parent deck can advance past this profile
}

const MatchCard: React.FC<MatchCardProps> = ({
  match,
  imageIndex,
  showMoreInfo,
  isPremium,
  isVerified = false, // Default to false if not provided
  currentUserLatitude,
  currentUserLongitude,
  userImages,
  preloadedBlobImages = {}, // ⭐ Blob URLs for instant image loading
  preferredLanguageName, // ⭐ Pre-fetched language (no DB call)
  onImageClick,
  onImageIndexChange, // ⭐ ANDROID OPTIMIZATION: Callback when user flips images
  onToggleInfo,
  calculateAge,
  calculateDistance,
  swipeDirection,
  swipeDistance,
  isDragging = false,
  isSwipeAreaOnly = false,
  isDetailsAreaOnly = false,
  getOptimizedUrl = (url: string) => getDetailImageUrl(url),
  preCalculatedDistance
  , imageStatus
  , isActiveTab = true
  , onReportModalOpenChange
  , currentUserAdinkraSymbols
  , onUserBlocked
}) => {
  const { t } = useTranslation();

  // Debug logging (enable with: localStorage.setItem('driplove_debug_swipe','1'))
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (window.localStorage.getItem('driplove_debug_swipe') !== '1') return;
      // Use warn level so it shows up even when console hides logs.
      console.warn('[MatchCard]', {
        matchId: match.id,
        isSwipeAreaOnly,
        isDetailsAreaOnly,
        imageIndex,
        userImagesLen: Array.isArray(userImages) ? userImages.length : 0,
      });
    } catch {
      // ignore
    }
  }, [match.id, isSwipeAreaOnly, isDetailsAreaOnly, imageIndex, userImages]);

  const [currentSlide, setCurrentSlide] = useState(0);

  // Refs for performance
  const lastSlideInteraction = useRef<number>(0);
  const slideTransitionInProgress = useRef<boolean>(false);
  const containerWidth = useRef<number>(0);
  const containerLeft = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ⭐ PHASE 1.1: Memoize all expensive inputs (prevents Android re-render storm)
  const memoUserImages = useMemo(() => userImages.slice(), [userImages]);
  const memoPreloadedBlobs = useMemo(() => preloadedBlobImages, [preloadedBlobImages]);

  // ⭐ PHASE 1.2: Freeze match fields (prevents 3-5x re-computation on Android)
  const stableMatch = useMemo(() => ({
    ...match,
    adinkra_symbols: match.adinkra_symbols || []
  }), [match]);

  // ⭐ PHASE 1.3: Move heavy logic OUTSIDE + use memoized buildSlides
  // Same "earned" verified badge shown on the user's own profile page (>=85%
  // profile completion) - not the face-verification `isVerified` prop, which
  // tracks something different. Computed before the slides so the trust card agrees with the caption.
  const showVerifiedBadge = useMemo(
    () => calculateProfileCompletion(stableMatch, memoUserImages).showVerifiedBadge,
    [stableMatch, memoUserImages]
  );
  // Who is looking: drives "You both like", sign compatibility and the no-photo card order.
  const viewerVibe = useViewerVibe();
  const distanceKm = useMemo(() => {
    if (match.distance !== undefined && match.distance < 999) return match.distance;
    if (preCalculatedDistance !== undefined && preCalculatedDistance < 999) return preCalculatedDistance;
    if (currentUserLatitude && currentUserLongitude && match.latitude && match.longitude) {
      return calculateDistance(currentUserLatitude, currentUserLongitude, match.latitude, match.longitude);
    }
    return null;
  }, [match.distance, match.latitude, match.longitude, preCalculatedDistance, currentUserLatitude, currentUserLongitude, calculateDistance]);
  const slides = useMemo(
    () => buildSlides(stableMatch, memoUserImages, {
      id: viewerVibe.id,
      interests: viewerVibe.interests,
      favorites: viewerVibe.favorites,
      signs: currentUserAdinkraSymbols,
      verified: showVerifiedBadge,
      distanceKm,
    }),
    [stableMatch, memoUserImages, viewerVibe, currentUserAdinkraSymbols, showVerifiedBadge, distanceKm]
  );
  const previewHighlights = useMemo(
    () => getPreviewHighlights(stableMatch, currentSlide),
    [stableMatch, currentSlide]
  );

  // "Break the ice" under the info area: who it is for + the personal openers the starter card already worked out.
  const iceTarget = useMemo(() => {
    if (!match.id) return null;
    const starterCard = slides.find((sl) => sl.type === 'card' && sl.card?.kind === 'starter');
    return {
      id: String(match.id),
      name: toTitleCase(match.first_name || ''),
      photoUrl: memoUserImages?.[0] ?? null,
      starters: starterCard?.card?.data?.starters,
    };
  }, [match.id, match.first_name, slides, memoUserImages]);

  // Up to 2 captioned photos (seeded pick, shared with every other profile view).
  const { captionedPhotos, secondPhotoAnchor } = useCaptionedPhotos(
    match.imageCaptions,
    String(match.id || match.first_name || '')
  );

  // The collapsed card's "body" (below name/location) rotates through chips
  // and a bio excerpt as the viewer taps through photos - captioned photos
  // are surfaced separately, in the expanded "Photos" section below, not
  // here in the collapsed call-out.
  const infoSlotSequence = useMemo(() => {
    const seq: Array<'chips' | 'about'> = ['chips', 'chips'];
    if (stableMatch.bio?.trim()) seq.push('about');
    return seq;
  }, [stableMatch.bio]);

  const activeInfoSlot = infoSlotSequence[currentSlide % infoSlotSequence.length];
  const showAbout = activeInfoSlot === 'about';

  // Two cultural signs to surface as their own chips (this used to also
  // duplicate as a floating badge above the header - removed, this is now
  // the only place a profile's signs show). Shuffled with a per-profile seed
  // so which ones lead feels random without reshuffling on every render;
  // shared signs with the current user are still weighted to shuffle ahead
  // of the rest so common ground tends to surface first. Still cycles which
  // two lead as the viewer swipes through photos, same as before.
  const signHighlights = useMemo(() => {
    const theirs = stableMatch.adinkra_symbols;
    if (!theirs || theirs.length === 0) return [];
    const mine = currentUserAdinkraSymbols || [];
    const shared = theirs.filter(symbol => mine.includes(symbol));
    const rest = theirs.filter(symbol => !mine.includes(symbol));
    const rand = mulberry32(seedFromString(`${stableMatch.id || stableMatch.first_name || ''}_signhighlight`));
    const ordered = [...seededShuffle(shared, rand), ...seededShuffle(rest, rand)];
    if (ordered.length === 0) return [];
    if (ordered.length === 1) return [ordered[0]];
    const start = currentSlide % ordered.length;
    return [ordered[start], ordered[(start + 1) % ordered.length]];
  }, [stableMatch, currentUserAdinkraSymbols, currentSlide]);

  // A favorite carrying a share link (e.g. a music track/album) surfaces as
  // its own circular badge in the compact preview row, mirroring signHighlights.
  const musicHighlight = useMemo(
    () => findFavoriteWithLink(stableMatch.favorites),
    [stableMatch]
  );

  // ⭐ REMOVED: Language fetching (now passed as prop from parent to eliminate DB calls)
  // ⭐ REMOVED: imageLoading state - blob URLs load instantly from memory, no loader needed

  // Background colors for fun questions and about
  const backgroundColors = useMemo(() => [
    'bg-gradient-to-br from-pink-600 to-rose-900',    // pink
    'bg-gradient-to-br from-blue-700 to-indigo-950',  // deep blue
    'bg-gradient-to-br from-red-800 to-rose-950',     // dark red
    'bg-gradient-to-br from-zinc-700 to-neutral-950', // dark / charcoal
  ], []);

  // Generate consistent color for this user based on their ID
  const userBackgroundColor = useMemo(
    () => getUserColorHash(match.id, backgroundColors),
    [match.id, backgroundColors]
  );

  // ⭐ PHASE 1.4: Reset currentSlide when match changes (prevents stale state)
  useEffect(() => {
    setCurrentSlide(0);
  }, [match.id]);

  // ⭐ PHASE 1.5: ANDROID FIX - Reset slide index when images array grows
  useEffect(() => {
    if (currentSlide >= slides.length) {
      setCurrentSlide(0); // Reset to first slide to prevent out-of-bounds
    }
  }, [currentSlide, slides.length]);

  // ⭐ PHASE 2.7: Pre-calc card width AND left position once (eliminate ALL DOM reads on Android)
  // ⭐ FIX #3: Add resize listener for orientation changes
  useLayoutEffect(() => {
    const compute = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      containerWidth.current = rect.width;
      containerLeft.current = rect.left;
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  // ⭐ PHASE 1.6: Memoize slide navigation handlers (prevents closure re-creation)
  const handleNext = useCallback(() => {
    if (slideTransitionInProgress.current) return; // Prevent rapid clicks
    slideTransitionInProgress.current = true;

    setCurrentSlide(s => {
      const nextIndex = Math.min(s + 1, slides.length - 1);
      onImageIndexChange?.(nextIndex, slides.length); // ⭐ SMART LOADING: Notify parent with index info
      return nextIndex;
    });

    setTimeout(() => {
      slideTransitionInProgress.current = false;
    }, 150); // Small debounce to prevent accidental double-clicks
  }, [slides.length, onImageIndexChange]);

  const handlePrev = useCallback(() => {
    if (slideTransitionInProgress.current) return; // Prevent rapid clicks
    slideTransitionInProgress.current = true;

    setCurrentSlide(s => {
      const prevIndex = Math.max(s - 1, 0);
      onImageIndexChange?.(prevIndex, slides.length); // ⭐ SMART LOADING: Notify parent with index info
      return prevIndex;
    });

    setTimeout(() => {
      slideTransitionInProgress.current = false;
    }, 150); // Small debounce to prevent accidental double-clicks
  }, [slides.length, onImageIndexChange]);

  // ⭐ FIX: Robust click handler that gets fresh values from DOM if needed
  const handleSlideClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();

    // Prevent clicks during transitions
    if (slideTransitionInProgress.current) return;

    let width = containerWidth.current;
    let left = containerLeft.current;

    // If values aren't initialized, compute them now (fallback for race conditions)
    if (!width && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      width = rect.width;
      left = rect.left;
      containerWidth.current = width;
      containerLeft.current = left;
    }

    if (!width) return; // Still no width, can't determine click position

    const clickX = e.clientX - left;
    const isLeftHalf = clickX < width / 2;

    if (isLeftHalf) {
      handlePrev();
    } else {
      handleNext();
    }
  }, [handleNext, handlePrev]);

  // ⭐ FIX #4: Image resolver to prioritize blob URLs over optimized URLs
  const resolveImageUrl = useCallback((url: string) => {
    return memoPreloadedBlobs[url] || getOptimizedUrl(url);
  }, [memoPreloadedBlobs, getOptimizedUrl]);

  // ⭐ FIX #5: Stable slide data prevents SlideRenderer re-render on every tap
  // ⭐ CRITICAL FIX: Guard against out-of-bounds access during rapid swiping
  const currentSlideData = useMemo(() => {
    if (!slides || slides.length === 0) {
      return { type: 'placeholder' as const, content: '', index: 0 };
    }
    const safeIndex = Math.min(Math.max(0, currentSlide), slides.length - 1);
    return slides[safeIndex] || { type: 'placeholder' as const, content: '', index: 0 };
  }, [slides, currentSlide]);
  // Report / block (with undo) - one flow shared with Liked Me and the preview.
  const report = useProfileReport({
    reportedUserId: match.id,
    getImageUrl: () => slides[currentSlide]?.content,
    onBlocked: onUserBlocked,
    // Lets DiscoverPage suspend the swipe gesture while the dialog is up.
    onOpenChange: onReportModalOpenChange,
    lockBodyScroll: true,
  });

  // Handle split rendering modes
  // Distance label for the caption: precomputed value first, then the location
  // service's, then a live calculation from both coordinates.
  const distanceLabelFor = (): string | null => {
    let km: number | undefined;
    if (match.distance !== undefined && match.distance < 999) km = match.distance;
    else if (preCalculatedDistance !== undefined && preCalculatedDistance < 999) km = preCalculatedDistance;
    else if (currentUserLatitude && currentUserLongitude && match.latitude && match.longitude) {
      km = calculateDistance(currentUserLatitude, currentUserLongitude, match.latitude, match.longitude);
    }
    return km !== undefined ? formatDistance(km) : null;
  };

  if (isSwipeAreaOnly) {
    // Render only the swipeable image area
    return (
  <div ref={containerRef} className="relative w-full h-full min-h-full overflow-hidden">
        {/* Image/Bio Container - Swipeable Area Only */}
        <div className="relative w-full h-full overflow-hidden" onClick={handleSlideClick}>
          {/* Current slide content */}
          {slides && slides.length > 0 && (
            <div className="w-full h-full transition-all duration-300 ease-in-out">
              {/* Report button for image slides. Same stacking-context ceiling
                  as the sign display/slide dots below — portaled out so it
                  can render above the global header instead of underneath
                  it. Aligned to the same top offset as DiscoverTopBar's own
                  row (DiscoverTopBar.tsx) so the two read as one bar - this
                  button sits in the reserved slot on its right edge instead
                  of DiscoverTopBar duplicating report's own logic. */}
              {isActiveTab && slides[currentSlide]?.type === 'image' && createPortal(
                <div
                  key={match.id}
                  className="dl-under-popup dl-card-fade fixed right-3 z-[9999]"
                  style={{
                    top: 'calc(var(--app-header-height, 72px) + 8px)'
                  }}
                >
                  <button
                    className={`${styles.reportButton} dl-hit`}
                    onClick={e => { e.stopPropagation(); report.open(); }}
                    aria-label="Report image"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>,
                document.body
              )}

              {/* The top-of-card cultural sign badge (all of this profile's signs,
                  stacked) used to render here via a portal. Removed - the info
                  area below already surfaces two of their signs as chips
                  (see signHighlights), so this was a redundant, floating
                  duplicate of the same information. */}
              {/* ⭐ PHASE 1.8: Use memoized SlideRenderer (40-60% Android render improvement) */}
              <SlideRenderer
                slide={currentSlideData}
                userBackgroundColor={userBackgroundColor}
                matchFirstName={match.first_name}
                matchLastName={match.last_name}
                preloadedBlobImages={memoPreloadedBlobs}
                imageStatus={imageStatus}
                getOptimizedUrl={resolveImageUrl}
              />
            </div>
          )}

          {/* Slide indicators */}
          {/* Same stacking-context ceiling as the sign display above - portaled out so the
              slide dots can render above the global header instead of underneath it.
              Centred just below DiscoverTopBar's row. */}
          {isActiveTab && slides && slides.length > 1 && createPortal(
            <div
              key={match.id}
              className="dl-under-popup dl-card-fade fixed z-[9999] flex justify-center"
              style={{
                left: 0,
                right: 0,
                top: 'calc(var(--app-header-height, 72px) + 48px)',
                pointerEvents: 'none',
              }}
            >
              <SlideDots total={slides.length} current={currentSlide} />
            </div>,
            document.body
          )}

          {/* Cultural sign is shown in the top-center */}

          {/* Name / location / highlights caption + expand control (shared with Liked Me
              and the preview, so all three show the same header). */}
          <ProfileCaption
            key={match.id}
            animateIn
            name={`${toTitleCase(match.first_name)} ${toTitleCase(match.last_name)}`.trim()}
            age={calculateAge(match.date_of_birth)}
            online={isRecentlyOnline(match.last_login_at, SWIPE_ONLINE_WINDOW_MS)}
            verified={showVerifiedBadge}
            city={match.city}
            country={match.country}
            distanceLabel={distanceLabelFor()}
            heightCm={match.height_cm}
            relationshipIntent={match.relationship_intent}
            bio={stableMatch.bio}
            highlights={previewHighlights}
            signHighlights={signHighlights}
            musicHighlight={musicHighlight}
            currentSlide={currentSlide}
            showAbout={showAbout}
            expanded={showMoreInfo}
            onToggle={onToggleInfo}
            showBoost={isActiveTab}
          />

          <ProfileReportModal report={report} />
        </div>
      </div>
    );
  }

  if (isDetailsAreaOnly) {
    // Expanded details panel only - name/location/tags/toggle live in the photo
    // caption (isSwipeAreaOnly). The sections themselves are the shared
    // ProfileDetailsPanel, so Discover, Liked Me and the preview all match.
    return (
      <div
        className="w-full bg-black"
        style={{
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Roboto, "Segoe UI", sans-serif'
        }}
      >
        <ProfileDetailsPanel
          profile={match}
          captionedPhotos={captionedPhotos}
          secondPhotoAnchor={secondPhotoAnchor}
          preferredLanguageName={preferredLanguageName}
          iceTarget={iceTarget}
          // Clear of the floating undo button so the last section can scroll above it.
          className="pb-24"
        />
      </div>
    );
  }

  // Full card rendering (default)
  return (
    <div className="relative w-full h-full">
      {/* Report button for profile (Discover) - only if not current user */}
      {match.id && match.id !== undefined && (
        <div className="absolute top-2 right-2 z-20">
          <ReportButton
            reporterId={currentUserLatitude ? String(currentUserLatitude) : ''} // fallback, ideally pass currentUser.id
            reportedUserId={match.id}
            contentType="profile"
            contentId={match.id}
          />
        </div>
      )}
      {/* Main card content would go here for full rendering */}
      <div className="text-center p-8">
        <p>Full card rendering not implemented in this mode</p>
      </div>
    </div>
  );
};

const areStringArraysEqual = (a: string[], b: string[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const areStringMapsEqual = (
  a?: Record<string, string>,
  b?: Record<string, string>
) => {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i];
    if (a[key] !== b[key]) return false;
  }
  return true;
};

const areImageStatusMapsEqual = (
  a?: Record<string, 'idle'|'loading'|'loaded'|'error'>,
  b?: Record<string, 'idle'|'loading'|'loaded'|'error'>
) => {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i];
    if (a[key] !== b[key]) return false;
  }
  return true;
};

// ⭐ PHASE 2.9: PureComponent to freeze layout (prevents unnecessary re-renders on Android)
export default React.memo(MatchCard, (prev, next) => {
  return (
    prev.match.id === next.match.id &&
    // Reference check only (cheap) - DiscoverPage.tsx only produces a new
    // imageCaptions object when a fetch actually merges in new label/caption
    // content, so this rarely changes and never during a swipe. Without it,
    // a caption that finishes loading after the card is already mounted
    // would silently never appear until something else (like flipping
    // photos) forced a re-render anyway.
    prev.match.imageCaptions === next.match.imageCaptions &&
    prev.isActiveTab === next.isActiveTab &&
    areStringArraysEqual(prev.userImages, next.userImages) &&
    areStringMapsEqual(prev.preloadedBlobImages, next.preloadedBlobImages) &&
    prev.showMoreInfo === next.showMoreInfo &&
    prev.swipeDirection === next.swipeDirection &&
    prev.imageIndex === next.imageIndex &&
    prev.preferredLanguageName === next.preferredLanguageName && // ⭐ FIX #2: Detect language changes
    areImageStatusMapsEqual(prev.imageStatus, next.imageStatus) // ⭐ FIX #3: Detect loading state changes
  );
});
