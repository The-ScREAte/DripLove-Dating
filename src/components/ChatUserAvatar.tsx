
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { preloadImageToBlob } from '@/utils/imageCache';
import { getPlatformSync } from '@/utils/platformUtils';
import { cacheAvatar, getCachedAvatar } from '@/cache/chatCache';

interface ChatUserAvatarProps {
  userId: string;
  firstName?: string;
  lastName?: string;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'custom';
  className?: string;
}

const ChatUserAvatar = ({ userId, firstName = '', lastName = '', onClick, size = 'md', className }: ChatUserAvatarProps) => {
  const [profileImage, setProfileImage] = useState<string | null>(null);
  
  // ⭐ Memoize platform detection (prevents 100+ calls in chat lists)
  const platform = useMemo(() => getPlatformSync(), []);

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10', 
    lg: 'h-12 w-12',
    custom: '' // Allow custom sizing via className
  };

  // ⭐ Prevent Android from using raw URLs (forces blob cache)
  const getSafeImageSrc = useCallback((url?: string | null) => {
    if (!url) return "";
    if (url.startsWith("blob:")) return url;
    if (platform === "android") return ""; // block raw URLs on Android
    return url; // iOS/Web OK
  }, [platform]);

  useEffect(() => {
    if (!userId) return;

    // ⭐ 1. Check global cache first (instant load across all routes)
    const cachedBlobUrl = getCachedAvatar(userId);
    if (cachedBlobUrl) {
      setProfileImage(cachedBlobUrl);
      return;
    }

    // ⭐ 2. Fetch and preload image as blob URL
    const loadImage = async () => {
      try {
        const { data: images, error } = await supabase
          .from('user_images')
          .select('image_url, is_approved')
          .eq('user_id', userId)
          .eq('is_approved', true)
          .order('image_order', { ascending: true })
          .limit(1);

        if (error) {
          // Only log actual errors, not missing table errors
          if (!error.message.includes('does not exist') && !error.message.includes('relation')) {
            // ...removed log...
          }
          return;
        }

        if (images && images.length > 0) {
          const imageUrl = images[0].image_url;

          // ⭐ Convert to blob URL → FASTEST on Android
          const blobUrl = await preloadImageToBlob(imageUrl);

          if (blobUrl) {
            cacheAvatar(userId, blobUrl); // Store in global cache
            setProfileImage(blobUrl);
          }
        }
      } catch (error) {
        // ...removed log...
      }
    };

    loadImage();
  }, [userId]);

  const getInitials = () => {
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
  };

  return (
    <Avatar 
      className={`${sizeClasses[size]} ${className || ''} ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all' : ''}`}
      onClick={onClick}
    >
      <AvatarImage
        src={getSafeImageSrc(profileImage)}
        alt={`${firstName} ${lastName}`}
        className="h-full w-full object-cover"
      />
      <AvatarFallback className="bg-blue-100 text-blue-700 font-medium">
        {getInitials()}
      </AvatarFallback>
    </Avatar>
  );
};

// ⭐ Prevent unnecessary re-renders (critical for chat lists with 100+ avatars)
export default React.memo(ChatUserAvatar);
