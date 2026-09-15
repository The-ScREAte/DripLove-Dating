import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapPin,
  Heart,
  Briefcase,
  GraduationCap,
  Languages,
  ArrowDown,
  ArrowUp,
  ArrowLeft as ArrowLeftIcon,
  Ruler,
  Baby,
  MessageCircle,
  Gift,
  PawPrint,
  Share2,
  X as XIcon,
} from 'lucide-react';
import { Pencil } from 'lucide-react';
import { PotentialMatch } from '@/types';
import { calculateAge } from '@/utils/dateUtils';
import { getLanguageName } from '@/utils/languageNames';
import { optimizeImageUrl } from '@/utils/imageOptimizer';
import { buildSlides, getPreviewHighlights, getUserColorHash, HIGHLIGHT_CHIP_BORDER_COLORS, truncateChipLabel, seedFromString, mulberry32 } from '../discover/MatchCardHelpers';
import { favoriteEmoji, formatFavoriteLabel, findFavoriteWithLink } from '@/constants/favorites';
import {
  FAMILY_PLANS_OPTIONS,
  COMMUNICATION_STYLE_OPTIONS,
  LOVE_STYLE_OPTIONS,
  PETS_OPTIONS,
  SOCIAL_MEDIA_OPTIONS,
  traitLabel,
} from '@/constants/profileTraits';
import MusicLinkBadge from '../discover/MusicLinkBadge';
import { SlideRenderer } from '../discover/SlideRenderer';
import UserAdinkraDisplay from '../discover/UserAdinkraDisplay';
import SwipeButtons from '../discover/SwipeButtons';
import PhotoCropModal, { uploadCroppedPhoto } from './PhotoCropModal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { calculateProfileCompletion } from '@/utils/profileCompletion';

const formatHeightLabel = (cm: number) => {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}" (${cm} cm)`;
};

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
}

const BACKGROUND_COLORS = [
  'bg-gradient-to-br from-pink-600 to-rose-900',
  'bg-gradient-to-br from-purple-600 to-indigo-900',
  'bg-gradient-to-br from-rose-600 to-pink-900',
  'bg-gradient-to-br from-fuchsia-600 to-purple-900',
];

// Where the second captioned photo call-out can land in the expanded details
// panel - always above Personality. Module-level (not per-render) since it's
// a fixed constant, not something that needs recreating on every render.
const PHOTO_ANCHORS = ['lifestyle', 'workEducation', 'personality', 'communicationStyle'] as const;

const formatRelationshipIntent = (intent?: string | null) => {
  if (!intent) return '';
  if (intent === 'serious') return 'Looking for something serious';
  if (intent === 'open_to_anything') return 'Open to anything';
  return `Looking for ${intent.replace(/_/g, ' ').toLowerCase()}`;
};

