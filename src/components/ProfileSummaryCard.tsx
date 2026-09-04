
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, MessageCircle, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type SwipePersistedEventDetail = { type: 'like' | 'pass'; delta?: number };

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
    // currentUser is a new object reference on most parent re-renders; depending on
    // currentUser.id (as the other effects below do) avoids refetching stats on every render.
  }, [currentUser?.id]);

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

  // Local event-based updates so stats change immediately even if Realtime WS is down
  useEffect(() => {
    if (!currentUser?.id) return;

    const onSwipePersisted = (event: Event) => {
      const custom = event as CustomEvent<SwipePersistedEventDetail>;
      const detail = custom?.detail;
      if (!detail) return;

      // Keep profile stats source-of-truth from DB to avoid optimistic drift on refresh.
      // (e.g., duplicate/replayed local events should not inflate Likes Given.)
      fetchUserStats();
    };

    window.addEventListener('swipePersisted', onSwipePersisted);
    return () => window.removeEventListener('swipePersisted', onSwipePersisted);
  }, [currentUser?.id]);

  const fetchUserStats = async () => {
    if (!currentUser?.id) return;

    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Drip Weekly: matches made in the last 7 days
      const { count: matchesCount } = await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
        .gte('created_at', sevenDaysAgo);

      const { data: matchesData } = await supabase
        .from('matches')
        .select('id')
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);

      // Count active chats by checking which matches have recent messages
      let activeChatsCount = 0;
      if (matchesData && matchesData.length > 0) {
        const { data: recentChats } = await supabase
          .from('chats')
          .select('match_id')
          .in('match_id', matchesData.map(m => m.id))
          .gte('created_at', sevenDaysAgo);

        if (recentChats) {
          // Count unique match IDs with recent messages
          activeChatsCount = new Set(recentChats.map(c => c.match_id)).size;
        }
      }

      // Drip Weekly: likes given in the last 7 days
      const { count: likesCount } = await supabase
        .from('likes')
        .select('id', { count: 'exact', head: true })
        .eq('liker_id', currentUser.id)
        .gte('created_at', sevenDaysAgo);

      const finalStats = {
        totalMatches: matchesCount || 0,
        activeChats: activeChatsCount,
        totalLikes: likesCount || 0
      };

      setStats(finalStats);
    } catch (error) {
      // Set stats to 0 on error to avoid showing stale data
      setStats({
        totalMatches: 0,
        activeChats: 0,
        totalLikes: 0
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <Card className="shadow-lg bg-black border-pink-500/40 w-full">
        <CardHeader className="py-3 px-4">
          <CardTitle className="flex items-center space-x-1.5 text-sm text-white">
            <Users className="w-4 h-4 text-pink-400" />
            <span>{t('profile.yourDripLoveSummary')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="space-y-1">
              <div className="flex justify-center">
                <Heart className="w-4 h-4 text-red-400" />
              </div>
              <div className="text-lg font-bold text-red-400">{stats.totalMatches}</div>
              <p className="text-[10px] leading-tight text-gray-400">{t('profile.totalMatches')}</p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-center">
                <MessageCircle className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-lg font-bold text-blue-400">{stats.activeChats}</div>
              <p className="text-[10px] leading-tight text-gray-400">{t('profile.activeChats')}</p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-center">
                <Users className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-lg font-bold text-purple-400">{stats.totalLikes}</div>
              <p className="text-[10px] leading-tight text-gray-400">{t('profile.likesGiven')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfileSummaryCard;
