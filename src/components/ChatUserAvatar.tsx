
import React, { useState, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';

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

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10', 
    lg: 'h-12 w-12',
    custom: '' // Allow custom sizing via className
  };

  useEffect(() => {
    if (userId) {
      fetchProfileImage();
    }
  }, [userId]);

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

      if (error) {
        // Only log actual errors, not missing table errors
        if (!error.message.includes('does not exist') && !error.message.includes('relation')) {
          // ...removed log...
        }
        return;
      }

      if (images && images.length > 0) {
        setProfileImage(images[0].image_url);
      }
    } catch (error) {
  // ...removed log...
    }
  };

  const getInitials = () => {
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
  };

  return (
    <Avatar 
      className={`${sizeClasses[size]} ${className || ''} ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all' : ''}`}
      onClick={onClick}
    >
<AvatarImage
  src={profileImage || ''}
  alt={`${firstName} ${lastName}`}
  className="h-full w-full object-cover"
/>
      <AvatarFallback className="bg-blue-100 text-blue-700 font-medium">
        {getInitials()}
      </AvatarFallback>
    </Avatar>
  );
};

export default ChatUserAvatar;