const getSafeImageSrc = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('blob:')) return url;
  if (url.includes('supabase')) return optimizeImageUrl(url, { width: 1080, quality: 82 });
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
const ProfilePreviewModal: React.FC<ProfilePreviewModalProps> = ({ profile, images, onClose, onPhotoUpdated, onPendingCropChange, readOnly = false, onBack, onLike, onPass, topLabel, nextPreviewImageUrl }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
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
  // Cycles through ALL of this profile's signs (not just the first) as the
  // viewer taps through photos, mirroring MatchCard's rotation.
  const signHighlight = useMemo(() => {
    const theirs = profile.adinkra_symbols;
    if (!theirs || theirs.length === 0) return null;
    return theirs[currentSlide % theirs.length];
  }, [profile.adinkra_symbols, currentSlide]);
  // Up to 2 of this profile's photos that have a caption set (ImageManagement.tsx),
  // picked once via a seeded shuffle so the same 1-2 photos surface consistently
  // rather than a different random pick every render.
  const captionedPhotos = useMemo(() => {
    const entries = Object.entries(profile.imageCaptions || {})
      .filter(([, v]) => v?.caption)
      .map(([url, v]) => ({ url, caption: v!.caption as string, label: v!.label || null }));
    if (entries.length === 0) return [];
    const seed = seedFromString(`${profile.id || profile.first_name || ''}_photocaption`);
    const rand = mulberry32(seed);
    const shuffled = [...entries];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 2);
  }, [profile.imageCaptions, profile.id, profile.first_name]);

  // Both captioned photos show in the expanded panel, but scattered rather
  // than back-to-back: the first sits right after About, and the second
  // lands after a randomly chosen later section (seeded per profile, so it's
  // consistent rather than jumping around on every re-render).
  const secondPhotoAnchor = useMemo(() => {
    if (captionedPhotos.length < 2) return null;
    const seed = seedFromString(`${profile.id || profile.first_name || ''}_photo2anchor`);
    const rand = mulberry32(seed);
    return PHOTO_ANCHORS[Math.floor(rand() * PHOTO_ANCHORS.length)];
  }, [captionedPhotos.length, profile.id, profile.first_name]);

  // Caption text is capped at 50 characters, matching the limit enforced when
  // saving it in ImageManagement.tsx, so this should rarely ever truncate -
  // it's just a safety net for older captions saved before that cap existed.
  const truncateCaption = (text: string) => (text.length > 50 ? `${text.slice(0, 50).trimEnd()}…` : text);

  const renderPhotoCaptionCard = (photo: { url: string; caption: string; label?: string | null }) => (
    <div className="relative w-56 aspect-[3/4] rounded-lg overflow-hidden bg-black">
      <img
        src={optimizeImageUrl(photo.url, { width: 400, quality: 70 })}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div
        className="absolute inset-x-0 bottom-0 px-3 pt-8 pb-2.5"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0))' }}
      >
        {photo.label && (
          <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wide truncate">{photo.label}</p>
        )}
        <p className="text-white text-sm leading-snug break-words">{truncateCaption(photo.caption)}</p>
      </div>
    </div>
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
  const [swipeDragX, setSwipeDragX] = useState(0);
  const [swipeDragY, setSwipeDragY] = useState(0);
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);
  const [swipeExitDirection, setSwipeExitDirection] = useState<'left' | 'right' | null>(null);
  const swipeCardElRef = useRef<HTMLDivElement>(null);
  const swipeIsDraggingRef = useRef(false);
  const swipeStartXRef = useRef(0);
  const swipeStartYRef = useRef(0);
  const swipeLatestDeltaXRef = useRef(0);
  const swipeLatestDeltaYRef = useRef(0);
  const swipeRafScheduledRef = useRef(false);
  const swipeRafIdRef = useRef<number | null>(null);
  // Discover's own threshold: whichever is smaller of 25% of the screen or a
  // flat 120px, so a swipe commits at a normal, easy drag distance on wide
  // screens/tablets instead of requiring a much longer drag.
  const SWIPE_THRESHOLD = () => Math.min(window.innerWidth * 0.25, 120);
  // Next-card backdrop reveal - fully hidden the entire drag (no matter how
  // far), only clearing once the swipe actually commits (swipeExitDirection
  // fires), same "hidden until it goes completely through" behavior as
  // Discover's own next-card peek.
  const NEXT_CARD_MAX_BLUR_PX = 12;
  const NEXT_CARD_MAX_DARK_OPACITY = 0.3;
  const nextCardRevealProgress = swipeExitDirection ? 1 : 0;

  const swipeDragStart = useCallback((x: number, y: number) => {
    if (!swipeEnabled || swipeExitDirection) return;
    swipeStartXRef.current = x;
    swipeStartYRef.current = y;
    swipeIsDraggingRef.current = true;
    setIsSwipeDragging(true);
  }, [swipeEnabled, swipeExitDirection]);

  const swipeDragMove = useCallback((x: number, y: number) => {
    if (!swipeIsDraggingRef.current) return;
    const deltaX = x - swipeStartXRef.current;
    const deltaY = y - swipeStartYRef.current;
    // The card follows the finger/cursor freely in both directions (a real
    // grab-and-move feel, matching Discover) - only the horizontal component
    // decides the like/pass direction and threshold.
    swipeLatestDeltaXRef.current = deltaX;
    swipeLatestDeltaYRef.current = deltaY;
    if (!swipeRafScheduledRef.current) {
      swipeRafScheduledRef.current = true;
      swipeRafIdRef.current = requestAnimationFrame(() => {
        swipeRafIdRef.current = null;
        if (!swipeIsDraggingRef.current) {
          swipeRafScheduledRef.current = false;
          return;
        }
        const d = swipeLatestDeltaXRef.current;
        const dy = swipeLatestDeltaYRef.current;
        if (swipeCardElRef.current) {
          swipeCardElRef.current.style.transform = `translate3d(${d}px, ${dy}px, 0) rotate(${d * 0.06}deg)`;
        }
        setSwipeDragX(d);
        setSwipeDragY(dy);
        swipeRafScheduledRef.current = false;
      });
    }
  }, []);

  const swipeDragEnd = useCallback((endX: number) => {
    if (!swipeIsDraggingRef.current) return;
    swipeIsDraggingRef.current = false;
    setIsSwipeDragging(false);
    const deltaX = endX - swipeStartXRef.current;
    swipeLatestDeltaXRef.current = 0;
    swipeLatestDeltaYRef.current = 0;
    if (swipeRafIdRef.current !== null) {
      cancelAnimationFrame(swipeRafIdRef.current);
      swipeRafIdRef.current = null;
    }
    swipeRafScheduledRef.current = false;

    if (Math.abs(deltaX) > SWIPE_THRESHOLD()) {
      const direction = deltaX > 0 ? 'right' : 'left';
      // Drive the fly-away straight on the element, same as Discover - the
      // card's live transform was written imperatively during the drag, so
      // relying on React's own style update alone can land a frame late and
      // spring back to center before vanishing instead of continuing off
      // in the thrown direction.
      if (swipeCardElRef.current) {
        const exitX = direction === 'right' ? window.innerWidth * 1.5 : -window.innerWidth * 1.5;
        const exitY = window.innerHeight * 0.3;
        const rotation = direction === 'right' ? 24 : -24;
        swipeCardElRef.current.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
        swipeCardElRef.current.style.transform = `translate3d(${exitX}px, ${exitY}px, 0) rotate(${rotation}deg)`;
      }
      setSwipeExitDirection(direction);
      setSwipeDragX(0);
      setSwipeDragY(0);
      setTimeout(() => {
        if (direction === 'right') {
          onLike?.();
        } else {
          onPass?.();
        }
      }, 400);
    } else {
      // Below threshold: spring back to center from wherever it was let go.
      if (swipeCardElRef.current) {
        swipeCardElRef.current.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
        swipeCardElRef.current.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
      }
      setSwipeDragX(0);
      setSwipeDragY(0);
    }
  }, [onLike, onPass]);

  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    if (!swipeEnabled) return;
    const touch = e.touches[0];
    swipeDragStart(touch.clientX, touch.clientY);
  }, [swipeEnabled, swipeDragStart]);

  const handleSwipeTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeIsDraggingRef.current) return;
    const touch = e.touches[0];
    swipeDragMove(touch.clientX, touch.clientY);
  }, [swipeDragMove]);

  const handleSwipeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeIsDraggingRef.current) return;
    const changedTouch = e.changedTouches && e.changedTouches[0];
    swipeDragEnd(changedTouch ? changedTouch.clientX : swipeStartXRef.current + swipeLatestDeltaXRef.current);
  }, [swipeDragEnd]);

  // Desktop/testing support - mouse doesn't keep bubbling to this element
  // once the cursor leaves it mid-drag, so move/up are attached to the
  // window for the duration of the drag, same as Discover's own
  // handleMouseDown.
  const handleSwipeMouseDown = useCallback((e: React.MouseEvent) => {
    if (!swipeEnabled) return;
    swipeDragStart(e.clientX, e.clientY);

    const onWindowMouseMove = (ev: MouseEvent) => {
      if (!swipeIsDraggingRef.current) return;
      swipeDragMove(ev.clientX, ev.clientY);
    };
    const onWindowMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      if (!swipeIsDraggingRef.current) return;
      swipeDragEnd(ev.clientX);
    };
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  }, [swipeEnabled, swipeDragStart, swipeDragMove, swipeDragEnd]);

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
            src={optimizeImageUrl(nextPreviewImageUrl, { width: 300, quality: 40 })}
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
        className="absolute inset-0 bg-black flex flex-col overflow-hidden select-none"
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
            ? `translate3d(${swipeExitDirection === 'right' ? window.innerWidth * 1.5 : -window.innerWidth * 1.5}px, ${window.innerHeight * 0.3}px, 0) rotate(${swipeExitDirection === 'right' ? 24 : -24}deg)`
            : swipeEnabled
              ? `translate3d(${swipeDragX}px, ${swipeDragY}px, 0) rotate(${swipeDragX * 0.06}deg)`
              : undefined,
          transition: isSwipeDragging
            ? 'border-radius 0.2s ease'
            : swipeExitDirection
              ? 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.3s ease'
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
          className={`relative w-full overflow-hidden select-none transition-all duration-300 ${showMoreInfo ? 'flex-1' : ''}`}
          style={{
            cursor: 'pointer',
            // 'none', not 'pan-y': the card now tracks the finger in both
            // X and Y for a real grab-and-move feel (matching Discover),
            // which would otherwise fight the browser's own native
            // vertical-pan handling for the same gesture.
            touchAction: swipeEnabled ? 'none' : undefined,
            ...(showMoreInfo
              ? {
                  // Expanded: a normal flex item sharing the column with the
                  // details panel below, capped so it can't blow past its share.
                  // 58% matches the details panel's own proportion, so both
                  // screens read the same split.
                  flex: '0 0 58%',
                  minHeight: '180px',
                  maxHeight: '58%',
                }
              : {
                  // Collapsed: absolutely positioned to the parent's exact box
                  // (inset 0) instead of a flex-grow child. flex-grow:1 fighting
                  // a simultaneously-transitioning flex-basis is exactly what
                  // made this shrink-then-grow on every toggle (a real,
                  // reported "goes all the way up and comes down" glitch) -
                  // grow and basis don't animate in lockstep, so the box
                  // visibly collapsed toward the transitioning basis before
                  // catching up. Matching Discover's own technique: this box
                  // is always exactly the size of its (already real-height)
                  // `relative` parent when collapsed, full stop, with nothing
                  // to fight mid-transition. On iOS Safari a flex-grow child
                  // can also lose a sizing fight to a tall photo's own
                  // intrinsic height regardless of flex-basis - absolute
                  // positioning removes that possibility entirely too.
                  position: 'absolute',
                  inset: 0,
                }),
          }}
          onTouchStart={handleSwipeTouchStart}
          onTouchMove={handleSwipeTouchMove}
          onTouchEnd={handleSwipeTouchEnd}
          onMouseDown={handleSwipeMouseDown}
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

          {/* Swipe direction hint - same red/green X and heart Discover/Liked Me use,
              fading in with drag distance. */}
          {swipeEnabled && swipeDragX !== 0 && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center w-16 h-16 rounded-full border-4 ${
                swipeDragX > 0 ? 'right-6 border-green-400 bg-green-500/20' : 'left-6 border-red-400 bg-red-500/20'
              }`}
              style={{ opacity: Math.min(1, Math.abs(swipeDragX) / SWIPE_THRESHOLD()) }}
            >
              {swipeDragX > 0 ? (
                <Heart className="w-8 h-8 text-green-400" />
              ) : (
                <XIcon className="w-8 h-8 text-red-400" />
              )}
            </div>
          )}

          {/* Back button - only when the caller wants one (Circle does; other
              callers rely on their own outer tab/nav to leave). */}
        {onBack && (
          <button
            onClick={(e) => { e.stopPropagation(); onBack(); }}
            aria-label="Back"
            className="absolute left-4 z-10 flex items-center justify-center w-9 h-9 rounded-full text-white bg-black/50 backdrop-blur-md border border-white/20 transition-transform active:scale-95"
            style={{ top: '4px' }}
          >
            <ArrowLeftIcon className="w-4 h-4" strokeWidth={2.5} />
          </button>
        )}

        {/* Active-filter pill - only during a Circle category browse. Sits
            below the cultural-sign glow's max height (which is also
            top-centered) so the two can never overlap on the rare profile
            that has both. */}
        {topLabel && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full text-white text-xs font-semibold bg-black/50 backdrop-blur-md border border-white/20"
            style={{ top: '76px' }}
          >
            {topLabel}
          </div>
        )}

        {slides.length > 1 && (
          <div className={`absolute ${onBack ? 'left-16' : 'left-4'} flex gap-1.5 z-10`} style={{ top: '14px' }}>
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

        {/* Cultural sign - same centered glow treatment as Discover's MatchCard.
            No portal needed here: unlike the swipe card, this photo area isn't
            inside a `position: fixed` ancestor, so a plain absolute overlay
            already paints above everything else on the page. */}
        {profile.adinkra_symbols && profile.adinkra_symbols.length > 0 && (
          <div className="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center" style={{ top: '4px' }}>
            <div className="relative w-16 h-16 flex items-center justify-center overflow-visible">
              <div className="relative z-10">
                <UserAdinkraDisplay adinkraSymbols={profile.adinkra_symbols} />
              </div>
            </div>
          </div>
        )}

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
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); setShowDiscardWarning(true); }}
                disabled={savingCrop}
                className="h-8 px-3 text-xs bg-white border-pink-500/30 text-black hover:bg-neutral-200 hover:text-black"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleSavePendingCrop(); }}
                disabled={savingCrop}
                className="h-8 px-3 text-xs bg-pink-600 hover:bg-pink-700 text-white"
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDiscardWarning(false)}
                  className="h-8 px-3 text-xs bg-white border-pink-500/30 text-black hover:bg-neutral-200 hover:text-black"
                >
                  Keep editing
                </Button>
                <Button
                  size="sm"
                  onClick={handleDiscardPendingCrop}
                  className="h-8 px-3 text-xs bg-pink-600 hover:bg-pink-700 text-white"
                >
                  Discard
                </Button>
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
            background: 'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.94) 58%, rgba(0,0,0,1) 70%)',
          }}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 leading-tight">
                <h2 className="text-[clamp(15px,4.4vw,18px)] font-bold text-white">
                  {profile.first_name} {profile.last_name}, {calculateAge(profile.date_of_birth)}
                </h2>
                {showVerifiedBadge && (
                  <img
                    loading="lazy"
                    decoding="async"
                    src="/images/verified.svg"
                    alt="Verified profile"
                    title="Verified profile"
                    className="w-[clamp(18px,5vw,24px)] h-[clamp(18px,5vw,24px)]"
                    aria-hidden="false"
                  />
                )}
              </div>
              {/* Location and "looking for" alternate by photo, one at a time, matching
                  Discover's MatchCard - falls back to whichever exists if only one is set. */}
              {!showMoreInfo && (() => {
                const hasLocation = !!profile.city;
                const hasIntent = !!profile.relationship_intent;
                const showLocation = hasLocation && (!hasIntent || currentSlide % 2 === 0);
                // Never alongside About - a bio excerpt already speaks for the
                // person, so pairing it with "looking for" felt redundant.
                const showIntent = !showAbout && hasIntent && (!hasLocation || currentSlide % 2 === 1);

                return (
                  <>
                    {showLocation && (
                      <div className="flex items-center text-[clamp(12px,3.4vw,14px)] text-white/80">
                        <MapPin className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                        <span>
                          {profile.city}, {profile.country}
                          {typeof profile.height_cm === 'number' && profile.height_cm > 0 && (
                            <span className="ml-2">• {formatHeightLabel(profile.height_cm)}</span>
                          )}
                        </span>
                      </div>
                    )}
                    {showIntent && (
                      <div className="flex items-center text-[clamp(11px,3.2vw,13px)] font-medium text-white/80">
                        <Heart className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                        <span>{formatRelationshipIntent(profile.relationship_intent)}</span>
                      </div>
                    )}
                  </>
                );
              })()}

              {!showMoreInfo && showAbout ? (
                <p className="mt-2 pr-8 text-[clamp(11px,3.2vw,13px)] text-white/85 line-clamp-2">
                  {profile.bio}
                </p>
              ) : (
                !showMoreInfo && (previewHighlights.length > 0 || signHighlight || musicHighlight) && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2 pr-8">
                    {previewHighlights.map((highlight, index) => (
                      <span
                        key={index}
                        className={`text-[clamp(9px,2.8vw,12px)] font-medium text-white/85 bg-white/10 border ${HIGHLIGHT_CHIP_BORDER_COLORS[index % HIGHLIGHT_CHIP_BORDER_COLORS.length]} px-2 py-0.5 rounded-full truncate max-w-[100px] min-[400px]:max-w-[140px] shrink-0`}
                      >
                        {truncateChipLabel(highlight)}
                      </span>
                    ))}
                    {signHighlight && (
                      <span className="flex items-center justify-center bg-yellow-400/10 border border-yellow-400/60 rounded-full w-8 h-8 shrink-0">
                        <UserAdinkraDisplay adinkraSymbols={[signHighlight]} />
                      </span>
                    )}
                    {musicHighlight?.link && (
                      <MusicLinkBadge link={musicHighlight.link} label={formatFavoriteLabel(musicHighlight)} />
                    )}
                  </div>
                )
              )}
            </div>

            {/* Expandable info button - same style/behavior as Discover's MatchCard toggle.
                Stops propagation: the photo area now also has its own onClick for
                tap-to-navigate-slides, and without this, tapping this button would
                ALSO advance/rewind a slide underneath it. */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowMoreInfo(prev => !prev); }}
              className="flex items-center justify-center text-white rounded-full transition-colors duration-200 shrink-0 backdrop-blur-md -mt-1.5"
              style={{
                width: 30,
                height: 30,
                minWidth: 30,
                minHeight: 30,
                padding: 0,
                background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
                boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
              }}
              aria-label={showMoreInfo ? t('discover.matchCard.hideDetails', 'Hide details') : t('discover.matchCard.showDetails', 'Show details')}
            >
              {showMoreInfo ? (
                <ArrowUp size={15} style={{ width: 15, height: 15 }} strokeWidth={2.5} />
              ) : (
                <ArrowDown size={15} style={{ width: 15, height: 15 }} strokeWidth={2.5} />
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
          className="bg-black px-4 pt-1 space-y-3 flex-1 overflow-y-auto scrollbar-hide"
          style={{
            paddingBottom: '10px',
            WebkitOverflowScrolling: 'touch',
            // Overlaps the photo box by a hair to paper over the subpixel seam
            // that shows up between the gradient's solid-black bottom edge and
            // this panel's own bg-black - rounding on the photo's percentage
            // (vh) height can leave a sliver exposing whatever's behind it.
            marginTop: '-2px',
          }}
        >
          {profile.relationship_intent && (
            <div className="flex items-center text-xs text-white/80">
              <Heart className="w-3 h-3 mr-1" />
              <span>{formatRelationshipIntent(profile.relationship_intent)}</span>
            </div>
          )}
          {profile.bio && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-1">{t('discover.matchCard.about')}</h4>
              <p className="text-white text-sm leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {/* First captioned photo (ImageManagement.tsx) - no section heading, just
              the photo, its preset label (what it's about), and the full caption
              (capped at 50 chars) pinned to the image's own bottom edge. */}
          {captionedPhotos[0] && renderPhotoCaptionCard(captionedPhotos[0])}

          {typeof profile.height_cm === 'number' && profile.height_cm > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.height', 'Height')}</h4>
              <div className="flex items-center text-sm">
                <Ruler className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                <span className="text-white">{formatHeightLabel(profile.height_cm)}</span>
              </div>
            </div>
          )}

          {hasLifestyle && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.lifestyle')}</h4>
              <div className="space-y-2">
                {profile.smoking && profile.smoking !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="mr-2 flex-shrink-0" aria-hidden="true">🚬</span>
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.smoking')}:</span>
                    <span className="text-white">{profile.smoking}</span>
                  </div>
                )}
                {profile.drinking && profile.drinking !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="mr-2 flex-shrink-0" aria-hidden="true">🍸</span>
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.drinking')}:</span>
                    <span className="text-white">{profile.drinking}</span>
                  </div>
                )}
                {profile.exercise_level && profile.exercise_level !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="mr-2 flex-shrink-0" aria-hidden="true">🏋️</span>
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.exercise')}:</span>
                    <span className="text-white">{profile.exercise_level}</span>
                  </div>
                )}
                {profile.sleeping_schedule && profile.sleeping_schedule !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="mr-2 flex-shrink-0" aria-hidden="true">😴</span>
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.sleep')}:</span>
                    <span className="text-white">{profile.sleeping_schedule}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {secondPhotoAnchor === 'lifestyle' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

          {profile.family_plans && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.familyPlans', 'Family Plans')}</h4>
              <div className="flex items-center text-sm">
                <Baby className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                <span className="text-white">{traitLabel(FAMILY_PLANS_OPTIONS, profile.family_plans)}</span>
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
                    <span className="text-white">{profile.occupation}</span>
                  </div>
                )}
                {profile.education_level && (
                  <div className="flex items-center text-sm">
                    <GraduationCap className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                    <span className="text-white">{profile.education_level}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {secondPhotoAnchor === 'workEducation' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

          {(typeof profile.introvert_extrovert === 'number' || typeof profile.spontaneous_planner === 'number' || typeof profile.messy_organized === 'number') && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-3">{t('discover.matchCard.personality')}</h4>
              <div className="space-y-4">
                {typeof profile.introvert_extrovert === 'number' && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-white/60">{t('discover.matchCard.introvert')}</span>
                    <div className="flex-1 bg-white/10 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${profile.introvert_extrovert}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-white/60">{t('discover.matchCard.extrovert')}</span>
                  </div>
                )}
                {typeof profile.spontaneous_planner === 'number' && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-white/80">{t('discover.matchCard.spontaneousVsPlanner', { percentage: profile.spontaneous_planner })}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-white/60">{t('discover.matchCard.spontaneous')}</span>
                      <div className="flex-1 bg-white/10 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${profile.spontaneous_planner}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-white/60">{t('discover.matchCard.planner')}</span>
                    </div>
                  </div>
                )}
                {typeof profile.messy_organized === 'number' && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-white/80">{t('discover.matchCard.messyVsOrganized', { percentage: profile.messy_organized })}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-white/60">{t('discover.matchCard.messy')}</span>
                      <div className="flex-1 bg-white/10 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${profile.messy_organized}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-white/60">{t('discover.matchCard.organized')}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {secondPhotoAnchor === 'personality' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

          {profile.communication_style && profile.communication_style.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-pink-500" />
                {t('discover.matchCard.communicationStyle', 'Communication Style')}
              </h4>
              <div className="flex flex-wrap gap-1">
                {profile.communication_style.map((value, index) => (
                  <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                    {traitLabel(COMMUNICATION_STYLE_OPTIONS, value)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {secondPhotoAnchor === 'communicationStyle' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

          {profile.love_style && profile.love_style.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-pink-500" />
                {t('discover.matchCard.loveStyle', 'Love Style')}
              </h4>
              <div className="flex flex-wrap gap-1">
                {profile.love_style.map((value, index) => (
                  <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                    {traitLabel(LOVE_STYLE_OPTIONS, value)}
                  </span>
                ))}
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

          {profile.favorites && profile.favorites.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.favorites')}</h4>
              <div className="flex flex-wrap gap-1.5">
                {profile.favorites.map((favorite, index) => (
                  <span key={index} className="inline-flex items-center gap-1 h-6 leading-none px-2 py-0 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-xs">
                    <span className="text-[11px] leading-none">{favoriteEmoji(favorite.category)}</span>
                    <span className="leading-none">{formatFavoriteLabel(favorite)}</span>
                    {favorite.link && (
                      <MusicLinkBadge link={favorite.link} label={formatFavoriteLabel(favorite)} variant="inline" />
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.pets && profile.pets.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                <PawPrint className="w-3.5 h-3.5 text-pink-500" />
                {t('discover.matchCard.pets', 'Pets')}
              </h4>
              <div className="flex flex-wrap gap-1">
                {profile.pets.map((value, index) => (
                  <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                    {traitLabel(PETS_OPTIONS, value)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.languages && profile.languages.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.languagesSpoken', 'Languages')}</h4>
              <div className="flex flex-wrap gap-1">
                {profile.languages.map((lang, index) => (
                  <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.social_media && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.socialMedia', 'Social Media')}</h4>
              <div className="flex items-center text-sm">
                <Share2 className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                <span className="text-white">{traitLabel(SOCIAL_MEDIA_OPTIONS, profile.social_media)}</span>
              </div>
            </div>
          )}

          {preferredLanguageName && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.language')}</h4>
              <div className="flex items-center text-sm">
                <Languages className="w-3.5 h-3.5 mr-2 text-pink-500 shrink-0" />
                <span className="text-white">{preferredLanguageName}</span>
              </div>
            </div>
          )}
        </div>
      )}
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
