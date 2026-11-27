import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, ArrowLeft as ArrowLeftIcon, ChevronLeft, X as XIcon } from 'lucide-react';
import { Pencil } from 'lucide-react';
import { PotentialMatch } from '@/types';
import { calculateAge } from '@/utils/dateUtils';
import { getLanguageName } from '@/utils/languageNames';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import { buildSlides, getPreviewHighlights, getUserColorHash, seedFromString, mulberry32, seededShuffle } from '../discover/MatchCardHelpers';
import { findFavoriteWithLink } from '@/constants/favorites';

import { ProfileDetailsPanel } from '../profile-card/ProfileDetailsPanel';
import { useCaptionedPhotos, toTitleCase } from '../profile-card/profileCardUtils';
import { ProfileCaption } from '../profile-card/ProfileCaption';
import { icebreakerPillFor } from '../icebreaker/target';
import { ProfileReportModal } from '../profile-card/ProfileReportModal';
import { useProfileReport } from '../profile-card/useProfileReport';
import { useBackClose } from '@/utils/backStack';
import { isRecentlyOnline, SWIPE_ONLINE_WINDOW_MS } from '@/utils/onlineStatus';
import { SlideRenderer } from '../discover/SlideRenderer';
import SwipeButtons from '../discover/SwipeButtons';
import { useCardSwipe, CARD_EXIT_MS, CARD_REST_TRANSFORM, exitTransform, type SwipeDir } from '../discover/useCardSwipe';
import PhotoCropModal, { uploadCroppedPhoto } from './PhotoCropModal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { calculateProfileCompletion } from '@/utils/profileCompletion';

interface ProfilePreviewModalProps {
  profile: PotentialMatch;
  images: string[];
  onClose: () => void;
  onPhotoUpdated?: () => void;
  /** Told whenever there is/isn't an unsaved crop, so the parent (ProfilePage)
   * can warn if the user leaves this screen (switches tabs) before saving -
   * this component itself has no "leave" button of its own; leaving always
   * happens externally (see ProfilePage's isActiveTab/profileTabSignal
   * effects), which unmounts this component and loses the unsaved crop
   * outright, so the warning has to come from the parent. */
  onPendingCropChange?: (hasPending: boolean) => void;
  /** True when previewing someone else's profile (e.g. Circle) rather than
   * your own (ProfilePage's "Preview" button, the default/only use case this
   * component originally had) - hides the crop/edit button, which would
   * otherwise let a viewer open PhotoCropModal against a stranger's photo. */
  readOnly?: boolean;
  /** Shows a back button, top-left of the photo. Separate from onClose (which
   * every caller already has to provide) because most existing callers rely
   * on an outer tab/nav to leave instead of an in-component control - this
   * only renders the button when a caller actually wants one (Circle does). */
  onBack?: () => void;
  /** Circle wants the plain chevron back button (matching PremiumUpgrade's),
   * not the circular blurred-background arrow-left button every other
   * caller (e.g. ChatPage) still uses - default false keeps their look
   * unchanged. */
  simpleBackButton?: boolean;
  /** Providing BOTH onLike and onPass turns the photo area into a real
   * swipeable card (drag right to like, left to pass - same feel as
   * Discover/Liked Me's own swipe gestures), on top of the existing
   * tap-left-half/tap-right-half slide navigation. Neither fires without the
   * other; a caller that only wants read-only browsing (the original,
   * still-default behavior) simply omits both. */
  onLike?: () => void;
  onPass?: () => void;
  /** A small pill centered at the top of the photo, naming what's currently
   * being browsed (e.g. "Travel") - lets Circle's filtered category decks
   * make clear which filter is active while swiping through it. */
  topLabel?: string;
  /** The next profile's first photo, when swiping is enabled and there's a
   * next card queued up (e.g. Circle's category browse deck) - shown as a
   * blurred, dimmed backdrop behind the current card, same as Discover's own
   * swipe deck, so the next photo is already loaded and there's a sense of
   * depth instead of the current card floating over plain black. Blurred/
   * dimmed until the swipe actually commits (mirrors Discover: don't reveal
   * who's next until the user has actually swiped past this one). */
  nextPreviewImageUrl?: string;
  /** Circle's authoritative remaining right-likes for today. */
  dailyLikeCounter?: { remaining: number; limit: number };
}

