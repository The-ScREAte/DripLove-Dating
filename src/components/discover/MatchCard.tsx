import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import ReportButton from '../ReportButton';
import UserAdinkraDisplay from './UserAdinkraDisplay';
import ReportModal from '../modals/ReportModal';
import styles from './MatchCard.module.css';
import { MapPin, Briefcase, GraduationCap, Calendar, Crown, Shield, ArrowDown, ArrowUp, User, Languages, Heart } from 'lucide-react';
import { PotentialMatch } from '@/types';
import { useTranslation } from 'react-i18next';
import { getLanguageName } from '@/utils/languageNames';
import { supabase } from '@/integrations/supabase/client';
import { buildSlides, getUserColorHash } from './MatchCardHelpers';
import { SlideRenderer } from './SlideRenderer';
import { getPlatformSync } from '@/utils/platformUtils';
import { optimizeImageUrl } from '@/utils/imageOptimizer';

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
  getOptimizedUrl = (url: string) => optimizeImageUrl(url, { width: 500, quality: 60 }),
  preCalculatedDistance
  , imageStatus
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
  const platform = useMemo(() => getPlatformSync(), []);
  
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

  // ⭐ REMOVED: Language fetching (now passed as prop from parent to eliminate DB calls)
  // ⭐ REMOVED: imageLoading state - blob URLs load instantly from memory, no loader needed
  
  // Background colors for fun questions and about
  const backgroundColors = useMemo(() => [
    'bg-gradient-to-br from-blue-400 to-blue-600',
    'bg-gradient-to-br from-green-400 to-green-600',
    'bg-gradient-to-br from-purple-400 to-purple-600',
    'bg-gradient-to-br from-pink-400 to-pink-600',
    'bg-gradient-to-br from-indigo-400 to-indigo-600',
    'bg-gradient-to-br from-teal-400 to-teal-600',
    'bg-gradient-to-br from-cyan-400 to-cyan-600',
    'bg-gradient-to-br from-rose-400 to-rose-600',
    'bg-gradient-to-br from-orange-400 to-orange-600',
    'bg-gradient-to-br from-emerald-400 to-emerald-600'
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
      const message = err instanceof Error ? err.message : undefined
      setReportError(message || t('reportModal.error'));
    } finally {
      setReporting(false);
    }
  }; 

  // Reset modal state when closing
  const closeReportModal = () => {
    setShowReportModal(false);
    setSelectedReason("");
    setReportError("");
    setBlockReason("");
    setIsBlockSuccess(false);
  };

  // Handle block user
  const handleBlockUser = async () => {
    if (!match.id) return;

    setIsBlocking(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Insert block record
      const { error } = await supabase
        .from('blocks')
        .insert({
          blocker_id: user.id,
          blocked_id: match.id,
          reason: blockReason.trim() || null
        });

      if (error) throw error;

      setIsBlockSuccess(true);
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccess(false);
        setIsBlockSuccess(false);
        setSelectedReason("");
        setBlockReason("");
      }, 3000); // Give more time to read the block message
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined
      setReportError(message || "Failed to block user");
    } finally {
      setIsBlocking(false);
    }
  };

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
              {/* Report button for image slides - positioned closer to top edge */}
              {slides[currentSlide]?.type === 'image' && (
                <div 
                  className="absolute right-3 z-50"
                  style={{
                    top: platform === 'android'
                      ? 'calc(2rem + 56px)'
                      : 'calc(clamp(1rem, env(safe-area-inset-top, 1rem) + 0.5rem, 2.25rem) + 56px)'
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
                </div>
              )}

              {/* Optimized cultural sign glow effect */}
              {stableMatch.adinkra_symbols && stableMatch.adinkra_symbols.length > 0 && (
                <div
                  className="absolute left-1/2 transform -translate-x-1/2 z-50"
                  style={{ top: 'calc(clamp(-0.5rem, env(safe-area-inset-top, -0.5rem) - 0.125rem, 0.75rem) + 44px)' }}
                >
                  <div className="relative flex flex-col items-center">
                    {/* Single optimized glow layer */}
                    <div className="relative w-16 h-16 flex items-center justify-center overflow-visible">
                      {/* Single efficient gradient layer */}
                      <div
                        className="absolute inset-0 w-full h-full"
                        style={{
                          background: 'radial-gradient(circle at center, rgba(255, 98, 0, 0.25), transparent 80%)',
                          filter: 'blur(0px)',
                        }}
                      ></div>

                      {/* Adinkra Symbol */}
                      <div className="relative z-10">
                        <UserAdinkraDisplay adinkraSymbols={stableMatch.adinkra_symbols} />
                      </div>
                    </div>
                  </div>
                </div>
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
          {slides && slides.length > 1 && (
            <div 
              className="absolute left-4 flex space-x-2 z-10"
              style={{
                top: platform === 'android'
                  ? 'calc(2rem + 56px)'
                  : 'calc(clamp(1rem, env(safe-area-inset-top, 1rem) + 0.5rem, 2.25rem) + 56px)',
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
            </div>
          )}

          {/* Cultural sign is shown in the top-center */}

          {/* Report Modal */}
          {showReportModal && (
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
                  className="bg-black rounded-2xl shadow-2xl border border-pink-500/30 w-full max-w-sm mx-auto"
                  onClick={e => e.stopPropagation()}
                  style={{
                    minHeight: '350px',
                    maxHeight: '90vh',
                    width: '100%',
                    maxWidth: '400px',
                    overflow: 'hidden',
                    willChange: 'auto',
                    backfaceVisibility: 'hidden'
                  }}
                >
                  {/* Modal header with close button */}
                  <div className="relative px-4 pt-4 pb-3 border-b border-pink-500/20 bg-black">
                    <button
                      onClick={closeReportModal}
                      className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white transition-colors rounded-full bg-white/10 border border-pink-500/20 hover:bg-white/20"
                      disabled={reporting}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>

                    <div className="pr-10">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-rose-400 font-semibold">Safety Center</p>
                      <h3 className="text-lg font-bold text-white mt-1">{t('reportModal.title')}</h3>
                      <p className="text-xs text-gray-300 mt-1">{t('reportModal.instruction')}</p>
                    </div>
                  </div>

                  {/* Modal content */}
                  <div className="px-4 pb-4 pt-3 max-h-96 overflow-y-auto">
                    {isBlockSuccess ? (
                      <div className="text-green-400 font-semibold text-center py-8">
                        <div className="mb-2 text-3xl">🚫</div>
                        <div className="text-lg mb-2">{t('reportModal.blockSuccess.title')}</div>
                        <div className="text-sm text-gray-300">{t('reportModal.blockSuccess.message')}</div>
                      </div>
                    ) : reportSuccess ? (
                      <div className="text-green-400 font-semibold text-center py-8">
                        <div className="mb-2 text-2xl">✓</div>
                        <div>{t('reportModal.success')}</div>
                      </div>
                    ) : (
                      <>
                        {/* Reason selection with stable layout */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          {reportReasons.map((reason, index) => {
                            const tone = reasonStyles[index % reasonStyles.length];
                            return (
                            <button
                              key={reason}
                              onClick={() => setSelectedReason(reason)}
                              disabled={reporting || isBlocking}
                              className={`w-full min-h-11 px-3 py-2 text-left rounded-xl border-2 transition-all duration-200 flex items-center justify-between ${
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

                        {/* Block section */}
                        <div className="mb-4 p-3 bg-black/60 rounded-xl border border-pink-500/20">
                          <p className="text-gray-200 mb-2 text-xs font-semibold uppercase tracking-wide">{t('reportModal.blockSection.title')}</p>
                          <textarea
                            placeholder={t('reportModal.blockSection.placeholder')}
                            value={blockReason}
                            onChange={(e) => setBlockReason(e.target.value)}
                            disabled={reporting || isBlocking}
                            className="w-full p-2.5 bg-black/40 border border-pink-500/30 text-white placeholder:text-gray-500 rounded-lg text-xs resize-none focus:ring-2 focus:ring-pink-500/40 focus:border-pink-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                            rows={2}
                          />
                          <button
                            className="w-full mt-2 h-9 bg-pink-600 hover:bg-pink-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 text-xs"
                            onClick={handleBlockUser}
                            disabled={isBlocking || reporting}
                          >
                            {isBlocking ? t('reportModal.blockSection.blocking') : t('reportModal.blockSection.blockButton')}
                          </button>
                        </div>

                        {/* Action buttons with stable height */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            className="w-full h-10 bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600 text-white font-semibold text-sm rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                            onClick={handleReportImage}
                            disabled={reporting || !selectedReason || isBlocking}
                          >
                            {reporting ? t('reportModal.reporting') : t('reportModal.reportButton')}
                          </button>

                          <button
                            className="w-full h-10 bg-black hover:bg-white/5 text-gray-200 font-semibold text-sm rounded-lg border border-pink-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            onClick={closeReportModal}
                            disabled={reporting || isBlocking}
                          >
                            {t('reportModal.cancel')}
                          </button>
                        </div>

                        {reportError && (
                          <div className="text-red-300 text-xs mt-3 text-center bg-red-950/50 p-2.5 rounded-lg border border-red-500/30">
                            {reportError}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (isDetailsAreaOnly) {
    // Render only the non-swipeable details area
    return (
      <div
        className={`w-full pt-3 ${styles.detailsContainer} ${isDragging ? styles.detailsContainerDragging : ''}`}
        style={{
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Roboto, "Segoe UI", sans-serif'
        }}
      >
        {/* Basic Info - Always shown */}
        <div className="flex justify-between items-start mt-2 px-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 leading-tight">
              <h2
                className="text-[clamp(15px,4.4vw,18px)] font-medium text-white"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.45), 0 1px 8px rgba(0,0,0,0.25)', paddingTop: 'clamp(80px, 10vw, 100px)' }}
              >
                {toTitleCase(match.first_name)} {toTitleCase(match.last_name)}, {calculateAge(match.date_of_birth)}
              </h2>
              {/* Verified badge beside name and age - exact same as ProfilePage */}
              {isVerified && (
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

            {match.city && (
              <div
                className="flex items-center mt-1.5 text-white/90 leading-tight"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
              >
                <MapPin className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                <span className="text-[clamp(12px,3.4vw,14px)] font-normal">
                  {match.city}, {match.country}
                  {match.distance !== undefined ? (
                    <span className="ml-2">
                      • {Math.max(1, Math.round(match.distance))} km away
                    </span>
                  ) : preCalculatedDistance !== undefined ? (
                    <span className="ml-2">
                      • {Math.max(1, Math.round(preCalculatedDistance))} km away
                    </span>
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
                </span>
              </div>
            )}
            
            {match.relationship_intent && (
              <div
                className="flex items-center mt-2 text-white/90 leading-tight"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
              >
                <Heart className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                <span className="text-[clamp(11px,3.2vw,13px)] font-medium">
                  {formatRelationshipIntent(match.relationship_intent)}
                </span>
              </div>
            )}
          </div>

          {/* Expandable info button — small, clean, glassy circle so it doesn't compete with the content */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleInfo();
            }}
            className={`text-white rounded-full p-[clamp(0.4rem,2vw,0.55rem)] transition-all duration-200 shrink-0 backdrop-blur-md ${
              !showMoreInfo ? styles.chevronHop : ''
            }`}
            style={{
              background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
              boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
              marginTop: '60px',
            }}
            aria-label={showMoreInfo ? "Hide details" : "Show details"}
          >
            {showMoreInfo ? (
              <ArrowUp className="w-[clamp(14px,3.8vw,17px)] h-[clamp(14px,3.8vw,17px)]" strokeWidth={2.5} />
            ) : (
              <ArrowDown className="w-[clamp(14px,3.8vw,17px)] h-[clamp(14px,3.8vw,17px)]" strokeWidth={2.5} />
            )}
          </button>
        </div>

        {/* Expandable details - appears below basic info */}
        {showMoreInfo && (
          <div className="mt-4 px-4 space-y-3 text-[clamp(13px,3.6vw,16px)]" style={{ paddingBottom: '100px' }}>
            {/* About (Bio) */}
            {match.bio && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-1">{t('discover.matchCard.about')}</h4>
                <p className="text-gray-200 text-sm leading-relaxed">{match.bio}</p>
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
                      <span className="font-semibold mr-2 text-white">{t('discover.matchCard.smoking')}:</span>
                      <span className="text-gray-200">{match.smoking}</span>
                    </div>
                  )}
                  {match.drinking && match.drinking !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="font-semibold mr-2 text-white">{t('discover.matchCard.drinking')}:</span>
                      <span className="text-gray-200">{match.drinking}</span>
                    </div>
                  )}
                  {match.exercise_level && match.exercise_level !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="font-semibold mr-2 text-white">{t('discover.matchCard.exercise')}:</span>
                      <span className="text-gray-200">{match.exercise_level}</span>
                    </div>
                  )}
                  {match.sleeping_schedule && match.sleeping_schedule !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="font-semibold mr-2 text-white">{t('discover.matchCard.sleep')}:</span>
                      <span className="text-gray-200">{match.sleeping_schedule}</span>
                    </div>
                  )}
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

            {/* Language */}
            {preferredLanguageName && (
              <div className="bg-black border border-pink-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.language')}</h4>
                <div className="flex items-center text-sm">
                  <Languages className="w-[clamp(12px,3.2vw,14px)] h-[clamp(12px,3.2vw,14px)] mr-2 text-pink-500 shrink-0" />
                  <span className="text-gray-200">{preferredLanguageName}</span>
                </div>
              </div>
            )}
          </div>
        )}
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
    areStringArraysEqual(prev.userImages, next.userImages) &&
    areStringMapsEqual(prev.preloadedBlobImages, next.preloadedBlobImages) &&
    prev.showMoreInfo === next.showMoreInfo &&
    prev.swipeDirection === next.swipeDirection &&
    prev.imageIndex === next.imageIndex &&
    prev.preferredLanguageName === next.preferredLanguageName && // ⭐ FIX #2: Detect language changes
    areImageStatusMapsEqual(prev.imageStatus, next.imageStatus) // ⭐ FIX #3: Detect loading state changes
  );
});
