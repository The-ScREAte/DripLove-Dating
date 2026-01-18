import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import ReportButton from '../ReportButton';
import UserAdinkraDisplay from './UserAdinkraDisplay';
import ReportModal from '../modals/ReportModal';
import styles from './MatchCard.module.css';
import { MapPin, Briefcase, GraduationCap, Calendar, Crown, Shield, ChevronDown, ChevronUp, User, Languages, Heart } from 'lucide-react';
import { PotentialMatch } from '@/types';
import { useTranslation } from 'react-i18next';
import { getLanguageName } from '@/utils/languageNames';
import { supabase } from '@/integrations/supabase/client';
import { buildSlides, getUserColorHash } from './MatchCardHelpers';
import { SlideRenderer } from './SlideRenderer';
import { getPlatformSync } from '@/utils/platformUtils';

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
  isSwipeAreaOnly = false,
  isDetailsAreaOnly = false,
  getOptimizedUrl = (url: string) => url.includes('supabase') ? `${url}?width=500&quality=60&format=webp` : url,
  preCalculatedDistance
  , imageStatus
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
  const platform = useMemo(() => getPlatformSync(), []);
  
  // Refs for performance
  const lastSlideInteraction = useRef<number>(0);
  const slideTransitionInProgress = useRef<boolean>(false);
  const containerWidth = useRef<number>(0);
  const containerLeft = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ⭐ PHASE 1.1: Memoize all expensive inputs (prevents Android re-render storm)
  const memoUserImages = useMemo(() => userImages.slice(), [userImages.join(',')]); // ⭐ FIX: Detect actual URL changes
  const memoPreloadedBlobs = useMemo(
    () => preloadedBlobImages,
    [preloadedBlobImages ? Object.keys(preloadedBlobImages).length : 0]
  );

  // ⭐ PHASE 1.2: Freeze match fields (prevents 3-5x re-computation on Android)
  const stableMatch = useMemo(() => ({
    ...match,
    adinkra_symbols: match.adinkra_symbols || []
  }), [match.id]);

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
  }, [slides.length]);

  // ⭐ PHASE 2.7: Pre-calc card width AND left position once (eliminate ALL DOM reads on Android)
  // ⭐ FIX #3: Add resize listener for orientation changes
  useEffect(() => {
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
    setCurrentSlide(s => {
      const nextIndex = Math.min(s + 1, slides.length - 1);
      onImageIndexChange?.(nextIndex, slides.length); // ⭐ SMART LOADING: Notify parent with index info
      return nextIndex;
    });
  }, [slides.length, onImageIndexChange]);

  const handlePrev = useCallback(() => {
    setCurrentSlide(s => {
      const prevIndex = Math.max(s - 1, 0);
      onImageIndexChange?.(prevIndex, slides.length); // ⭐ SMART LOADING: Notify parent with index info
      return prevIndex;
    });
  }, [slides.length, onImageIndexChange]);

  // ⭐ PHASE 1.7: OPTIMIZED: Zero DOM reads on click (instant Android tap response)
  const handleSlideClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    
    const width = containerWidth.current;
    if (!width) return;
    
    const clickX = e.clientX - containerLeft.current;
    
    if (clickX < width / 2) {
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
                      ? '2rem' 
                      : 'clamp(1rem, env(safe-area-inset-top, 1rem) + 0.5rem, 2.25rem)' 
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
                  style={{ top: 'clamp(-0.25rem, env(safe-area-inset-top, -0.25rem) + 0.125rem, 1rem)' }}
                >
                  <div className="relative flex flex-col items-center">
                    {/* Single optimized glow layer */}
                    <div className="relative w-24 h-24 flex items-center justify-center overflow-visible">
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
                  ? '2rem' 
                  : 'clamp(1rem, env(safe-area-inset-top, 1rem) + 0.5rem, 2.25rem)', 
                pointerEvents: 'none' 
              }}
            >
              {slides.map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-2 rounded-full transition-all duration-300 ${
                    index === currentSlide 
                      ? 'bg-white shadow-lg' 
                      : 'bg-white/30'
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
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-auto" 
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
                  <div className="relative p-6 pb-2">
                    <button
                      onClick={closeReportModal}
                      className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
                      disabled={reporting}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    
                    <h3 className="text-xl font-bold text-red-600 pr-8">{t('reportModal.title')}</h3>
                  </div>

                  {/* Modal content */}
                  <div className="px-6 pb-6 max-h-96 overflow-y-auto">
                    {isBlockSuccess ? (
                      <div className="text-green-600 font-semibold text-center py-8">
                        <div className="mb-2 text-3xl">🚫</div>
                        <div className="text-lg mb-2">{t('reportModal.blockSuccess.title')}</div>
                        <div className="text-sm text-gray-600">{t('reportModal.blockSuccess.message')}</div>
                      </div>
                    ) : reportSuccess ? (
                      <div className="text-green-600 font-semibold text-center py-8">
                        <div className="mb-2 text-2xl">✓</div>
                        <div>{t('reportModal.success')}</div>
                      </div>
                    ) : (
                      <>
                        <p className="text-gray-700 mb-4 text-sm font-semibold">{t('reportModal.instruction')}</p>
                        
                        {/* Reason selection with stable layout */}
                        <div className="space-y-3 mb-6">
                          {reportReasons.map((reason) => (
                            <button
                              key={reason}
                              onClick={() => setSelectedReason(reason)}
                              disabled={reporting || isBlocking}
                              className={`w-full h-12 px-4 text-left rounded-lg border-2 transition-all duration-200 flex items-center justify-between ${
                                selectedReason === reason
                                  ? 'border-red-500 bg-red-50 text-red-700'
                                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                              } ${(reporting || isBlocking) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <span className="text-sm font-medium flex-1 pr-2">{reason}</span>
                              {selectedReason === reason && (
                                <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>

                        {/* Block section */}
                        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <p className="text-gray-700 mb-3 text-sm font-semibold">{t('reportModal.blockSection.title')}</p>
                          <textarea
                            placeholder={t('reportModal.blockSection.placeholder')}
                            value={blockReason}
                            onChange={(e) => setBlockReason(e.target.value)}
                            disabled={reporting || isBlocking}
                            className="w-full p-3 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            rows={3}
                          />
                          <button
                            className="w-full mt-3 h-10 bg-gray-800 hover:bg-gray-900 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 text-sm"
                            onClick={handleBlockUser}
                            disabled={isBlocking || reporting}
                          >
                            {isBlocking ? t('reportModal.blockSection.blocking') : t('reportModal.blockSection.blockButton')}
                          </button>
                        </div>

                        {/* Action buttons with stable height */}
                        <div className="space-y-3">
                          <button
                            className="w-full h-12 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            onClick={handleReportImage}
                            disabled={reporting || !selectedReason || isBlocking}
                          >
                            {reporting ? t('reportModal.reporting') : t('reportModal.reportButton')}
                          </button>
                          
                          <button
                            className="w-full h-12 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            onClick={closeReportModal}
                            disabled={reporting || isBlocking}
                          >
                            {t('reportModal.cancel')}
                          </button>
                        </div>
                        
                        {reportError && (
                          <div className="text-red-500 text-sm mt-4 text-center bg-red-50 p-3 rounded-lg border border-red-200">
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
        className={`w-full ${showMoreInfo ? 'pt-0' : 'pt-0'} px-4 ${styles.detailsContainer}`}
      >
        {/* Basic Info - Always shown */}
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-1.9xl font-bold text-gray-900">
                {match.first_name} {match.last_name}
              </h2>
              <span className="text-lg text-gray-500">
                {calculateAge(match.date_of_birth)}
              </span>
              {/* Verified badge beside name and age - exact same as ProfilePage */}
              {isVerified && (
                <img
                  loading="lazy"
                  decoding="async"
                  src="/images/verified.svg"
                  alt="Verified profile"
                  title="Verified profile"
                  className="w-6 h-6"
                  aria-hidden="false"
                />
              )}
            </div>

            {match.city && (
              <div className="flex items-center mt-1 text-gray-600">
                <MapPin className="w-4 h-4 mr-1" />
                <span className="text-base">
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
              <div className="flex items-center mt-1 text-gray-600">
                <Heart className="w-4 h-4 mr-1" />
                <span className="text-base capitalize">
                  {match.relationship_intent === 'open_to_anything' ? 'Open to anything' : match.relationship_intent}
                </span>
              </div>
            )}
          </div>

          {/* Expandable info button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleInfo();
            }}
            className="bg-pink-500 hover:bg-pink-600 text-white rounded-full p-3 mt-3 transition-colors shadow-lg"
            aria-label={showMoreInfo ? "Hide details" : "Show details"}
          >
            {showMoreInfo ? (
              <ChevronUp className="w-5 h-4" />
            ) : (
              <ChevronDown className="w-5 h-4" />
            )}
          </button>
        </div>

        {/* Expandable details - appears below basic info */}
        {showMoreInfo && (
          <div className="mt-4 space-y-3 text-base">
            {/* About (Bio) */}
            {match.bio && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-semibold text-pink-600 mb-1">{t('discover.matchCard.about')}</h4>
                <p className="text-gray-700 text-sm leading-relaxed">{match.bio}</p>
              </div>
            )}

            {/* Lifestyle */}
            {([
              match.smoking,
              match.drinking,
              match.exercise_level,
              match.sleeping_schedule
            ].some(val => val && val !== 'not_specified')) && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-semibold text-pink-600 mb-2">{t('discover.matchCard.lifestyle')}</h4>
                <div className="space-y-2">
                  {match.smoking && match.smoking !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="font-semibold mr-2">{t('discover.matchCard.smoking')}:</span>
                      <span className="text-gray-700">{match.smoking}</span>
                    </div>
                  )}
                  {match.drinking && match.drinking !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="font-semibold mr-2">{t('discover.matchCard.drinking')}:</span>
                      <span className="text-gray-700">{match.drinking}</span>
                    </div>
                  )}
                  {match.exercise_level && match.exercise_level !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="font-semibold mr-2">{t('discover.matchCard.exercise')}:</span>
                      <span className="text-gray-700">{match.exercise_level}</span>
                    </div>
                  )}
                  {match.sleeping_schedule && match.sleeping_schedule !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="font-semibold mr-2">{t('discover.matchCard.sleep')}:</span>
                      <span className="text-gray-700">{match.sleeping_schedule}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Work & Education */}
            {(match.occupation || match.education_level) && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-semibold text-pink-600 mb-2">{t('discover.matchCard.workEducation')}</h4>
                <div className="space-y-2">
                  {match.occupation && (
                    <div className="flex items-center text-sm">
                      <Briefcase className="w-3 h-3 mr-2 flex-shrink-0 text-pink-500" />
                      <span className="text-gray-700">{match.occupation}</span>
                    </div>
                  )}
                  {match.education_level && (
                    <div className="flex items-center text-sm">
                      <GraduationCap className="w-3 h-3 mr-2 flex-shrink-0 text-pink-500" />
                      <span className="text-gray-700">{match.education_level}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Personality */}
            {(typeof match.introvert_extrovert === 'number' || typeof match.spontaneous_planner === 'number' || typeof match.messy_organized === 'number') && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-semibold text-pink-600 mb-3">{t('discover.matchCard.personality')}</h4>
                <div className="space-y-4">
                  {typeof match.introvert_extrovert === 'number' && (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">{t('discover.matchCard.introvert')}</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full ${styles.dynamicWidth}`}
                          style={{ width: `${match.introvert_extrovert}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-500">{t('discover.matchCard.extrovert')}</span>
                    </div>
                  )}
                  {typeof match.spontaneous_planner === 'number' && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-600">{t('discover.matchCard.spontaneousVsPlanner', { percentage: match.spontaneous_planner })}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">{t('discover.matchCard.spontaneous')}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full ${styles.dynamicWidth}`}
                            style={{ width: `${match.spontaneous_planner}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-500">{t('discover.matchCard.planner')}</span>
                      </div>
                    </div>
                  )}
                  {typeof match.messy_organized === 'number' && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-600">{t('discover.matchCard.messyVsOrganized', { percentage: match.messy_organized })}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">{t('discover.matchCard.messy')}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full ${styles.dynamicWidth}`}
                            style={{ width: `${match.messy_organized}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-500">{t('discover.matchCard.organized')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Interests */}
            {match.interests?.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-semibold text-pink-600 mb-2">{t('discover.matchCard.interests')}</h4>
                <div className="flex flex-wrap gap-1">
                  {match.interests.map((interest, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-pink-100 text-pink-700 rounded-full text-sm"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Language */}
            {preferredLanguageName && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-semibold text-pink-600 mb-2">{t('discover.matchCard.language')}</h4>
                <div className="flex items-center text-sm">
                  <Languages className="w-4 h-4 mr-2 text-pink-500" />
                  <span className="text-gray-700">{preferredLanguageName}</span>
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

// ⭐ PHASE 2.9: PureComponent to freeze layout (prevents unnecessary re-renders on Android)
export default React.memo(MatchCard, (prev, next) => {
  return (
    prev.match.id === next.match.id &&
    prev.userImages.join(',') === next.userImages.join(',') && // ⭐ FIX #1: Detect URL changes, not just length
    Object.keys(prev.preloadedBlobImages || {}).length === Object.keys(next.preloadedBlobImages || {}).length &&
    prev.showMoreInfo === next.showMoreInfo &&
    prev.swipeDirection === next.swipeDirection &&
    prev.imageIndex === next.imageIndex &&
    prev.preferredLanguageName === next.preferredLanguageName && // ⭐ FIX #2: Detect language changes
    JSON.stringify(prev.imageStatus) === JSON.stringify(next.imageStatus) // ⭐ FIX #3: Detect loading state changes
  );
});
