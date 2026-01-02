
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, MessageCircle, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ProfileSummaryCardProps {
  currentUser: any;
}

const ProfileSummaryCard = ({ currentUser }: ProfileSummaryCardProps) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    totalMatches: 0,
    activeChats: 0,
    totalLikes: 0
  });

  useEffect(() => {
    if (currentUser?.id) {
      fetchUserStats();
    }
  }, [currentUser]);

  // ⭐ Realtime subscription to update stats when likes are added
  useEffect(() => {
    if (!currentUser?.id) return;

    // Subscribe to likes table changes for this user
    const likesChannel = supabase
      .channel(`profile-stats-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'likes',
          filter: `liker_id=eq.${currentUser.id}`,
        },
        () => {
          // Refresh stats when a new like is added
          fetchUserStats();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'matches',
          filter: `user1_id=eq.${currentUser.id}`,
        },
        () => {
          // Refresh stats when a new match is added
          fetchUserStats();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'matches',
          filter: `user2_id=eq.${currentUser.id}`,
        },
        () => {
          // Refresh stats when a new match is added
          fetchUserStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(likesChannel);
    };
  }, [currentUser?.id]);

  const fetchUserStats = async () => {
    if (!currentUser?.id) return;

    try {
      // Fetch total matches
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select('id')
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);

      if (matchesError) throw matchesError;

      // Fetch active chats (matches with recent messages)
      const { data: activeChats, error: chatsError } = await supabase
        .from('matches')
        .select(`
          id,
          chats!inner(id, created_at)
        `)
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
        .gte('chats.created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (chatsError) throw chatsError;

      // Fetch total likes given
      const { data: likes, error: likesError } = await supabase
        .from('likes')
        .select('id')
        .eq('liker_id', currentUser.id);

      if (likesError) throw likesError;

      setStats({
        totalMatches: matches?.length || 0,
        activeChats: activeChats?.length || 0,
        totalLikes: likes?.length || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <Card className="shadow-lg border-pink-200 w-full">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-pink-600" />
            <span>{t('profile.yourDripLoveSummary')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-2">
              <div className="flex justify-center">
                <Heart className="w-6 h-6 text-red-500" />
              </div>
              <div className="text-2xl font-bold text-red-500">{stats.totalMatches}</div>
              <p className="text-xs text-gray-600">{t('profile.totalMatches')}</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-center">
                <MessageCircle className="w-6 h-6 text-blue-500" />
              </div>
              <div className="text-2xl font-bold text-blue-500">{stats.activeChats}</div>
              <p className="text-xs text-gray-600">{t('profile.activeChats')}</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-center">
                <Users className="w-6 h-6 text-purple-500" />
              </div>
              <div className="text-2xl font-bold text-purple-500">{stats.totalLikes}</div>
              <p className="text-xs text-gray-600">{t('profile.likesGiven')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfileSummaryCard;
