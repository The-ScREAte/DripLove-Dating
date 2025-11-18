import React, { useState, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';

interface MatchExpirationAvatarProps {
  userId: string;
  matchId: string;
  matchCreatedAt: string;
  hasMessages: boolean;
  firstName?: string;
  lastName?: string;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const EXPIRATION_DAYS = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MatchExpirationAvatar = ({ 
  userId, 
  matchId,
  matchCreatedAt, 
  hasMessages,
  firstName = '', 
  lastName = '', 
  onClick, 
  size = 'md', 
  className 
}: MatchExpirationAvatarProps) => {
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [daysLeft, setDaysLeft] = useState<number>(EXPIRATION_DAYS);
  const [progress, setProgress] = useState<number>(0); // 0 to 1

  const sizeClasses = {
    sm: 'h-12 w-12',
    md: 'h-16 w-16', 
    lg: 'h-20 w-20',
  };

  // Circle dimensions - make it bigger than the avatar
  const circleSize = {
    sm: 60,  // Avatar is 48px (h-12), circle is 60px
    md: 80,  // Avatar is 64px (h-16), circle is 80px
    lg: 100, // Avatar is 80px (h-20), circle is 100px
  };

  const strokeWidth = {
    sm: 3,
    md: 4,
    lg: 5,
  };

  useEffect(() => {
    if (userId) {
      fetchProfileImage();
    }
  }, [userId]);

  useEffect(() => {
    if (hasMessages) {
      // If there are messages, no expiration countdown
      setDaysLeft(EXPIRATION_DAYS);
      setProgress(0);
      return;
    }

    const calculateTimeLeft = () => {
      const createdDate = new Date(matchCreatedAt);
      const now = new Date();
      const expirationDate = new Date(createdDate.getTime() + (EXPIRATION_DAYS * MS_PER_DAY));
      const timeLeft = expirationDate.getTime() - now.getTime();
      
      if (timeLeft <= 0) {
        // Match has expired
        return { daysLeft: 0, progress: 1 };
      }

      const daysRemaining = Math.ceil(timeLeft / MS_PER_DAY);
      const progressValue = 1 - (timeLeft / (EXPIRATION_DAYS * MS_PER_DAY));
      
      return { daysLeft: daysRemaining, progress: progressValue };
    };

    const updateCountdown = () => {
      const { daysLeft: remaining, progress: prog } = calculateTimeLeft();
      setDaysLeft(remaining);
      setProgress(prog);
    };

    updateCountdown();
    
    // Update every hour
    const interval = setInterval(updateCountdown, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [matchCreatedAt, hasMessages]);

  const fetchProfileImage = async () => {
    if (!userId) return;
    
    try {
      const { data: images, error } = await supabase
        .from('user_images')
        .select('image_url, is_approved')
        .eq('user_id', userId)
        .eq('is_approved', true)
        .order('image_order', { ascending: true })
        .limit(1);

      if (error) return;

      if (images && images.length > 0) {
        setProfileImage(images[0].image_url);
      }
    } catch (error) {
      // Silent fail
    }
  };

  const getInitials = () => {
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
  };

  // Calculate the stroke-dasharray for the circular progress
  const radius = size === 'sm' ? 26 : size === 'md' ? 36 : 46;
  const circumference = 2 * Math.PI * radius;
  
  // For the fill effect: when progress is 0 (day 1), we want FULL circle (dashoffset = 0)
  // when progress is 1 (day 8), we want EMPTY circle (dashoffset = circumference)
  const strokeDashoffset = hasMessages ? 0 : circumference * progress;

  // Pink color stays constant - it's the fill that reduces
  const borderColor = 'rgb(236, 72, 153)'; // Pink-500

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: circleSize[size], height: circleSize[size] }}>
      {/* SVG Circle - positioned behind the avatar */}
      <svg 
        className="absolute rotate-90"
        width={circleSize[size]}
        height={circleSize[size]}
        style={{ 
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
          zIndex: 0
        }}
      >
        {/* Background circle - subtle gray */}
        <circle
          cx={circleSize[size] / 2}
          cy={circleSize[size] / 2}
          r={radius}
          fill="none"
          stroke="rgba(200, 200, 200, 0.2)"
          strokeWidth={strokeWidth[size]}
        />
        
        {/* Progress fill circle - only show if no messages */}
        {!hasMessages && (
          <circle
            cx={circleSize[size] / 2}
            cy={circleSize[size] / 2}
            r={radius}
            fill="none"
            stroke={borderColor}
            strokeWidth={strokeWidth[size]}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.5s ease',
              willChange: 'stroke-dashoffset'
            }}
          />
        )}
        
        {/* Full circle for active chats */}
        {hasMessages && (
          <circle
            cx={circleSize[size] / 2}
            cy={circleSize[size] / 2}
            r={radius}
            fill="none"
            stroke={borderColor}
            strokeWidth={strokeWidth[size]}
          />
        )}
      </svg>
      
      {/* Avatar - positioned on top of the circle */}
      <Avatar 
        className={`${sizeClasses[size]} ${className || ''} ${onClick ? 'cursor-pointer' : ''}`}
        style={{ zIndex: 1, position: 'relative' }}
        onClick={onClick}
      >
        <AvatarImage
          src={profileImage || ''}
          alt={`${firstName} ${lastName}`}
          className="h-full w-full object-cover"
        />
        <AvatarFallback className="bg-gradient-to-br from-pink-100 to-purple-100 text-pink-700 font-bold text-lg">
          {getInitials()}
        </AvatarFallback>
      </Avatar>
    </div>
  );
};

export default MatchExpirationAvatar;