const BACKGROUND_COLORS = [
  'bg-gradient-to-br from-pink-600 to-rose-900',
  'bg-gradient-to-br from-purple-600 to-indigo-900',
  'bg-gradient-to-br from-rose-600 to-pink-900',
  'bg-gradient-to-br from-fuchsia-600 to-purple-900',
];

const getSafeImageSrc = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('blob:')) return url;
  if (url.includes('supabase')) return getDetailImageUrl(url);
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
const ProfilePreviewModal: React.FC<ProfilePreviewModalProps> = ({ profile, images, onClose, onPhotoUpdated, onPendingCropChange, readOnly = false, onBack, simpleBackButton = false, onLike, onPass, topLabel, nextPreviewImageUrl, dailyLikeCounter }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  // Report image - only reachable in readOnly mode (Circle), same as the
  // Crop button it sits opposite: nobody should be able to report their own
  // photo, and nobody but the profile's owner should be able to crop it.
  // Crop is applied locally first ("OK" in the crop modal) so the user sees it
  // exactly as it will look here, and only hits storage/db on an explicit Save.
  const [pendingCrop, setPendingCrop] = useState<{ blob: Blob; previewUrl: string; originalUrl: string } | null>(null);
  const [savingCrop, setSavingCrop] = useState(false);
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);

  // Tell the parent whether there's something unsaved - it has no other way
  // to know, since it's the one that actually unmounts this component when
  // the user navigates away.
  useEffect(() => {
    onPendingCropChange?.(!!pendingCrop);
  }, [pendingCrop, onPendingCropChange]);

  // Revoke the local object URL when it's replaced or the preview goes away.
  useEffect(() => {
    return () => {
      if (pendingCrop?.previewUrl) URL.revokeObjectURL(pendingCrop.previewUrl);
    };
  }, [pendingCrop?.previewUrl]);

  // Warn on a real page unload while a crop is pending.
  useEffect(() => {
    if (!pendingCrop) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingCrop]);

  const handleSavePendingCrop = useCallback(async () => {
    if (!pendingCrop || savingCrop) return;
    setSavingCrop(true);
    try {
      await uploadCroppedPhoto(profile.id, pendingCrop.originalUrl, pendingCrop.blob);
      URL.revokeObjectURL(pendingCrop.previewUrl);
      setPendingCrop(null);
      toast({ title: 'Photo updated', description: 'Your cropped photo has been saved.' });
      onPhotoUpdated?.();
    } catch (error) {
      console.error('Error saving cropped photo:', error);
      toast({ title: 'Error', description: 'Failed to save your cropped photo. Please try again.', variant: 'destructive' });
    } finally {
      setSavingCrop(false);
    }
  }, [pendingCrop, savingCrop, profile.id, toast, onPhotoUpdated]);

  const handleDiscardPendingCrop = useCallback(() => {
    if (pendingCrop?.previewUrl) URL.revokeObjectURL(pendingCrop.previewUrl);
    setPendingCrop(null);
    setShowDiscardWarning(false);
  }, [pendingCrop]);
  const expandedDetailsRef = useRef<HTMLDivElement>(null);

  const slides = useMemo(() => buildSlides(profile, images), [profile, images]);
  const previewHighlights = useMemo(
    () => getPreviewHighlights(profile, currentSlide),
    [profile, currentSlide]
  );
  // Two of this profile's signs, shuffled with a per-profile seed so which
  // ones lead feels random without reshuffling on every render, and still
  // cycling which two lead as the viewer taps through photos - mirrors
  // MatchCard's signHighlights (this used to also duplicate as a floating
  // badge above the photo, now removed).
  const signHighlights = useMemo(() => {
    const theirs = profile.adinkra_symbols;
    if (!theirs || theirs.length === 0) return [];
    const rand = mulberry32(seedFromString(`${profile.id || profile.first_name || ''}_signhighlight`));
    const ordered = seededShuffle(theirs, rand);
    if (ordered.length === 1) return [ordered[0]];
    const start = currentSlide % ordered.length;
    return [ordered[start], ordered[(start + 1) % ordered.length]];
  }, [profile.adinkra_symbols, profile.id, profile.first_name, currentSlide]);
  // Up to 2 captioned photos (seeded pick, shared with every other profile view).
  const { captionedPhotos, secondPhotoAnchor } = useCaptionedPhotos(
    profile.imageCaptions,
    String(profile.id || profile.first_name || '')
  );


  // The collapsed card's "body" rotates through chips and a bio excerpt as
  // the viewer taps through photos, mirroring Discover's MatchCard -
  // captioned photos are surfaced separately, in the expanded "Photos"
  // section below, not here in the collapsed call-out.
  const infoSlotSequence = useMemo(() => {
    const seq: Array<'chips' | 'about'> = ['chips', 'chips'];
    if (profile.bio?.trim()) seq.push('about');
    return seq;
  }, [profile.bio]);

  const activeInfoSlot = infoSlotSequence[currentSlide % infoSlotSequence.length];
  const showAbout = activeInfoSlot === 'about';
  // Same "earned" verified badge shown on the user's own profile page (>=85%
  // profile completion), not a face-verification flag.
  const showVerifiedBadge = useMemo(
    () => calculateProfileCompletion(profile, images).showVerifiedBadge,
    [profile, images]
  );
  const musicHighlight = useMemo(() => findFavoriteWithLink(profile.favorites), [profile]);
  const userBackgroundColor = useMemo(
    () => getUserColorHash(profile.id, BACKGROUND_COLORS),
    [profile.id]
  );
  const preferredLanguageName = useMemo(
    () => getLanguageName((profile as unknown as { preferred_language?: string }).preferred_language),
    [profile]
  );

  const currentSlideData = slides[currentSlide] || slides[0];

  // Android back leaves the preview (Circle's back arrow when present, else close).
  useBackClose(true, onBack ?? onClose);

  // Report (photo on screen) - same shared flow, and same moderation queue, as Discover.
  // The preview can only report; blocking someone from Circle is handled elsewhere.
  const report = useProfileReport({
    reportedUserId: profile.id,
    getImageUrl: () => currentSlideData?.content,
  });

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

  // Swipe-to-like/pass - only active when the caller supplies both handlers
  // (Circle does; ProfilePage's own "preview my profile" use case doesn't).
  // Ported to match Discover's OWN gesture exactly (native touch/mouse
  // events, not Pointer Events - Discover deliberately uses the former, and
  // that's the version proven reliable across real devices) rather than the
  // previous Pointer-Events port, which tracked X only and reportedly didn't
  // reliably register as a real swipe. Tap-to-navigate-slides is a plain,
  // separate onClick below (see handleNavigationClick) - exactly like
  // Discover's own MatchCard, which relies on the browser's native behavior
  // of suppressing the synthetic "click" after a real drag, instead of a
  // hand-rolled dragging flag.
  const swipeEnabled = Boolean(onLike && onPass);
  // Same gesture core as Discover (touch / mouse / keyboard share one path: thresholds,
  // fly-away, snap-back and the heart / X stamps are identical). `holdAfterCommit` keeps the
  // thrown card off-screen while Circle waits on the network before advancing, so the old
  // card never flashes back; if the parent does NOT advance (daily limit, error) the card is
  // restored below.
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);
  const [swipeExitDirection, setSwipeExitDirection] = useState<SwipeDir | null>(null);
  const swipeCardElRef = useRef<HTMLDivElement>(null);
  const likeStampRef = useRef<HTMLDivElement>(null);
  const passStampRef = useRef<HTMLDivElement>(null);
  const restoreTimerRef = useRef<number | null>(null);
  // Next-card backdrop reveal - fully hidden the entire drag (no matter how
  // far), only clearing once the swipe actually commits (swipeExitDirection
  // fires), same "hidden until it goes completely through" behavior as
  // Discover's own next-card peek.
  const NEXT_CARD_MAX_BLUR_PX = 12;
  const NEXT_CARD_MAX_DARK_OPACITY = 0.3;
  const nextCardRevealProgress = swipeExitDirection ? 1 : 0;

  const cardSwipe = useCardSwipe({
    cardRef: swipeCardElRef,
    likeStampRef,
    passStampRef,
    isBlocked: () => !swipeEnabled,
    holdAfterCommit: true,
    onUiChange: (patch) => {
      if (patch.isDragging !== undefined) setIsSwipeDragging(patch.isDragging);
    },
    onExitStart: (dir) => setSwipeExitDirection(dir),
    onExitEnd: () => setSwipeExitDirection(null),
    onCommit: (dir) => {
      if (dir === 'right') onLike?.(); else onPass?.();
      // The parent normally swaps in the next profile (this component is re-keyed per
      // profile). If it is still here a moment later nothing advanced - restore the card.
      if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
      // Circle now advances synchronously (the like/pass is sent in the background), so a card that is
      // still here shortly after commit means the parent refused it (daily limit): bring it back fast.
      restoreTimerRef.current = window.setTimeout(() => {
        restoreTimerRef.current = null;
        cardSwipe.restore();
      }, 450);
    },
  });
  useEffect(() => () => {
    if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
  }, []);

  // Keyboard parity (desktop / switch control): Left = pass, Right = like, same fly-away as a
  // gesture. Ignored while typing, while a dialog is open, or while this card is hidden
  // (Circle stays mounted behind other tabs).
  useEffect(() => {
    if (!swipeEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const el = swipeCardElRef.current;
      if (!el || el.getClientRects().length === 0) return;
      e.preventDefault();
      cardSwipe.commitSwipe(e.key === 'ArrowRight' ? 'right' : 'left');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [swipeEnabled, cardSwipe]);

  const lifestyleFields = [profile.smoking, profile.drinking, profile.exercise_level, profile.sleeping_schedule];
  const hasLifestyle = lifestyleFields.some(val => val && val !== 'not_specified');

  return (
    <div
      className="relative w-full bg-black"
      style={{
        // h-full minus the gap below (not h-full + padding-bottom) - padding
        // would sit INSIDE the bordered box, so the border would still touch
        // the nav with no visible gap between them. A margin on a shorter box
        // actually leaves the gap outside the border, matching Discover's.
        height: 'calc(100% - clamp(6px, 2vw, 10px))',
        marginBottom: 'clamp(6px, 2vw, 10px)',
      }}
    >
      {/* Next card, loaded and waiting behind the current one - same idea as
          Discover's own swipe deck. Blurred/dimmed until the swipe actually
          commits, so nobody sees who's next before they've committed to the
          swipe; the photo itself is already loaded the whole time, so
          there's no blank flash once this card advances. A sibling BEFORE
          the draggable card below (not nested inside it) so it stays put
          while the card on top slides away - it's what's being revealed,
          not something that should move with the drag. */}
      {swipeEnabled && nextPreviewImageUrl && (
        <div
          className="absolute inset-0 overflow-hidden bg-black"
          style={{ borderRadius: '0px 0px 22px 22px' }}
          aria-hidden="true"
        >
          <img
            src={getDetailImageUrl(nextPreviewImageUrl)}
            decoding="async"
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{
              transform: 'scale(1.08)',
              filter: `blur(${NEXT_CARD_MAX_BLUR_PX * (1 - nextCardRevealProgress)}px)`,
              transition: 'filter 250ms ease-out',
            }}
          />
          <div
            className="absolute inset-0 bg-black"
            style={{
              opacity: NEXT_CARD_MAX_DARK_OPACITY * (1 - nextCardRevealProgress),
              transition: 'opacity 250ms ease-out',
            }}
          />
        </div>
      )}

      {/* The card itself - border, rounded corners and the whole drag
          transform live HERE (not just the photo), so grabbing anywhere on
          the visible card - the photo, the name/caption text, the chips -
          drags the entire bordered card as one rigid unit and counts as a
          real swipe, exactly like Discover. Previously the drag target was
          a plain inset-0 box living only inside the photo area, a sibling
          (not an ancestor) of the caption/dots/back-button, so starting a
          drag from the caption text never reached the swipe handlers at
          all - only the bare photo pixels worked. */}
      <div
        ref={swipeCardElRef}
        className={`profile-info-layout ${showMoreInfo ? 'is-expanded' : ''} absolute inset-0 bg-black overflow-hidden select-none`}
        style={{
          // All four corners round in like a card lifting off the stack the
          // moment it's picked up (dragging) or thrown (exiting), then back
          // to the flat-top resting shape once it settles - same as
          // Discover's cardCornerRadius.
          borderRadius: (isSwipeDragging || swipeExitDirection) ? '26px' : '0px 0px 22px 22px',
          border: '1px solid rgba(236,72,153,0.55)',
          willChange: swipeEnabled ? 'transform' : undefined,
          // Mirrors Discover's own getCardTransform exactly (exit fly-away >
          // active drag follows the finger in both X and Y > resting) so
          // React's own re-render (triggered by the same setSwipeDragX/Y
          // call that scheduled the imperative write above) always settles
          // on the SAME destination the imperative write already painted -
          // it never has a chance to snap back to an X-only transform and
          // erase the vertical offset, which is what silently killed the
          // "grab and move" feel before (the card could only ever move
          // horizontally, since this style never read a Y value at all).
          transform: swipeExitDirection
            ? exitTransform(swipeExitDirection, window.innerWidth, window.innerHeight)
            : CARD_REST_TRANSFORM,
          transition: isSwipeDragging
            ? 'border-radius 0.2s ease'
            : swipeExitDirection
              ? `transform ${CARD_EXIT_MS}ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.3s ease`
              : 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.3s ease',
        }}
      >
        {/* Photo area - sized close to Discover's near-full-bleed swipe card
            (a viewport-relative height rather than a fixed aspect ratio, so it
            fills the screen the same way) with a sensible floor for short
            screens; the caption overlay below is clipped to this box so it can
            never bleed past the photo's own edges. Collapsed, nothing else
            shares this flex column, so a flat 78vh left a dead strip of plain
            black between the photo's own bottom (where the caption/feathering
            is pinned) and the screen's real bottom edge; flex:1 fills that
            instead so the feathering actually reaches the bottom of the
            screen. The pointer handlers live HERE (not on some inner sub-box)
            so a drag started anywhere in this area - photo, caption, dots,
            back button - is caught, matching Discover's own bubbling-based
            onTouchStart on its image area. Duration/easing now match
            Discover's own resize exactly (a flat 300ms, default easing) -
            Discover is the benchmark for this motion. */}
        <div
          className="profile-info-photo relative w-full overflow-hidden select-none"
          style={{
            cursor: 'pointer',
            // 'none', not 'pan-y': the card now tracks the finger in both
            // X and Y for a real grab-and-move feel (matching Discover),
            // which would otherwise fight the browser's own native
            // vertical-pan handling for the same gesture.
            touchAction: swipeEnabled ? 'none' : undefined,
          }}
          {...(swipeEnabled ? cardSwipe.handlers : {})}
          onClick={handleNavigationClick}
        >
          {currentSlideData && (
            <SlideRenderer
              slide={currentSlideData}
              userBackgroundColor={userBackgroundColor}
              matchFirstName={profile.first_name || ''}
              matchLastName={profile.last_name || ''}
              getOptimizedUrl={(url) =>
                (pendingCrop && url === pendingCrop.originalUrl
                  ? pendingCrop.previewUrl
                  : getSafeImageSrc(url)) || url
              }
            />
          )}

          {/* Like (heart) / Pass (X) stamps - identical to Discover. Always mounted and driven
              straight on the DOM by useCardSwipe, so they grow smoothly with the drag. */}
          {swipeEnabled && (
            <>
              <div aria-hidden="true" className="absolute inset-0 z-20 flex items-start justify-start pl-10 pointer-events-none" style={{ paddingTop: '35%' }}>
                <div ref={likeStampRef} className="relative" style={{ opacity: 0, willChange: 'transform, opacity', transition: 'none' }}>
                  <Heart className="w-20 h-20 absolute -top-2 -left-2 opacity-50" style={{ color: '#ef4444', fill: '#ef4444', filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.3))' }} />
                  <Heart className="w-20 h-20 relative" style={{ color: '#dc2626', fill: '#dc2626', filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.35))' }} />
                </div>
              </div>
              <div aria-hidden="true" className="absolute inset-0 z-20 flex items-start justify-end pr-10 pointer-events-none" style={{ paddingTop: '35%' }}>
                <div ref={passStampRef} style={{ opacity: 0, willChange: 'transform, opacity', transition: 'none' }}>
                  <XIcon className="w-28 h-28" strokeWidth={3} style={{ color: '#ffffff', filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.35))' }} />
                </div>
              </div>
            </>
          )}

          {/* Back button - only when the caller wants one (Circle does; other
              callers rely on their own outer tab/nav to leave). Circle uses
              the plain chevron (matching PremiumUpgrade's back button);
              every other caller keeps the original circular blurred button. */}
        {onBack && (simpleBackButton ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBack(); }}
            aria-label="Back"
            className="absolute left-2 top-4 z-10 flex items-center justify-center text-white active:opacity-60 transition-opacity"
            style={{ background: 'none', border: 'none', padding: 0 }}
          >
            <ChevronLeft className="w-8 h-8" strokeWidth={3} />
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onBack(); }}
            aria-label="Back"
            className="dl-hit absolute left-4 z-10 flex items-center justify-center w-9 h-9 rounded-full text-white bg-black/50 backdrop-blur-md border border-white/20 transition-transform active:scale-95"
            style={{ top: '4px', minHeight: 0 }}
          >
            <ArrowLeftIcon className="w-4 h-4" strokeWidth={2.5} />
          </button>
        ))}

        {/* Active-filter pill - compact and layered directly over the top of
            the cultural sign while remaining inside the photo safe area. */}
        {topLabel && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-20 max-w-[55%] truncate px-2 py-0.5 rounded-full text-white text-[10px] font-semibold bg-black/60 backdrop-blur-md border border-white/20"
            style={{ top: '2px' }}
          >
            {topLabel}
          </div>
        )}

        {dailyLikeCounter && (
          <div
            className="absolute right-4 top-9 z-10 flex items-center gap-0.5 rounded-full border border-pink-500/30 bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-pink-200 backdrop-blur-md"
            aria-label={`${dailyLikeCounter.remaining} of ${dailyLikeCounter.limit} Circle likes left today`}
          >
            <Heart className="h-2.5 w-2.5" />
            {dailyLikeCounter.remaining}/{dailyLikeCounter.limit}
          </div>
        )}

        {slides.length > 1 && (
          <div className={`absolute ${onBack ? 'left-[60px]' : 'left-4'} flex gap-1.5 z-10`} style={{ top: '14px' }}>
            {slides.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  idx === currentSlide ? 'bg-pink-500 w-7' : 'bg-pink-500/30 w-1.5'
                }`}
              />
            ))}
          </div>
        )}

        {/* The top-of-photo cultural sign badge (all of this profile's signs)
            used to render here. Removed - the info area below already
            surfaces two of their signs as chips (see signHighlights), so
            this was a redundant, floating duplicate of the same info. */}

        {/* Crop - top right, same row as the slide dots/sign. Only for photo
            slides (there's nothing to crop on a bio/fact slide). Edits the
            photo currently on screen. */}
        {!readOnly && currentSlideData?.type === 'image' && currentSlideData.content && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowCropModal(true); }}
            aria-label="Crop photo"
            className="absolute right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full text-white backdrop-blur-md transition-transform active:scale-95"
            style={{
              top: '4px',
              background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
              boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
            }}
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        )}

        {/* Report - top right, same spot Crop occupies for your own profile.
            Only when viewing someone else's (readOnly - Circle), and only on
            an actual photo slide, since it reports whichever photo is on
            screen. Same pink-gradient round style as every other floating
            action button on the card. */}
        {readOnly && currentSlideData?.type === 'image' && currentSlideData.content && (
          <button
            onClick={(e) => { e.stopPropagation(); report.open(); }}
            aria-label={t('reportModal.title')}
            className="dl-hit absolute right-4 z-10 flex items-center justify-center rounded-full text-white backdrop-blur-md transition-transform active:scale-95 shrink-0"
            style={{
              top: '4px',
              width: 24,
              height: 24,
              minWidth: 24,
              minHeight: 24,
              padding: 0,
              background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
              boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
            }}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}

        {readOnly && <ProfileReportModal report={report} allowBlock={false} />}

        {!readOnly && showCropModal && currentSlideData?.type === 'image' && currentSlideData.content && (
          <PhotoCropModal
            imageUrl={currentSlideData.content}
            userId={profile.id}
            onClose={() => setShowCropModal(false)}
            onApply={(result) => {
              if (pendingCrop?.previewUrl) URL.revokeObjectURL(pendingCrop.previewUrl);
              // Keep the ORIGINAL stored url as the key, even when re-cropping a
              // crop, so Save still repoints the right user_images row.
              setPendingCrop({ ...result, originalUrl: pendingCrop?.originalUrl || result.originalUrl });
              setShowCropModal(false);
            }}
          />
        )}

        {/* Unsaved-crop controls - only visible while a crop is pending. */}
        {pendingCrop && (
          <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 py-2 bg-black/70 backdrop-blur-md">
            <span className="text-xs text-white">Unsaved crop</span>
            <div className="flex items-center gap-2">
              <Button variant="line" size="sm" className="text-black"
                onClick={(e) => { e.stopPropagation(); setShowDiscardWarning(true); }}
                disabled={savingCrop}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm"
                onClick={(e) => { e.stopPropagation(); handleSavePendingCrop(); }}
                disabled={savingCrop}
              >
                {savingCrop ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {showDiscardWarning && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-xs rounded-xl border border-pink-500/30 bg-black p-4 text-center">
              <p className="text-sm text-white mb-1 font-semibold">Discard your crop?</p>
              <p className="text-xs text-white/80 mb-4">Your cropped photo hasn't been saved yet.</p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="line" size="sm" className="text-black"
                  onClick={() => setShowDiscardWarning(false)}
                >
                  Keep editing
                </Button>
                <Button variant="primary" size="sm"
                  onClick={handleDiscardPendingCrop}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        )}

                {/* Name / location / highlights caption + expand control (shared with Discover
            and Liked Me so every screen shows the same header). */}
        <ProfileCaption
          name={`${toTitleCase(profile.first_name)} ${toTitleCase(profile.last_name)}`.trim()}
          age={calculateAge(profile.date_of_birth)}
          online={isRecentlyOnline(profile.last_login_at, SWIPE_ONLINE_WINDOW_MS)}
          verified={showVerifiedBadge}
          city={profile.city}
          country={profile.country}
          heightCm={profile.height_cm}
          relationshipIntent={profile.relationship_intent}
          bio={profile.bio}
          highlights={previewHighlights}
          signHighlights={signHighlights}
          musicHighlight={musicHighlight}
          currentSlide={currentSlide}
          showAbout={showAbout}
          expanded={showMoreInfo}
          onToggle={() => setShowMoreInfo((v) => !v)}
          action={readOnly ? icebreakerPillFor(profile, slides, { photoUrl: images?.[0], currentSlide }) : null}
        />
      </div>

      {/* Expanded details - directly beneath the name caption (the photo
          shrinks to make room, same as the collapsed<->expanded relationship
          in Discover), scrolling independently on its own from here down.
          Same solid black background and minimal top padding so it reads as
          one continuous panel with the caption above rather than a separate
          block with a gap. */}
        <div
          ref={expandedDetailsRef}
          className="profile-info-panel bg-black overflow-y-auto scrollbar-hide"
          aria-hidden={!showMoreInfo}
          style={{
            WebkitOverflowScrolling: 'touch',
            // Overlaps the photo box by a hair to paper over the subpixel seam
            // that shows up between the gradient's solid-black bottom edge and
            // this panel's own bg-black - rounding on the photo's percentage
            // (vh) height can leave a sliver exposing whatever's behind it.
            marginTop: '-2px',
          }}
        >
          <ProfileDetailsPanel
            profile={profile}
            captionedPhotos={captionedPhotos}
            secondPhotoAnchor={secondPhotoAnchor}
            preferredLanguageName={preferredLanguageName}
            className="pb-24"
          />
        </div>
      </div>

      {/* Undo button - same 'fixed' control as Discover's SwipeButtons. Kept
          as a sibling of the card above (not nested inside it): the card
          carries a CSS transform while dragging, and a transformed ancestor
          becomes the containing block for any `position: fixed` descendant -
          nesting this inside it would break its anchor to the true viewport.
          This modal is rendered inline within MainApp's own layout (in place
          of ProfilePage's content), which keeps MainApp's fixed header/nav
          visible around it - so it shares the SAME true viewport those are
          anchored to, and the same nav-aware 'fixed' formula that positions
          this correctly on Discover positions it correctly here too. There's
          no swipe to undo in a read-only preview, so it steps back through
          this profile's own photos instead; disabled on the first one. */}
      <SwipeButtons
        onReverse={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
        canReverse={currentSlide > 0}
      />
    </div>
  );
};

export default ProfilePreviewModal;
