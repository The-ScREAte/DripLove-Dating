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
  swipeDistance
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

  return (
    <div
      className="relative w-full h-full bg-white rounded-xl shadow-lg overflow-hidden transition-transform duration-200"
      style={{ transform: getSwipeTransform() }}
    >
      {/* Swipe Indicator Overlay */}
      {swipeDirection && Math.abs(swipeDistance) > 50 && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center text-white text-6xl font-bold"
          style={{ backgroundColor: getSwipeColor() }}
        >
          {swipeDirection === 'right' ? '❤️' : '✗'}
        </div>
      )}

      {/* Image/Bio Container */}
      <div className={`relative ${showMoreInfo ? 'h-[65%]' : 'h-[75%]'} overflow-hidden transition-all duration-300`} onClick={handleSlideClick}>
        {/* Current slide content */}
        {slides.length > 0 && (
          <div className="w-full h-full transition-all duration-300 ease-in-out">
            {slides[currentSlide]?.type === 'image' ? (
              <img
                src={slides[currentSlide].content}
                alt={`${match.first_name} ${match.last_name}`}
                className="w-full h-full object-cover transition-opacity duration-300"
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
                  index === currentSlide ? 'bg-white shadow-lg' : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        )}

        {/* Premium badge */}
        {isPremium && (
          <div className="absolute top-4 right-4 bg-yellow-500 text-white p-2 rounded-full shadow-lg z-10">
            <Crown className="w-4 h-4" />
          </div>
        )}

        {/* Verified badge */}
        {/* Moved to beside name and age in user info section */}

        {/* Navigation hints */}
        {slides.length > 1 && (
          <>
            {/* Left navigation area */}
            <div className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 pointer-events-none">
              {currentSlide > 0 && (
                <div className="bg-black/40 text-white rounded-full p-2 backdrop-blur-sm shadow-lg animate-pulse">
                  <ChevronUp className="w-5 h-5 transform -rotate-90" />
                </div>
              )}
            </div>
            
            {/* Right navigation area */}
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10 pointer-events-none">
              {currentSlide < slides.length - 1 && (
                <div className="bg-black/40 text-white rounded-full p-2 backdrop-blur-sm shadow-lg animate-pulse">
                  <ChevronUp className="w-5 h-5 transform rotate-90" />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* User Info Section */}
      <div className={`${showMoreInfo ? 'h-[35%]' : 'h-[25%]'} bg-white flex flex-col min-h-[120px] transition-all duration-300`}>
        {/* Basic user info - always visible */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold text-gray-800">
                {match.first_name} {match.last_name}
              </h2>
              <span className="text-lg text-gray-600">
                {calculateAge(match.date_of_birth)}
              </span>
              {/* Verified badge beside name and age */}
              {isVerified && (
                <div className="bg-green-500 text-white px-2 py-1 rounded-full flex items-center text-xs font-semibold">
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
          <div className="flex-1 bg-gray-50 border-t border-gray-200 overflow-y-auto">
            <div className="p-4 space-y-3 text-sm">
              {/* Bio */}
              {match.bio && (
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <h4 className="font-semibold text-pink-600 mb-1">About</h4>
                  <p className="text-gray-700 text-xs leading-relaxed">{match.bio}</p>
                </div>
              )}

              {/* Work & Education */}
              {(match.occupation || match.education_level) && (
                <div className="bg-white rounded-lg p-3 shadow-sm">
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

              {/* Interests */}
              {match.interests?.length > 0 && (
                <div className="bg-white rounded-lg p-3 shadow-sm">
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
          </div>
        )}
      </div>

    </div>
  );
};

export default MatchCard;
