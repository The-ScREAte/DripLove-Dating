import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import ReportButton from '../ReportButton';
import UserAdinkraDisplay from './UserAdinkraDisplay';
import ReportModal from '../modals/ReportModal';
import styles from './MatchCard.module.css';
import { MapPin, Briefcase, GraduationCap, Calendar, Crown, Shield, ArrowDown, ArrowUp, User, Languages, Heart, Ruler, Baby, MessageCircle, Gift, PawPrint, Share2 } from 'lucide-react';
import { PotentialMatch } from '@/types';
import { useTranslation } from 'react-i18next';
import { getLanguageName } from '@/utils/languageNames';
import { supabase } from '@/integrations/supabase/client';
import { buildSlides, getUserColorHash, getPreviewHighlights, HIGHLIGHT_CHIP_BORDER_COLORS, truncateChipLabel, seedFromString, mulberry32 } from './MatchCardHelpers';
import { SlideRenderer } from './SlideRenderer';
import { optimizeImageUrl } from '@/utils/imageOptimizer';
import { favoriteEmoji, formatFavoriteLabel, findFavoriteWithLink } from '@/constants/favorites';
import { calculateProfileCompletion } from '@/utils/profileCompletion';
import MusicLinkBadge from './MusicLinkBadge';
import {
  FAMILY_PLANS_OPTIONS,
  COMMUNICATION_STYLE_OPTIONS,
  LOVE_STYLE_OPTIONS,
  PETS_OPTIONS,
  SOCIAL_MEDIA_OPTIONS,
  traitLabel,
} from '@/constants/profileTraits';

// Supabase/Postgrest errors are plain objects, not real Error instances, so
// `err instanceof Error` misses them and silently falls back to a generic
// message - masking the actual reason a query failed (RLS denial, a unique
// constraint, etc.) right when it's most useful to see it.
const getSupabaseErrorMessage = (err: unknown): string | undefined => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return undefined;
};

const formatHeightLabel = (cm: number) => {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}" (${cm} cm)`;
};

