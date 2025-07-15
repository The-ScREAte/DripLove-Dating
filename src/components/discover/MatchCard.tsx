import React from 'react';
import { MapPin, Briefcase, GraduationCap, Calendar, Crown } from 'lucide-react';
import { PotentialMatch } from '@/types';

interface MatchCardProps {
  match: PotentialMatch;
  imageIndex: number;
  showMoreInfo: boolean;
  isPremium: boolean;
  currentUserLatitude?: number;
  currentUserLongitude?: number;
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
  currentUserLatitude,
  currentUserLongitude,
  onImageClick,
  onToggleInfo,
  calculateAge,
  calculateDistance,
  swipeDirection,
  swipeDistance
}) => {
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

      {/* Image Container */}
      <div className="relative h-3/4 overflow-hidden" onClick={onImageClick}>
        <img
          src={match.images?.[imageIndex] || '/placeholder.svg'}
          alt={`${match.first_name} ${match.last_name}`}
          className="w-full h-full object-cover"
        />
        
        {/* Image indicators */}
        {match.images && match.images.length > 1 && (
          <div className="absolute top-4 left-4 right-4 flex space-x-1 z-10">
            {match.images.map((_, index) => (
              <div
                key={index}
                className={`flex-1 h-1 rounded-full ${
                  index === imageIndex ? 'bg-white' : 'bg-white/30'
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

        {/* Basic info overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                {match.first_name} {match.last_name}
              </h2>
              <p className="text-lg opacity-90">
                {calculateAge(match.date_of_birth)} years old
              </p>
              {match.city && (
                <div className="flex items-center mt-1">
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleInfo();
              }}
              className="bg-white/20 backdrop-blur-sm rounded-full p-2 hover:bg-white/30 transition-colors"
              aria-label={showMoreInfo ? "Hide details" : "Show details"}
            >
              <span className="text-2xl">ℹ️</span>
            </button>
          </div>
        </div>
      </div>

      {/* More Info Section */}
      {showMoreInfo && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-end z-10">
          <div
            className="w-full p-6 space-y-4 text-white max-h-full overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {match.bio && (
              <div>
                <h3 className="font-semibold mb-1 text-sm">About</h3>
                <p className="text-xs leading-relaxed">{match.bio}</p>
              </div>
            )}

            {(match.occupation || match.education_level) && (
              <div className="space-y-2">
                {match.occupation && (
                  <div className="flex items-center text-xs">
                    <Briefcase className="w-3 h-3 mr-2 flex-shrink-0" />
                    <span>{match.occupation}</span>
                  </div>
                )}
                {match.education_level && (
                  <div className="flex items-center text-xs">
                    <GraduationCap className="w-3 h-3 mr-2 flex-shrink-0" />
                    <span>{match.education_level}</span>
                  </div>
                )}
              </div>
            )}

            {match.interests?.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 text-sm">Interests</h3>
                <div className="flex flex-wrap gap-1">
                  {match.interests.map((interest, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-white/20 rounded-full text-xs"
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
  );
};

export default MatchCard;
