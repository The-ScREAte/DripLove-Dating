import React, { useState } from 'react';
import { MapPin, Briefcase, GraduationCap, Calendar, Crown, Shield, ChevronDown, ChevronUp, User, Quote, Heart, Coffee, Search } from 'lucide-react';
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
  isDetailsAreaOnly = false
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  
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
  const slides = React.useMemo(() => {
    const imageSlides = userImages.map((image, index) => ({
      type: 'image' as const,
      content: image,
      index
    }));
    
    // Collect all non-image content
    const nonImageContent = [];
    
    if (match.bio?.trim()) {
      nonImageContent.push({
        type: 'bio' as const,
        content: match.bio,
        index: -1
      });
    }
    
    // Select only one random fun question
    const funQuestions = [
      match.fun_fact?.trim() && {
        type: 'fun_fact' as const,
        content: match.fun_fact,
        index: -1
      },
      match.perfect_first_date?.trim() && {
        type: 'perfect_first_date' as const,
        content: match.perfect_first_date,
        index: -1
      },
      match.last_googled?.trim() && {
        type: 'last_googled' as const,
        content: match.last_googled,
        index: -1
      }
    ].filter(Boolean);
    
    // Add only one random fun question if any exist
    if (funQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * funQuestions.length);
      nonImageContent.push(funQuestions[randomIndex]);
    }
    
    // If no images, show non-image content first, then placeholder
    if (imageSlides.length === 0) {
      if (nonImageContent.length > 0) {
        const shuffled = nonImageContent.sort(() => Math.random() - 0.5);
        return [...shuffled, {
          type: 'placeholder' as const,
          content: '',
          index: -1
        }];
      }
      return [{
        type: 'placeholder' as const,
        content: '',
        index: -1
      }];
    }
    
    // Mix images with non-image content
    const mixedSlides = [];
    
    // Always start with first image
    mixedSlides.push(imageSlides[0]);
    
    // Shuffle non-image content
    const shuffledNonImage = nonImageContent.sort(() => Math.random() - 0.5);
    
    // Interleave remaining images with non-image content
    let nonImageIndex = 0;
    
    for (let i = 1; i < imageSlides.length; i++) {
      // Add non-image content between images if available
      if (nonImageIndex < shuffledNonImage.length && Math.random() > 0.3) {
        mixedSlides.push(shuffledNonImage[nonImageIndex]);
        nonImageIndex++;
      }
      
      // Add the image
      mixedSlides.push(imageSlides[i]);
    }
    
    // Add any remaining non-image content at the end
    while (nonImageIndex < shuffledNonImage.length) {
      mixedSlides.push(shuffledNonImage[nonImageIndex]);
      nonImageIndex++;
    }
    
    return mixedSlides;
  }, [userImages, match.bio, match.fun_fact, match.perfect_first_date, match.last_googled]);

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
      <div className="relative w-full h-full overflow-hidden">
        {/* Image/Bio Container - Swipeable Area Only */}
        <div className="relative w-full h-full overflow-hidden" onClick={handleSlideClick}>
          {/* Current slide content */}
          {slides.length > 0 && (
            <div className="w-full h-full transition-all duration-300 ease-in-out">
              {/* Report button for image slides - positioned sticky in top right */}
              {slides[currentSlide]?.type === 'image' && (
                <div className="absolute right-3 top-16 z-50 flex flex-col items-end">
                  <button
                    className="bg-white/95 hover:bg-red-100 text-red-600 rounded-full p-1 shadow-lg transition-all duration-200 border border-red-200 focus:outline-none focus:ring-2 focus:ring-red-300 hover:scale-105"
                    style={{backdropFilter: 'blur(8px)', width: 28, height: 28, minWidth: 28, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center'}} 
                    onClick={e => { e.stopPropagation(); setShowReportModal(true); }}
                    aria-label="Report image"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>
              )}
              {slides[currentSlide]?.type === 'image' ? (
                <img
                  src={slides[currentSlide].content}
                  alt={`${match.first_name} ${match.last_name}`}
                  className="w-full h-full object-contain bg-black transition-opacity duration-300"
                  draggable={false}
                />
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
                <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center transition-all duration-300">
                  <div className="text-center">
                    <div className="bg-white/80 rounded-full p-8 mb-4 shadow-xl">
                      <User className="w-16 h-16 mx-auto text-gray-500" />
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
            <div className="absolute top-4 left-4 right-4 flex space-x-1 z-10">
              {slides.map((_, index) => (
                <div
                  key={index}
                  className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                    index === currentSlide 
                      ? 'bg-white shadow-lg' 
                      : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Report Modal */}
          {showReportModal && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={closeReportModal}>
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 mx-4 relative transform-none" onClick={e => e.stopPropagation()} style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)'}}>
                {/* Close X button */}
                <button
                  onClick={closeReportModal}
                  className="absolute top-4 right-4 w-6 h-6 text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center"
                  disabled={reporting}
                  style={{minWidth: '24px', minHeight: '24px'}} 
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <h3 className="text-xl font-bold mb-4 text-red-600 pr-8">Report Image</h3>
                
                {reportSuccess ? (
                  <div className="text-green-600 font-semibold text-center py-8">
                    <div className="mb-2">✓</div>
                    <div>Reported! Thank you.</div>
                  </div>
                ) : (
                  <>
                    {/* Sticky reason select header */}
                    <div className="sticky top-0 z-10 bg-white pb-2" style={{marginLeft: '-24px', marginRight: '-24px', paddingLeft: '24px', paddingRight: '24px'}}>
                      <p className="text-gray-700 mb-2 text-sm font-semibold">Please select a reason for reporting this image:</p>
                    </div>
                    {/* Reason selection - visually stable, no shake */}
                    <div className="space-y-2 mb-6">
                      {reportReasons.map((reason) => (
                        <button
                          key={reason}
                          onClick={() => setSelectedReason(reason)}
                          disabled={reporting}
                          className={`w-full text-left p-3 rounded-lg border-2 transition-colors duration-150 ${
                            selectedReason === reason
                              ? 'border-red-500 bg-red-50 text-red-700'
                              : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'
                          } ${reporting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          style={{minHeight: '48px', height: '48px', display: 'flex', alignItems: 'center', fontWeight: 500, fontSize: '15px', boxSizing: 'border-box'}}
                        >
                          <div className="flex items-center justify-between w-full" style={{width: '100%'}}>
                            <span className="text-sm font-medium" style={{width: '80%', whiteSpace: 'normal'}}>{reason}</span>
                            {selectedReason === reason && (
                              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{minWidth: '20px', minHeight: '20px'}}>
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-3">
                      <button
                        className="w-full bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
                        onClick={handleReportImage}
                        disabled={reporting || !selectedReason}
                        style={{minHeight: '48px', height: '48px'}} 
                      >
                        {reporting ? 'Reporting...' : 'Report Image'}
                      </button>
                      <button
                        className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
                        onClick={closeReportModal}
                        disabled={reporting}
                        style={{minHeight: '48px', height: '48px'}} 
                      >
                        Cancel
                      </button>
                    </div>
                    
                    {reportError && (
                      <div className="text-red-500 text-sm mt-3 text-center bg-red-50 p-2 rounded-lg">
                        {reportError}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isDetailsAreaOnly) {
    // Render only the non-swipeable details area
    return (
      <div className="w-full h-full">
        {/* Basic Info - Always shown */}
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-2xl font-bold text-gray-900">
                {match.first_name} {match.last_name}
              </h2>
              <span className="text-xl text-gray-600">
                {calculateAge(match.date_of_birth)}
              </span>
              {/* Verified badge beside name and age */}
              {isVerified && (
                <div className="bg-green-5 text-white px-2 py-1 rounded-full flex items-center text-xs font-semibold">
                  <Shield className="w-3 h-3 mr-1" />
                  Verified
                </div>
              )}
            </div>
            
            {match.city && (
              <div className="flex items-center mt-1 text-gray-600">
                <MapPin className="w-4 h-4 mr-1" />
                <span className="text-sm">
                  {match.city}, {match.country}
                  {currentUserLatitude && currentUserLongitude && match.latitude && match.longitude && (
                    <span className="ml-2">
                      • {Math.round(calculateDistance(
                        currentUserLatitude,
                        currentUserLongitude,
                        match.latitude,
                        match.longitude
                      ))} km away
                    </span>
                  )}
                </span>
              </div>
            )}
            
            {match.relationship_intent && (
              <div className="flex items-center mt-1 text-gray-600">
                <Heart className="w-4 h-4 mr-1" />
                <span className="text-sm capitalize">
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
            className="bg-pink-500 hover:bg-pink-600 text-white rounded-full p-3 transition-colors shadow-lg"
            aria-label={showMoreInfo ? "Hide details" : "Show details"}
          >
            {showMoreInfo ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Expandable details - appears below basic info */}
        {showMoreInfo && (
          <div className="mt-4 space-y-3 text-sm">
            {/* About (Bio) */}
            {match.bio && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-semibold text-pink-600 mb-1">About</h4>
                <p className="text-gray-700 text-xs leading-relaxed">{match.bio}</p>
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
                    <div className="flex items-center text-xs">
                      <span className="font-semibold mr-2">Smoking:</span>
                      <span className="text-gray-700">{match.smoking}</span>
                    </div>
                  )}
                  {match.drinking && match.drinking !== 'not_specified' && (
                    <div className="flex items-center text-xs">
                      <span className="font-semibold mr-2">Drinking:</span>
                      <span className="text-gray-700">{match.drinking}</span>
                    </div>
                  )}
                  {match.exercise_level && match.exercise_level !== 'not_specified' && (
                    <div className="flex items-center text-xs">
                      <span className="font-semibold mr-2">Exercise:</span>
                      <span className="text-gray-700">{match.exercise_level}</span>
                    </div>
                  )}
                  {match.sleeping_schedule && match.sleeping_schedule !== 'not_specified' && (
                    <div className="flex items-center text-xs">
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
                    <div className="flex items-center text-xs">
                      <Briefcase className="w-3 h-3 mr-2 flex-shrink-0 text-pink-500" />
                      <span className="text-gray-700">{match.occupation}</span>
                    </div>
                  )}
                  {match.education_level && (
                    <div className="flex items-center text-xs">
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
                <h4 className="font-semibold text-pink-600 mb-2">Personality</h4>
                <div className="space-y-2">
                  {typeof match.introvert_extrovert === 'number' && (
                    <div className="flex items-center text-xs">
                      <span className="font-semibold mr-2">Introvert/Extrovert:</span>
                      <span className="text-gray-700">{match.introvert_extrovert}</span>
                    </div>
                  )}
                  {typeof match.spontaneous_planner === 'number' && (
                    <div className="flex items-center text-xs">
                      <span className="font-semibold mr-2">Spontaneous/Planner:</span>
                      <span className="text-gray-700">{match.spontaneous_planner}</span>
                    </div>
                  )}
                  {typeof match.messy_organized === 'number' && (
                    <div className="flex items-center text-xs">
                      <span className="font-semibold mr-2">Messy/Organized:</span>
                      <span className="text-gray-700">{match.messy_organized}</span>
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
                      className="px-2 py-1 bg-pink-100 text-pink-700 rounded-full text-xs"
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
};

export default MatchCard;
