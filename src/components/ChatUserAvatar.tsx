
import React, { useState, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';

interface ChatUserAvatarProps {
  userId: string;
  firstName?: string;
  lastName?: string;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

const ChatUserAvatar = ({ userId, firstName = '', lastName = '', onClick, size = 'md' }: ChatUserAvatarProps) => {
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10', 
    lg: 'h-12 w-12'
  };

  useEffect(() => {
    fetchProfileImage();
  }, [userId]);

  const fetchProfileImage = async () => {
    try {
      const { data: images, error } = await supabase
        .from('user_images')
        .select('image_url')
        .eq('user_id', userId)
        .order('image_order', { ascending: true })
        .limit(1);

      if (error) {
        console.error('Error fetching profile image:', error);
        return;
      }

      if (images && images.length > 0) {
        setProfileImage(images[0].image_url);
      }
    } catch (error) {
      console.error('Error fetching profile image:', error);
    }
  };

  const getInitials = () => {
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
  };

  return (
    <Avatar 
      className={`${sizeClasses[size]} ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-pink-400 transition-all' : ''}`}
      onClick={onClick}
    >
<AvatarImage
  src={profileImage || ''}
  alt={`${firstName} ${lastName}`}
  className="h-full w-full object-cover"
/>
      <AvatarFallback className="bg-pink-100 text-pink-700 font-medium">
        {getInitials()}
      </AvatarFallback>
    </Avatar>
  );
};

export default ChatUserAvatar;
