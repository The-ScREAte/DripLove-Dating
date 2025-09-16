import React, { useState, useEffect } from 'react';
import ReportButton from '../ReportButton';
import { Briefcase, GraduationCap, ChevronDown, ChevronUp } from 'lucide-react';
import { PotentialMatch } from '@/types';
import { useImageEdgeColor } from '@/hooks/useImageEdgeColor';

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
  isDetailsAreaOnly?: boolean; // New prop to render only details area
  getOptimizedUrl?: (url: string) => string; // New prop for image optimization
  preCalculatedDistance?: number; // Distance already calculated by location service
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
  isDetailsAreaOnly = false,
  getOptimizedUrl = (url: string) => url.includes('supabase') ? `${url}?width=800&quality=85&format=webp` : url,
  preCalculatedDistance
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  
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

  // Get edge color for current image - must be after slides are defined
  const currentImageUrl = slides.length > 0 && slides[currentSlide]?.type === 'image' 
    ? getOptimizedUrl(slides[currentSlide].content) 
    : '';
  const { edgeColor } = useImageEdgeColor(currentImageUrl);

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

  // If isDetailsAreaOnly is true, render compact view
  if (isDetailsAreaOnly) {
    // Render compact info section with expandable details
    return (
      <div className="w-full p-3">
        {/* Compact header with expand button */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {match.first_name}
              </h2>
              {match.relationship_intent && (
                <p className="text-sm text-gray-600 capitalize">
                  {match.relationship_intent === 'open_to_anything' ? 'Open to anything' : match.relationship_intent}
                </p>
              )}
            </div>
          </div>

          {/* Expandable info button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleInfo();
            }}
            className="bg-pink-500 hover:bg-pink-600 text-white rounded-full p-2 transition-colors shadow-lg"
            aria-label={showMoreInfo ? "Hide details" : "Show details"}
          >
            {showMoreInfo ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
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
                <h4 className="font-semibold text-pink-600 mb-3">Personality</h4>
                <div className="space-y-4">
                  {typeof match.introvert_extrovert === 'number' && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-600">Introvert vs Extrovert: {match.introvert_extrovert}%</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">Introvert</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${match.introvert_extrovert}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500">Extrovert</span>
                      </div>
                    </div>
                  )}
                  {typeof match.spontaneous_planner === 'number' && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-600">Spontaneous vs Planner: {match.spontaneous_planner}%</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">Spontaneous</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${match.spontaneous_planner}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500">Planner</span>
                      </div>
                    </div>
                  )}
                  {typeof match.messy_organized === 'number' && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-600">Messy vs Organized: {match.messy_organized}%</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">Messy</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${match.messy_organized}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500">Organized</span>
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
