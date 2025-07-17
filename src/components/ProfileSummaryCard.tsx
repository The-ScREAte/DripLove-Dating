
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, MessageCircle, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ProfileSummaryCardProps {
  currentUser: any;
}

const ProfileSummaryCard = ({ currentUser }: ProfileSummaryCardProps) => {
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
      console.error('Error fetching user stats:', error);
    }
  };

  return (
    <Card className="shadow-lg border-pink-200">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-pink-600" />
          <span>Your DripLove Summary</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="space-y-2">
            <div className="flex justify-center">
              <Heart className="w-6 h-6 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-red-500">{stats.totalMatches}</div>
            <p className="text-xs text-gray-600">Total Matches</p>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-center">
              <MessageCircle className="w-6 h-6 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-blue-500">{stats.activeChats}</div>
            <p className="text-xs text-gray-600">Active Chats</p>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-center">
              <Users className="w-6 h-6 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-purple-500">{stats.totalLikes}</div>
            <p className="text-xs text-gray-600">Likes Given</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProfileSummaryCard;