// Where the second captioned photo call-out can land in the expanded details
// panel - always above Personality. Module-level (not per-render) since it's
// a fixed constant, not something that needs recreating on every render.
const PHOTO_ANCHORS = ['lifestyle', 'workEducation'] as const;

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
  getOptimizedUrl = (url: string) => optimizeImageUrl(url, { width: 1080, quality: 82 }),
  preCalculatedDistance
  , imageStatus
  , isActiveTab = true
  , onReportModalOpenChange
  , currentUserAdinkraSymbols
  , onUserBlocked
}) => {
  const { t } = useTranslation();

  const toTitleCase = (value?: string | null) => {
    if (!value) return '';
    return value
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatRelationshipIntent = (intent?: string | null) => {
    if (!intent) return '';
    if (intent === 'serious') return 'Looking for something serious';
    if (intent === 'open_to_anything') return 'Open to anything';

    const normalized = intent.replace(/_/g, ' ').toLowerCase();
    return `Looking for ${normalized}`;
  };

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
  const slides = useMemo(() => buildSlides(stableMatch, memoUserImages), [stableMatch, memoUserImages]);
  const previewHighlights = useMemo(
    () => getPreviewHighlights(stableMatch, currentSlide),
    [stableMatch, currentSlide]
  );

  // Up to 2 of this profile's photos that have a caption set (ImageManagement.tsx),
  // picked once via a seeded shuffle so the same 1-2 photos surface consistently
  // for this profile rather than a different random pick every render.
  const captionedPhotos = useMemo(() => {
    const entries = Object.entries(match.imageCaptions || {})
      .filter(([, v]) => v?.caption)
      .map(([url, v]) => ({ url, caption: v!.caption as string, label: v!.label || null }));
    if (entries.length === 0) return [];
    const seed = seedFromString(`${match.id || match.first_name || ''}_photocaption`);
    const rand = mulberry32(seed);
    const shuffled = [...entries];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 2);
  }, [match.imageCaptions, match.id, match.first_name]);

  // Both captioned photos show in the expanded panel, but scattered rather
  // than back-to-back: the first sits right after About, and the second
  // lands after a randomly chosen later section (seeded per profile, so it's
  // consistent rather than jumping around on every re-render).
  const secondPhotoAnchor = useMemo(() => {
    if (captionedPhotos.length < 2) return null;
    const seed = seedFromString(`${match.id || match.first_name || ''}_photo2anchor`);
    const rand = mulberry32(seed);
    return PHOTO_ANCHORS[Math.floor(rand() * PHOTO_ANCHORS.length)];
  }, [captionedPhotos.length, match.id, match.first_name]);

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

  // Same "earned" verified badge shown on the user's own profile page (>=85%
  // profile completion) - not the face-verification `isVerified` prop, which
  // tracks something different.
  const showVerifiedBadge = useMemo(
    () => calculateProfileCompletion(stableMatch, memoUserImages).showVerifiedBadge,
    [stableMatch, memoUserImages]
  );

  // One cultural sign to surface as its own chip, cycling through ALL of this
  // profile's signs (not just the first) as the user taps through photos -
  // shared signs with the current user are moved to the front so the first
  // photo leads with common ground, then the rest of the profile's own signs
  // follow in order across later photos.
  const signHighlight = useMemo(() => {
    const theirs = stableMatch.adinkra_symbols;
    if (!theirs || theirs.length === 0) return null;
    const mine = currentUserAdinkraSymbols || [];
    const shared = theirs.filter(symbol => mine.includes(symbol));
    const rest = theirs.filter(symbol => !mine.includes(symbol));
    const ordered = [...shared, ...rest];
    return ordered[currentSlide % ordered.length];
  }, [stableMatch, currentUserAdinkraSymbols, currentSlide]);

  // A favorite carrying a share link (e.g. a music track/album) surfaces as
  // its own circular badge in the compact preview row, mirroring signHighlight.
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
  const getSwipeTransform = () => {
    if (!swipeDirection) return 'translateX(0) rotate(0deg)';

    const rotation = swipeDistance * 0.1;
    const maxRotation = 15;
    const clampedRotation = Math.min(Math.max(rotation, -maxRotation), maxRotation);

    return `translateX(${swipeDistance}px) rotate(${clampedRotation}deg)`;
  };

  const getSwipeColor = () => {
    if (!swipeDirection) return '';
    if (swipeDirection === 'right') return 'rgba(34, 197, 94, 0.8)';
    return 'rgba(239, 68, 68, 0.8)';
  };

  // Report image modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [isBlockSuccess, setIsBlockSuccess] = useState(false);
  // The block row is already live in the DB the moment it's inserted - this
  // just tracks it so a same-spot "Undo" can delete that exact row within
  // the confirmation window, before the deck is told to move on.
  const [lastBlockedUserId, setLastBlockedUserId] = useState<string | null>(null);
  const [isUndoingBlock, setIsUndoingBlock] = useState(false);
  const blockCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportReasons = [
    t('reportModal.reasons.inappropriate'),
    t('reportModal.reasons.fake'),
    t('reportModal.reasons.spam'),
    t('reportModal.reasons.offensive'),
    t('reportModal.reasons.harassment'),
    t('reportModal.reasons.other')
  ];

  const reasonStyles = [
    {
      selected: 'border-rose-500 bg-rose-950/50 text-rose-300 ring-1 ring-rose-500/30',
      badge: 'bg-rose-500/20 text-rose-300'
    },
    {
      selected: 'border-orange-500 bg-orange-950/50 text-orange-300 ring-1 ring-orange-500/30',
      badge: 'bg-orange-500/20 text-orange-300'
    },
    {
      selected: 'border-amber-500 bg-amber-950/50 text-amber-300 ring-1 ring-amber-500/30',
      badge: 'bg-amber-500/20 text-amber-300'
    },
    {
      selected: 'border-fuchsia-500 bg-fuchsia-950/50 text-fuchsia-300 ring-1 ring-fuchsia-500/30',
      badge: 'bg-fuchsia-500/20 text-fuchsia-300'
    },
    {
      selected: 'border-red-500 bg-red-950/50 text-red-300 ring-1 ring-red-500/30',
      badge: 'bg-red-500/20 text-red-300'
    },
    {
      selected: 'border-slate-400 bg-slate-800/60 text-slate-200 ring-1 ring-slate-500/30',
      badge: 'bg-slate-500/20 text-slate-200'
    }
  ];

  // Prevent body scrolling when modal is open
  useEffect(() => {
    const originalCssText = document.body.style.cssText;
    if (showReportModal) {
      // Prevent scrolling when modal is open (single write for performance)
      document.body.style.cssText = 'overflow: hidden; position: fixed; width: 100%';
    } else {
      // Re-enable scrolling when modal is closed
      document.body.style.cssText = originalCssText;
    }

    // Cleanup function to restore scrolling
    return () => {
      document.body.style.cssText = originalCssText;
    };
  }, [showReportModal]);

  // Tell the parent (DiscoverPage) so it can suspend the swipe/drag gesture while this is open —
  // otherwise dragging the card underneath also drags the modal along with it.
  useEffect(() => {
    onReportModalOpenChange?.(showReportModal);
    return () => {
      onReportModalOpenChange?.(false);
    };
  }, [showReportModal, onReportModalOpenChange]);

  // Handle report submit
  const handleReportImage = async () => {
    if (!selectedReason) {
      setReportError(t('reportModal.selectReason'));
      return;
    }

    setReporting(true);
    setReportError("");
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const imageUrl = slides[currentSlide]?.content;
      if (!imageUrl || !match.id) throw new Error("Missing image or user");

      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Insert into reported_images table
      const { error } = await supabase.from("reported_images").insert({
        reporter_id: user.id,
        reported_user_id: match.id,
        image_url: imageUrl,
        status: "pending",
        reason: selectedReason
      });
      if (error) throw error;
      setReportSuccess(true);
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccess(false);
        setSelectedReason("");
      }, 1500);
    } catch (err: unknown) {
      setReportError(getSupabaseErrorMessage(err) || t('reportModal.error'));
    } finally {
      setReporting(false);
    }
  };

  // Reset modal state when closing. Closing early while a block is still in
  // its undo window (see handleBlockUser) finalizes it right away instead of
  // leaving a timer running after the modal's already gone.
  const closeReportModal = () => {
    if (blockCommitTimerRef.current) {
      clearTimeout(blockCommitTimerRef.current);
      blockCommitTimerRef.current = null;
      if (isBlockSuccess) {
        onUserBlocked?.(match.id);
      }
    }
    setShowReportModal(false);
    setSelectedReason("");
    setReportError("");
    setBlockReason("");
    setIsBlockSuccess(false);
    setLastBlockedUserId(null);
  };

  // Handle block user - requires a reason picked above or a note typed here
  // (also enforced by the Block button's disabled state; checked again here
  // as defense in depth) so nobody can one-tap block with zero context.
  // The block itself is written immediately - it's real and enforced right
  // away - but telling the parent deck to move past this profile is
  // deferred a few seconds so the "Undo" button below can delete the row
  // again first if this was a mistake.
  const handleBlockUser = async () => {
    if (!match.id) return;
    if (!selectedReason && !blockReason.trim()) {
      setReportError(t('reportModal.selectReason'));
      return;
    }

    setIsBlocking(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");

      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Insert block record - plain insert, no .select() chained after it.
      // blocker_id+blocked_id is already unique, so Undo can delete by that
      // pair directly without needing the row's own id back from the insert.
      const { error } = await supabase
        .from('blocks')
        .insert({
          blocker_id: user.id,
          blocked_id: match.id,
          reason: blockReason.trim() || selectedReason || null
        });

      // A duplicate-key conflict (23505) means this person is already
      // blocked from an earlier attempt - the end state the user wants is
      // already true, so treat it as success instead of surfacing a raw DB
      // constraint error for something that isn't actually a failure.
      const isAlreadyBlocked = (error as { code?: string } | null)?.code === '23505';
      if (error && !isAlreadyBlocked) throw error;

      setLastBlockedUserId(match.id);
      setIsBlockSuccess(true);
      const blockedUserId = match.id;
      blockCommitTimerRef.current = setTimeout(() => {
        blockCommitTimerRef.current = null;
        setShowReportModal(false);
        setReportSuccess(false);
        setIsBlockSuccess(false);
        setSelectedReason("");
        setBlockReason("");
        setLastBlockedUserId(null);
        onUserBlocked?.(blockedUserId);
      }, 5000); // Undo window - give real time to notice and react
    } catch (err: unknown) {
      setReportError(getSupabaseErrorMessage(err) || "Failed to block user");
    } finally {
      setIsBlocking(false);
    }
  };

  // Reverse a block made by mistake, while still inside the undo window.
  const handleUndoBlock = async () => {
    if (blockCommitTimerRef.current) {
      clearTimeout(blockCommitTimerRef.current);
      blockCommitTimerRef.current = null;
    }
    setIsUndoingBlock(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      if (user && lastBlockedUserId) {
        const { error } = await supabase
          .from('blocks')
          .delete()
          .eq('blocker_id', user.id)
          .eq('blocked_id', lastBlockedUserId);
        if (error) throw error;
      }
      setShowReportModal(false);
      setIsBlockSuccess(false);
      setSelectedReason("");
      setBlockReason("");
      setLastBlockedUserId(null);
      // Deliberately no onUserBlocked() call - the deck is untouched, exactly
      // as if the block had never happened.
    } catch (err: unknown) {
      setReportError(getSupabaseErrorMessage(err) || "Failed to undo block");
    } finally {
      setIsUndoingBlock(false);
    }
  };

  // Clear any pending block-commit timer if the card unmounts mid-window
  // (e.g. the deck advances for an unrelated reason) so it can't fire
  // against a profile that's no longer the one showing.
  useEffect(() => {
    return () => {
      if (blockCommitTimerRef.current) {
        clearTimeout(blockCommitTimerRef.current);
        blockCommitTimerRef.current = null;
      }
    };
  }, []);

  // Handle split rendering modes
  if (isSwipeAreaOnly) {
    // Render only the swipeable image area
    return (
  <div ref={containerRef} className="relative w-full h-full min-h-full overflow-hidden">
        {/* Image/Bio Container - Swipeable Area Only */}
        <div className="relative w-full h-full overflow-hidden" onClick={handleSlideClick}>
          {/* Current slide content */}
          {slides && slides.length > 0 && (
            <div className="w-full h-full transition-all duration-300 ease-in-out">
              {/* Report button for image slides - positioned closer to top edge.
                  Same stacking-context ceiling as the sign display/slide dots below — portaled
                  out so it can render above the global header instead of underneath it. */}
              {isActiveTab && slides[currentSlide]?.type === 'image' && createPortal(
                <div
                  className="fixed right-3 z-[9999]"
                  style={{
                    // The header is now a real flex sibling of the content area (not an
                    // overlay the card sits behind), so this only needs to clear the
                    // header's own real height plus a small breathing gap - not also
                    // re-adding a safe-area allowance the header already accounts for
                    // internally, and not the old flat pixel guess from when the card
                    // rendered directly behind a position: fixed header.
                    top: 'calc(var(--app-header-height, 72px) + 6px)'
                  }}
                >
                  <button
                    className={styles.reportButton}
                    onClick={e => { e.stopPropagation(); setShowReportModal(true); }}
                    aria-label="Report image"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>,
                document.body
              )}

              {/* Optimized cultural sign glow effect.
                  Portaled straight to document.body: `discover-container` is `position: fixed`
                  which — regardless of its own z-index — always establishes its own stacking
                  context, so no z-index on anything inside it can ever paint above a sibling
                  like the global header that has an explicit z-index. Portaling out is the only
                  way for this to actually render above the header. */}
              {isActiveTab && stableMatch.adinkra_symbols && stableMatch.adinkra_symbols.length > 0 && createPortal(
                <div
                  className="fixed left-1/2 transform -translate-x-1/2 z-[9999]"
                  style={{
                    // Same reasoning as the report button above - clears the header's
                    // real height plus a small gap, not a stale pixel guess from when
                    // the header overlaid the card instead of sitting above it in flow.
                    top: 'calc(var(--app-header-height, 72px) + 4px)'
                  }}
                >
                  <div className="relative flex flex-col items-center">
                    <div className="relative w-12 h-12 flex items-center justify-center overflow-visible">
                      {/* Adinkra Symbol */}
                      <div className="relative z-10">
                        <UserAdinkraDisplay adinkraSymbols={stableMatch.adinkra_symbols} />
                      </div>
                    </div>
                  </div>
                </div>,
                document.body
              )}
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
          {/* Same stacking-context ceiling as the sign display above — portaled out so the
              slide dots can render above the global header instead of underneath it. */}
          {isActiveTab && slides && slides.length > 1 && createPortal(
            <div
              className="fixed left-4 flex space-x-2 z-[9999]"
              style={{
                // Same reasoning as the report button above - clears the header's real
                // height plus a small gap, not a stale pixel guess.
                top: 'calc(var(--app-header-height, 72px) + 8px)',
                pointerEvents: 'none'
              }}
            >
              {slides.map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-2 rounded-full transition-all duration-300 ${
                    index === currentSlide
                      ? 'bg-white shadow-lg border border-pink-300'
                      : 'bg-white/30 border border-pink-300/80'
                  }`}
                />
              ))}
            </div>,
            document.body
          )}

          {/* Cultural sign is shown in the top-center */}

          {/* Name/age caption - pinned to the bottom of the photo with a feathered
              gradient, same pattern as ProfilePreviewModal's caption (an ordinary
              overlay clipped by the photo's own overflow-hidden, no transform/
              negative-margin tricks). Not portaled: unlike the report button/sign/
              dots above, this only needs to sit above the photo, not above the
              global header. */}
          <div
            className={`absolute inset-x-0 z-20 px-4 pt-16 ${showMoreInfo ? 'pb-2' : 'pb-5'}`}
            style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.94) 58%, rgba(0,0,0,1) 70%)',
              // Photo box now stops above the nav on its own (see DiscoverPage.tsx's
              // discover-container), so bottom:0 already lands right at the photo's
              // own bottom edge, just above the nav - no extra offset needed.
              bottom: 0,
            }}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 leading-tight">
                  <h2 className="text-[clamp(15px,4.4vw,18px)] font-bold text-white">
                    {toTitleCase(match.first_name)} {toTitleCase(match.last_name)}, {calculateAge(match.date_of_birth)}
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

                {/* Location and "looking for" alternate by photo, one at a time, instead
                    of always stacking both - keeps the collapsed card from feeling static
                    as the highlight chips below it are already rotating per photo. Falls
                    back to whichever one exists if only one of the two is available. */}
                {(() => {
                  const hasLocation = !!match.city;
                  const hasIntent = !!match.relationship_intent;
                  const showLocation = hasLocation && (!hasIntent || currentSlide % 2 === 0);
                  // Never alongside About - a bio excerpt already speaks for the
                  // person, so pairing it with "looking for" felt redundant.
                  const showIntent = !showAbout && hasIntent && (!hasLocation || currentSlide % 2 === 1);

                  return (
                    <>
                      {showLocation && (
                        <div className="flex items-center text-[clamp(12px,3.4vw,14px)] text-gray-300">
                          <MapPin className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                          <span>
                            {match.city}, {match.country}
                            {match.distance !== undefined && match.distance < 999 ? (
                              <span className="ml-2">• {Math.max(1, Math.round(match.distance))} km away</span>
                            ) : preCalculatedDistance !== undefined && preCalculatedDistance < 999 ? (
                              <span className="ml-2">• {Math.max(1, Math.round(preCalculatedDistance))} km away</span>
                            ) : (currentUserLatitude && currentUserLongitude && match.latitude && match.longitude && (
                              <span className="ml-2">
                                • {Math.max(1, Math.round(calculateDistance(
                                  currentUserLatitude,
                                  currentUserLongitude,
                                  match.latitude,
                                  match.longitude
                                )))} km away
                              </span>
                            ))}
                            {typeof match.height_cm === 'number' && match.height_cm > 0 && (
                              <span className="ml-2">• {formatHeightLabel(match.height_cm)}</span>
                            )}
                          </span>
                        </div>
                      )}

                      {showIntent && (
                        <div className="flex items-center mt-2 text-[clamp(11px,3.2vw,13px)] font-medium text-gray-300">
                          <Heart className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                          <span>{formatRelationshipIntent(match.relationship_intent)}</span>
                        </div>
                      )}
                    </>
                  );
                })()}

                {!showMoreInfo && showAbout ? (
                  <p className="mt-2 pr-8 text-[clamp(11px,3.2vw,13px)] text-white/85 line-clamp-2">
                    {stableMatch.bio}
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
                        <span className="flex items-center justify-center bg-yellow-400/10 border border-yellow-400/60 rounded-full w-6 h-6 shrink-0">
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

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleInfo();
                }}
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
                aria-label={showMoreInfo ? "Hide details" : "Show details"}
              >
                {showMoreInfo ? (
                  <ArrowUp size={15} style={{ width: 15, height: 15 }} strokeWidth={2.5} />
                ) : (
                  <ArrowDown size={15} style={{ width: 15, height: 15 }} strokeWidth={2.5} />
                )}
              </button>
            </div>
          </div>

          {/* Report Modal.
              Portaled to document.body: this lives inside the swipe card, which gets a live
              translate/rotate transform while dragging. A transformed ancestor becomes the
              containing block for `position: fixed` descendants, so without portaling out the
              modal would drag and rotate along with the card instead of staying centered and
              still in the viewport. */}
          {showReportModal && createPortal(
            <>
              <div
                className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 touch-none select-none"
                onClick={closeReportModal}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 9999,
                  willChange: 'auto',
                  backfaceVisibility: 'hidden',
                  transform: 'translateZ(0)',
                  pointerEvents: 'auto',
                  touchAction: 'none',
                  userSelect: 'none'
                }}
              >
                <div
                  className="bg-black rounded-2xl shadow-2xl border border-pink-500/30 w-full max-w-sm mx-auto flex flex-col"
                  onClick={e => e.stopPropagation()}
                  style={{
                    maxHeight: '85vh',
                    width: '100%',
                    maxWidth: '400px',
                    overflow: 'hidden',
                    willChange: 'auto',
                    backfaceVisibility: 'hidden'
                  }}
                >
                  {/* Modal header with close button */}
                  <div className="relative px-3 pt-3 pb-2 border-b border-pink-500/20 bg-black shrink-0">
                    <button
                      onClick={closeReportModal}
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white transition-colors rounded-full bg-white/10 border border-pink-500/20 hover:bg-white/20"
                      disabled={reporting}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>

                    <div className="pr-8">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-rose-400 font-semibold">Safety Center</p>
                      <h3 className="text-base font-bold text-white mt-0.5">{t('reportModal.title')}</h3>
                      <p className="text-[11px] text-gray-300 mt-0.5">{t('reportModal.instruction')}</p>
                    </div>
                  </div>

                  {/* Modal content — flex-1 + min-h-0 so this always fills the remaining space
                      up to the card's own maxHeight and reliably scrolls instead of relying on a
                      guessed fixed max-height. */}
                  <div
                    className="px-3 pb-3 pt-2 overflow-y-auto flex-1 min-h-0"
                    style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                  >
                    {isBlockSuccess ? (
                      <div className="text-center py-6">
                        <div className="text-green-400 font-semibold">
                          <div className="mb-2 text-3xl">🚫</div>
                          <div className="text-lg mb-2">{t('reportModal.blockSuccess.title')}</div>
                          <div className="text-sm text-gray-300">{t('reportModal.blockSuccess.message')}</div>
                        </div>
                        <button
                          className="mt-4 h-9 px-5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm rounded-lg border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                          onClick={handleUndoBlock}
                          disabled={isUndoingBlock}
                        >
                          {isUndoingBlock ? t('reportModal.blockSuccess.undoing') : t('reportModal.blockSuccess.undo')}
                        </button>
                      </div>
                    ) : reportSuccess ? (
                      <div className="text-green-400 font-semibold text-center py-8">
                        <div className="mb-2 text-2xl">✓</div>
                        <div>{t('reportModal.success')}</div>
                      </div>
                    ) : (
                      <>
                        {/* Reason selection with stable layout */}
                        <div className="grid grid-cols-2 gap-1.5 mb-3">
                          {reportReasons.map((reason, index) => {
                            const tone = reasonStyles[index % reasonStyles.length];
                            return (
                            <button
                              key={reason}
                              onClick={() => setSelectedReason(reason)}
                              disabled={reporting || isBlocking}
                              className={`w-full min-h-9 px-2.5 py-1.5 text-left rounded-lg border-2 transition-all duration-200 flex items-center justify-between ${
                                selectedReason === reason
                                  ? tone.selected
                                  : 'border-pink-500/20 bg-black/60 text-gray-200 hover:border-pink-500/40 hover:bg-white/5'
                              } ${(reporting || isBlocking) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <span className="text-xs sm:text-sm font-semibold leading-tight flex-1 pr-1">{reason}</span>
                              {selectedReason === reason && (
                                <svg className="w-4 h-4 text-current flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                            );
                          })}
                        </div>

                        {/* Block section - just the optional note now; the actual
                            action moved down to sit next to Report (below) so
                            there's one clear pair of outcomes instead of three
                            competing buttons. */}
                        <div className="mb-3 p-2.5 bg-black/60 rounded-lg border border-pink-500/20">
                          <p className="text-gray-200 mb-1.5 text-xs font-semibold uppercase tracking-wide">{t('reportModal.blockSection.title')}</p>
                          <textarea
                            placeholder={t('reportModal.blockSection.placeholder')}
                            value={blockReason}
                            onChange={(e) => setBlockReason(e.target.value)}
                            disabled={reporting || isBlocking}
                            className="w-full p-2 bg-black/40 border border-pink-500/30 text-white placeholder:text-gray-500 rounded-lg text-xs resize-none focus:ring-2 focus:ring-pink-500/40 focus:border-pink-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                            rows={2}
                          />
                        </div>

                        {/* Action buttons with stable height */}
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            className="w-full h-9 bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600 text-white font-semibold text-sm rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                            onClick={handleReportImage}
                            disabled={reporting || !selectedReason || isBlocking}
                          >
                            {reporting ? t('reportModal.reporting') : t('reportModal.reportButton')}
                          </button>

                          <button
                            className="w-full h-9 bg-pink-600 hover:bg-pink-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            onClick={handleBlockUser}
                            disabled={isBlocking || reporting || (!selectedReason && !blockReason.trim())}
                          >
                            {isBlocking ? t('reportModal.blockSection.blocking') : t('reportModal.blockSection.blockButton')}
                          </button>
                        </div>

                        {reportError && (
                          <div className="text-red-300 text-xs mt-2 text-center bg-red-950/50 p-2 rounded-lg border border-red-500/30">
                            {reportError}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>,
            document.body
          )}
        </div>
      </div>
    );
  }

  if (isDetailsAreaOnly) {
    // Render only the expandable details panel - name/location/tags/toggle now
    // live in the photo caption (isSwipeAreaOnly), so this renders nothing at all
    // when collapsed, matching ProfilePreviewModal's `{showMoreInfo && (...)}` panel.
    if (!showMoreInfo) return null;

    return (
      <div
        className="w-full bg-black"
        style={{
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Roboto, "Segoe UI", sans-serif'
        }}
      >
        <div className="px-4 pt-1 space-y-3 text-[clamp(13px,3.6vw,16px)]" style={{ paddingBottom: '10px' }}>
            {/* About (Bio) */}
            {match.bio && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-1">{t('discover.matchCard.about')}</h4>
                <p className="text-gray-200 text-sm leading-relaxed">{match.bio}</p>
              </div>
            )}

            {/* First captioned photo (ImageManagement.tsx) - no section heading, just
                the photo, its preset label (what it's about), and the full caption
                (capped at 50 chars) pinned to the image's own bottom edge. */}
            {captionedPhotos[0] && renderPhotoCaptionCard(captionedPhotos[0])}

            {/* Height */}
            {typeof match.height_cm === 'number' && match.height_cm > 0 && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.height', 'Height')}</h4>
                <div className="flex items-center text-sm">
                  <Ruler className="w-[clamp(11px,3vw,13px)] h-[clamp(11px,3vw,13px)] mr-2 flex-shrink-0 text-pink-500" />
                  <span className="text-gray-200">{formatHeightLabel(match.height_cm)}</span>
                </div>
              </div>
            )}

            {/* Lifestyle */}
            {([
              match.smoking,
              match.drinking,
              match.exercise_level,
              match.sleeping_schedule
            ].some(val => val && val !== 'not_specified')) && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.lifestyle')}</h4>
                <div className="space-y-2">
                  {match.smoking && match.smoking !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="mr-2 flex-shrink-0" aria-hidden="true">🚬</span>
                      <span className="font-semibold mr-2 text-white">{t('discover.matchCard.smoking')}:</span>
                      <span className="text-gray-200">{match.smoking}</span>
                    </div>
                  )}
                  {match.drinking && match.drinking !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="mr-2 flex-shrink-0" aria-hidden="true">🍸</span>
                      <span className="font-semibold mr-2 text-white">{t('discover.matchCard.drinking')}:</span>
                      <span className="text-gray-200">{match.drinking}</span>
                    </div>
                  )}
                  {match.exercise_level && match.exercise_level !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="mr-2 flex-shrink-0" aria-hidden="true">🏋️</span>
                      <span className="font-semibold mr-2 text-white">{t('discover.matchCard.exercise')}:</span>
                      <span className="text-gray-200">{match.exercise_level}</span>
                    </div>
                  )}
                  {match.sleeping_schedule && match.sleeping_schedule !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="mr-2 flex-shrink-0" aria-hidden="true">😴</span>
                      <span className="font-semibold mr-2 text-white">{t('discover.matchCard.sleep')}:</span>
                      <span className="text-gray-200">{match.sleeping_schedule}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {secondPhotoAnchor === 'lifestyle' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

            {/* Family Plans */}
            {match.family_plans && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.familyPlans', 'Family Plans')}</h4>
                <div className="flex items-center text-sm">
                  <Baby className="w-[clamp(11px,3vw,13px)] h-[clamp(11px,3vw,13px)] mr-2 flex-shrink-0 text-pink-500" />
                  <span className="text-gray-200">{traitLabel(FAMILY_PLANS_OPTIONS, match.family_plans)}</span>
                </div>
              </div>
            )}

            {/* Work & Education */}
            {(match.occupation || match.education_level) && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.workEducation')}</h4>
                <div className="space-y-2">
                  {match.occupation && (
                    <div className="flex items-center text-sm">
                      <Briefcase className="w-[clamp(11px,3vw,13px)] h-[clamp(11px,3vw,13px)] mr-2 flex-shrink-0 text-pink-500" />
                      <span className="text-gray-200">{match.occupation}</span>
                    </div>
                  )}
                  {match.education_level && (
                    <div className="flex items-center text-sm">
                      <GraduationCap className="w-[clamp(11px,3vw,13px)] h-[clamp(11px,3vw,13px)] mr-2 flex-shrink-0 text-pink-500" />
                      <span className="text-gray-200">{match.education_level}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {secondPhotoAnchor === 'workEducation' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

            {/* Personality */}
            {(typeof match.introvert_extrovert === 'number' || typeof match.spontaneous_planner === 'number' || typeof match.messy_organized === 'number') && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-3">{t('discover.matchCard.personality')}</h4>
                <div className="space-y-4">
                  {typeof match.introvert_extrovert === 'number' && (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-400">{t('discover.matchCard.introvert')}</span>
                      <div className="flex-1 bg-white/10 rounded-full h-2">
                        <div
                          className={`bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full ${styles.dynamicWidth}`}
                          style={{ width: `${match.introvert_extrovert}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-400">{t('discover.matchCard.extrovert')}</span>
                    </div>
                  )}
                  {typeof match.spontaneous_planner === 'number' && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-300">{t('discover.matchCard.spontaneousVsPlanner', { percentage: match.spontaneous_planner })}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-400">{t('discover.matchCard.spontaneous')}</span>
                        <div className="flex-1 bg-white/10 rounded-full h-2">
                          <div
                            className={`bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full ${styles.dynamicWidth}`}
                            style={{ width: `${match.spontaneous_planner}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-400">{t('discover.matchCard.planner')}</span>
                      </div>
                    </div>
                  )}
                  {typeof match.messy_organized === 'number' && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-300">{t('discover.matchCard.messyVsOrganized', { percentage: match.messy_organized })}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-400">{t('discover.matchCard.messy')}</span>
                        <div className="flex-1 bg-white/10 rounded-full h-2">
                          <div
                            className={`bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full ${styles.dynamicWidth}`}
                            style={{ width: `${match.messy_organized}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-400">{t('discover.matchCard.organized')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {secondPhotoAnchor === 'personality' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

            {/* Communication Style */}
            {match.communication_style && match.communication_style.length > 0 && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                  <MessageCircle className="w-[clamp(11px,3vw,13px)] h-[clamp(11px,3vw,13px)] text-pink-500" />
                  {t('discover.matchCard.communicationStyle', 'Communication Style')}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {match.communication_style.map((value, index) => (
                    <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                      {traitLabel(COMMUNICATION_STYLE_OPTIONS, value)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {secondPhotoAnchor === 'communicationStyle' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

            {/* Love Style */}
            {match.love_style && match.love_style.length > 0 && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                  <Gift className="w-[clamp(11px,3vw,13px)] h-[clamp(11px,3vw,13px)] text-pink-500" />
                  {t('discover.matchCard.loveStyle', 'Love Style')}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {match.love_style.map((value, index) => (
                    <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                      {traitLabel(LOVE_STYLE_OPTIONS, value)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Interests */}
            {match.interests?.length > 0 && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.interests')}</h4>
                <div className="flex flex-wrap gap-1">
                  {match.interests.map((interest, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Favorites */}
            {match.favorites?.length > 0 && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.favorites')}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {match.favorites.map((favorite, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 h-6 leading-none px-2 py-0 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-xs"
                    >
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

            {/* Pets */}
            {match.pets && match.pets.length > 0 && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                  <PawPrint className="w-[clamp(11px,3vw,13px)] h-[clamp(11px,3vw,13px)] text-pink-500" />
                  {t('discover.matchCard.pets', 'Pets')}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {match.pets.map((value, index) => (
                    <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                      {traitLabel(PETS_OPTIONS, value)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Languages spoken */}
            {match.languages && match.languages.length > 0 && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.languagesSpoken', 'Languages')}</h4>
                <div className="flex flex-wrap gap-1">
                  {match.languages.map((lang, index) => (
                    <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Social Media */}
            {match.social_media && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.socialMedia', 'Social Media')}</h4>
                <div className="flex items-center text-sm">
                  <Share2 className="w-[clamp(11px,3vw,13px)] h-[clamp(11px,3vw,13px)] mr-2 flex-shrink-0 text-pink-500" />
                  <span className="text-gray-200">{traitLabel(SOCIAL_MEDIA_OPTIONS, match.social_media)}</span>
                </div>
              </div>
            )}

            {/* Language */}
            {preferredLanguageName && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3 pb-6">
                <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.language')}</h4>
                <div className="flex items-center text-sm">
                  <Languages className="w-[clamp(12px,3.2vw,14px)] h-[clamp(12px,3.2vw,14px)] mr-2 text-pink-500 shrink-0" />
                  <span className="text-gray-200">{preferredLanguageName}</span>
                </div>
              </div>
            )}
        </div>
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
