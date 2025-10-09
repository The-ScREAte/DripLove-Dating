import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReportButton from '../ReportButton';
import UserAdinkraDisplay from './UserAdinkraDisplay';
import ReportModal from '../modals/ReportModal';
import styles from './MatchCard.module.css';
import { MapPin, Briefcase, GraduationCap, Calendar, Crown, Shield, ChevronDown, ChevronUp, User, Quote, Heart, Coffee, Search, Loader2 } from 'lucide-react';
import { PotentialMatch } from '@/types';

interface MatchCardProps {
  match: PotentialMatch;
  imageIndex: number;
  showMoreInfo: boolean;
  isPremium: boolean;
  isVerified?: boolean; // New prop for verified status
  currentUserLatitude?: number;
  currentUserLongitude?: number;
  userImages: string[]; // New prop for user images
  onImageClick: () => void;
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
  onImageClick,
  onToggleInfo,
  calculateAge,
  calculateDistance,
  swipeDirection,
  swipeDistance,
  isSwipeAreaOnly = false,
  isDetailsAreaOnly = false,
  getOptimizedUrl = (url: string) => url.includes('supabase') ? `${url}?width=800&quality=85&format=webp` : url,
  preCalculatedDistance
  , imageStatus
}) => {
  // imageStatus: map of url => 'idle' | 'loading' | 'loaded' | 'error'
  // (passed from parent component)
  // ...existing code...
  const [currentSlide, setCurrentSlide] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  
  // Use ref for internal state that doesn't need to trigger re-renders
  const lastSlideInteraction = useRef<number>(0);
  const slideTransitionInProgress = useRef<boolean>(false);
  
  // Memoize image loading callbacks to prevent unnecessary re-renders
  const handleImageLoadStart = useCallback(() => setImageLoading(true), []);
  const handleImageLoadEnd = useCallback(() => setImageLoading(false), []);
  
  // Random background colors for fun questions and about - ensuring good contrast
  const backgroundColors = [
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
  ];

  // Generate consistent color for this user based on their ID
  const getUserColor = () => {
    if (!match.id) return backgroundColors[0];
    // Simple hash function to convert user ID to a consistent index
    let hash = 0;
    const str = match.id.toString();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return backgroundColors[Math.abs(hash) % backgroundColors.length];
  };

  const userBackgroundColor = getUserColor();
  
  // Create slides: mix images with bio and fun questions
  // Use a seeded RNG based on match.id so ordering is deterministic per-profile
  const slides = React.useMemo(() => {
    // Seeded RNG (mulberry32)
    const seedFromString = (s: string | number | undefined) => {
      const str = s == null ? '' : String(s);
      let h = 2166136261 >>> 0;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    };
    const mulberry32 = (a: number) => () => {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    const seed = seedFromString(match.id || match.first_name || 0);
    const rand = mulberry32(seed);

    const seededShuffle = <T,>(arr: T[]) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const imageSlides = userImages.map((image, index) => ({
      type: 'image' as const,
      content: image,
      index
    }));

    // Collect all non-image content
    const nonImageContent: Array<any> = [];

    if (match.bio?.trim()) {
      nonImageContent.push({ type: 'bio' as const, content: match.bio, index: -1 });
    }

    // Choose one fun question deterministically
    const funQuestions = [] as Array<any>;
    if (match.fun_fact?.trim()) funQuestions.push({ type: 'fun_fact' as const, content: match.fun_fact, index: -1 });
    if (match.perfect_first_date?.trim()) funQuestions.push({ type: 'perfect_first_date' as const, content: match.perfect_first_date, index: -1 });
    if (match.last_googled?.trim()) funQuestions.push({ type: 'last_googled' as const, content: match.last_googled, index: -1 });

    if (funQuestions.length > 0) {
      const idx = Math.floor(rand() * funQuestions.length);
      nonImageContent.push(funQuestions[idx]);
    }

    // If no images, show non-image content first, then placeholder
    if (imageSlides.length === 0) {
      if (nonImageContent.length > 0) {
        const shuffled = seededShuffle(nonImageContent);
        return [ ...shuffled, { type: 'placeholder' as const, content: '', index: -1 } ];
      }
      return [{ type: 'placeholder' as const, content: '', index: -1 }];
    }

    // Mix images with non-image content deterministically
    const mixedSlides: Array<any> = [];
    mixedSlides.push(imageSlides[0]); // always start with first image

    const shuffledNonImage = seededShuffle(nonImageContent);
    let nonImageIndex = 0;

    for (let i = 1; i < imageSlides.length; i++) {
      // Decide deterministically whether to insert non-image content (30% chance)
      if (nonImageIndex < shuffledNonImage.length && rand() > 0.3) {
        mixedSlides.push(shuffledNonImage[nonImageIndex]);
        nonImageIndex++;
      }
      mixedSlides.push(imageSlides[i]);
    }

    // Append any remaining non-image content
    while (nonImageIndex < shuffledNonImage.length) {
      mixedSlides.push(shuffledNonImage[nonImageIndex]);
      nonImageIndex++;
    }

    return mixedSlides;
  }, [JSON.stringify(match), userImages]);

  // Use lightweight static edge color instead of expensive pixel scanning
  const edgeColor = '#f6f6f6';

  // Ensure each new card starts at the first slide.
  // Reset currentSlide whenever the match changes (use match.id for stability).
  useEffect(() => {
    setCurrentSlide(0);
  }, [match.id]);

  // If slides array shrinks (images load/unload), clamp currentSlide to valid range.
  useEffect(() => {
    if (currentSlide > Math.max(0, slides.length - 1)) {
      setCurrentSlide(Math.max(0, slides.length - 1));
    }
  }, [slides.length]);

  const handleSlideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    
    if (clickX < width / 2) {
      // Left side - previous slide
      setCurrentSlide(prev => (prev > 0 ? prev - 1 : prev));
    } else {
      // Right side - next slide
      setCurrentSlide(prev => (prev < slides.length - 1 ? prev + 1 : prev));
    }
  };
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

  const reportReasons = [
    "Inappropriate content",
    "Nudity or sexual content", 
    "Spam or fake profile",
    "Harassment or bullying",
    "Violence or threats",
    "Other"
  ];

  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (showReportModal) {
      // Prevent scrolling when modal is open
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      // Re-enable scrolling when modal is closed
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }

    // Cleanup function to restore scrolling
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [showReportModal]);

  // Handle report submit
  const handleReportImage = async () => {
    if (!selectedReason) {
      setReportError("Please select a reason for reporting");
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
    } catch (err: any) {
      setReportError(err.message || "Failed to report image");
    } finally {
      setReporting(false);
    }
  };

  // Reset modal state when closing
  const closeReportModal = () => {
    setShowReportModal(false);
    setSelectedReason("");
    setReportError("");
  };

  // Handle split rendering modes
  if (isSwipeAreaOnly) {
    // Render only the swipeable image area
    return (
  <div className="relative w-full h-full min-h-full overflow-hidden">
        {/* Image/Bio Container - Swipeable Area Only */}
        <div className="relative w-full h-full overflow-hidden" onClick={handleSlideClick}>
          {/* Current slide content */}
          {slides.length > 0 && (
            <div className="w-full h-full transition-all duration-300 ease-in-out">
              {/* Report button for image slides - positioned closer to top edge */}
              {slides[currentSlide]?.type === 'image' && (
                <div className="absolute right-3 top-9 sm:top-6 z-50">
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
              {slides[currentSlide]?.type === 'image' ? (
                <div className="relative w-full h-full bg-gray-900">
                  {imageLoading && (
                    <div className="absolute inset-0 bg-gray-900 flex items-center justify-center z-10">
                      <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
                    </div>
                  )}
                  {(() => {
                    const url = slides[currentSlide].content;
                    const full = getOptimizedUrl(url);
                    const status = imageStatus?.[url] || 'idle';

                    return (
                      <img
                        src={full}
                        alt={`${match.first_name} ${match.last_name}`}
                        className={`w-full h-full object-contain transition-opacity duration-300 relative z-10 ${styles.optimizedImage}`}
                        draggable={false}
                        onLoadStart={() => setImageLoading(true)}
                        onLoad={() => setImageLoading(false)}
                        onError={() => setImageLoading(false)}
                      />
                    );
                  })()}
                </div>
              ) : slides[currentSlide]?.type === 'bio' ? (
                <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center p-8`}>
                  <div className="max-w-sm mx-auto text-center">
                    <div className="flex items-center justify-center mb-6">
                      <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 shadow-lg">
                        <Quote className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-6">About {match.first_name}</h3>
                    <p className="text-white text-lg leading-relaxed font-medium">
                      {slides[currentSlide].content}
                    </p>
                  </div>
                </div>
              ) : slides[currentSlide]?.type === 'fun_fact' ? (
                <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center p-8`}>
                  <div className="max-w-sm mx-auto text-center">
                    <div className="flex items-center justify-center mb-6">
                      <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 shadow-lg">
                        <Heart className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-6">Fun Fact</h3>
                    <p className="text-white text-lg leading-relaxed font-medium">
                      {slides[currentSlide].content}
                    </p>
                  </div>
                </div>
              ) : slides[currentSlide]?.type === 'perfect_first_date' ? (
                <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center p-8`}>
                  <div className="max-w-sm mx-auto text-center">
                    <div className="flex items-center justify-center mb-6">
                      <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 shadow-lg">
                        <Coffee className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-6">Perfect First Date</h3>
                    <p className="text-white text-lg leading-relaxed font-medium">
                      {slides[currentSlide].content}
                    </p>
                  </div>
                </div>
              ) : slides[currentSlide]?.type === 'last_googled' ? (
                <div className={`w-full h-full ${userBackgroundColor} flex items-center justify-center p-8`}>
                  <div className="max-w-sm mx-auto text-center">
                    <div className="flex items-center justify-center mb-6">
                      <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 shadow-lg">
                        <Search className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-6">Last Googled</h3>
                    <p className="text-white text-lg leading-relaxed font-medium">
                      {slides[currentSlide].content}
                    </p>
                  </div>
                </div>
              ) : (
                // Fallback for no images - show placeholder with initials
                <div className="w-full h-full min-h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
                  <div className="text-center w-full">
                    <div className="bg-white/80 rounded-full p-8 mb-4 shadow-xl mx-auto">
                      <User className="w-16 h-16 mx-auto text-gray-500" />
                      <style>{`
                        .centered-user-icon {
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          margin: 0 auto;
                          box-sizing: border-box;
                          max-width: 96px;
                          max-height: 96px;
                          padding: 1.5rem;
                          background: rgba(255,255,255,0.8);
                          border-radius: 9999px;
                          box-shadow: 0 8px 32px 0 rgba(0,0,0,0.18);
                        }
                      `}</style>
                      <div className="centered-user-icon">
                        <User className="w-16 h-16 mx-auto text-gray-500" />
                      </div>
                    </div>
                    <span className="text-6xl font-bold text-gray-700 bg-white/50 rounded-full px-6 py-3">
                      {match.first_name?.[0]}{match.last_name?.[0]}
                    </span>
                    <p className="text-gray-600 mt-4 text-sm">No photos uploaded yet</p>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Slide indicators */}
          {slides.length > 1 && (
            <div className="absolute top-9 left-4 flex space-x-2 z-10">
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

          {/* Optimized Adinkra glow effect */}
          {match.adinkra_symbols && match.adinkra_symbols.length > 0 && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 z-10">
              <div className="relative flex flex-col items-center">
                {/* Single optimized glow layer */}
                <div className="relative w-24 h-24 flex items-center justify-center overflow-visible">
                  {/* Single efficient gradient layer */}
                  <div
                    className="absolute inset-0 w-full h-full"
                    style={{
                      background: 'radial-gradient(circle at center, rgba(247, 144, 80, 0.25), transparent 90%)',
                      filter: 'blur(10px)',
                    }}
                  ></div>

                  {/* Adinkra Symbol */}
                  <div className="relative z-10">
                    <UserAdinkraDisplay adinkraSymbols={match.adinkra_symbols} />
                  </div>
                </div>
              </div>
            </div>
          )}

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
                    
                    <h3 className="text-xl font-bold text-red-600 pr-8">Report Image</h3>
                  </div>

                  {/* Modal content */}
                  <div className="px-6 pb-6 max-h-96 overflow-y-auto">
                    {reportSuccess ? (
                      <div className="text-green-600 font-semibold text-center py-8">
                        <div className="mb-2 text-2xl">✓</div>
                        <div>Reported! Thank you.</div>
                      </div>
                    ) : (
                      <>
                        <p className="text-gray-700 mb-4 text-sm font-semibold">Please select a reason for reporting this image:</p>
                        
                        {/* Reason selection with stable layout */}
                        <div className="space-y-3 mb-6">
                          {reportReasons.map((reason) => (
                            <button
                              key={reason}
                              onClick={() => setSelectedReason(reason)}
                              disabled={reporting}
                              className={`w-full h-12 px-4 text-left rounded-lg border-2 transition-all duration-200 flex items-center justify-between ${
                                selectedReason === reason
                                  ? 'border-red-500 bg-red-50 text-red-700'
                                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                              } ${reporting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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

                        {/* Action buttons with stable height */}
                        <div className="space-y-3">
                          <button
                            className="w-full h-12 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            onClick={handleReportImage}
                            disabled={reporting || !selectedReason}
                          >
                            {reporting ? 'Reporting...' : 'Report Image'}
                          </button>
                          
                          <button
                            className="w-full h-12 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            onClick={closeReportModal}
                            disabled={reporting}
                          >
                            Cancel
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
                <h4 className="font-semibold text-pink-600 mb-1">About</h4>
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
                <h4 className="font-semibold text-pink-600 mb-2">Lifestyle</h4>
                <div className="space-y-2">
                  {match.smoking && match.smoking !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="font-semibold mr-2">Smoking:</span>
                      <span className="text-gray-700">{match.smoking}</span>
                    </div>
                  )}
                  {match.drinking && match.drinking !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="font-semibold mr-2">Drinking:</span>
                      <span className="text-gray-700">{match.drinking}</span>
                    </div>
                  )}
                  {match.exercise_level && match.exercise_level !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="font-semibold mr-2">Exercise:</span>
                      <span className="text-gray-700">{match.exercise_level}</span>
                    </div>
                  )}
                  {match.sleeping_schedule && match.sleeping_schedule !== 'not_specified' && (
                    <div className="flex items-center text-sm">
                      <span className="font-semibold mr-2">Sleep:</span>
                      <span className="text-gray-700">{match.sleeping_schedule}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Work & Education */}
            {(match.occupation || match.education_level) && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-semibold text-pink-600 mb-2">Work & Education</h4>
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
                <h4 className="font-semibold text-pink-600 mb-3">Personality</h4>
                <div className="space-y-4">
                  {typeof match.introvert_extrovert === 'number' && (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">Introvert</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full ${styles.dynamicWidth}`}
                          style={{ width: `${match.introvert_extrovert}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-500">Extrovert</span>
                    </div>
                  )}
                  {typeof match.spontaneous_planner === 'number' && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-600">Spontaneous vs Planner: {match.spontaneous_planner}%</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">Spontaneous</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full ${styles.dynamicWidth}`}
                            style={{ width: `${match.spontaneous_planner}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-500">Planner</span>
                      </div>
                    </div>
                  )}
                  {typeof match.messy_organized === 'number' && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-600">Messy vs Organized: {match.messy_organized}%</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">Messy</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full ${styles.dynamicWidth}`}
                            style={{ width: `${match.messy_organized}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-500">Organized</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Interests */}
            {match.interests?.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-semibold text-pink-600 mb-2">Interests</h4>
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

export default MatchCard;
