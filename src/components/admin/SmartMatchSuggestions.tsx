import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Lightbulb, Heart, Users, Sparkles, Check } from 'lucide-react';

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  gender?: string | null;
  preference?: string | null;
  date_of_birth?: string;
  min_age?: number | null;
  max_age?: number | null;
  country?: string;
  city?: string;
}

interface MatchSuggestion {
  user1: UserProfile;
  user2: UserProfile;
  reason: string;
  score: number;
}

interface Props {
  users: UserProfile[];
  onMatchCreated: () => void;
}

const SmartMatchSuggestions: React.FC<Props> = ({ users, onMatchCreated }) => {
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [matchingIds, setMatchingIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const calculateAge = (dateOfBirth: string): number => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const getGenderPreference = (pref: string | null | undefined): string[] => {
    if (!pref) return ['male', 'female', 'other'];
    if (pref === 'male') return ['male'];
    if (pref === 'female') return ['female'];
    return ['male', 'female', 'other'];
  };

  const checkCompatibility = (user1: UserProfile, user2: UserProfile): { compatible: boolean; reason: string; score: number } => {
    let score = 0;
    const reasons: string[] = [];

    // Gender preference check
    const user1WantsGenders = getGenderPreference(user1.preference);
    const user2WantsGenders = getGenderPreference(user2.preference);
    
    const user1Gender = user1.gender || 'other';
    const user2Gender = user2.gender || 'other';

    if (!user2WantsGenders.includes(user1Gender) || !user1WantsGenders.includes(user2Gender)) {
      return { compatible: false, reason: 'Gender preferences don\'t match', score: 0 };
    }
    score += 20;
    reasons.push('Gender compatible');

    // Age preference check
    if (user1.date_of_birth && user2.date_of_birth) {
      const user1Age = calculateAge(user1.date_of_birth);
      const user2Age = calculateAge(user2.date_of_birth);

      const user1MinAge = user1.min_age || 18;
      const user1MaxAge = user1.max_age || 99;
      const user2MinAge = user2.min_age || 18;
      const user2MaxAge = user2.max_age || 99;

      if (user2Age < user1MinAge || user2Age > user1MaxAge) {
        return { compatible: false, reason: 'Age not in preference range', score: 0 };
      }
      if (user1Age < user2MinAge || user1Age > user2MaxAge) {
        return { compatible: false, reason: 'Age not in preference range', score: 0 };
      }
      score += 20;
      reasons.push('Age compatible');
    }

    // Location bonus
    if (user1.country && user2.country && user1.country === user2.country) {
      score += 15;
      reasons.push('Same country');
      if (user1.city && user2.city && user1.city.toLowerCase() === user2.city.toLowerCase()) {
        score += 15;
        reasons.push('Same city');
      }
    }

    return { compatible: true, reason: reasons.join(', '), score };
  };

  const generateSuggestions = async () => {
    setIsLoading(true);
    try {
      // Fetch existing matches to exclude
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('user1_id, user2_id');

      const matchedPairs = new Set<string>();
      (existingMatches || []).forEach(m => {
        matchedPairs.add(`${m.user1_id}_${m.user2_id}`);
        matchedPairs.add(`${m.user2_id}_${m.user1_id}`);
      });

      // Fetch all likes (mutual likes are highest priority)
      const { data: allLikes } = await supabase
        .from('likes')
        .select('liker_id, liked_id');

      // Build like maps
      const likesMap = new Map<string, Set<string>>();
      (allLikes || []).forEach(like => {
        if (!likesMap.has(like.liker_id)) {
          likesMap.set(like.liker_id, new Set());
        }
        likesMap.get(like.liker_id)!.add(like.liked_id);
      });

      const suggestions: MatchSuggestion[] = [];
      const processedPairs = new Set<string>();
      const usersMap = new Map(users.map(u => [u.id, u]));

      // Priority 1: Mutual likes (both liked each other but not matched)
      for (const [likerId, likedIds] of likesMap) {
        for (const likedId of likedIds) {
          const pairKey = [likerId, likedId].sort().join('_');
          if (processedPairs.has(pairKey) || matchedPairs.has(pairKey)) continue;

          const reverseLikes = likesMap.get(likedId);
          if (reverseLikes && reverseLikes.has(likerId)) {
            const user1 = usersMap.get(likerId);
            const user2 = usersMap.get(likedId);
            
            if (user1 && user2) {
              const compatibility = checkCompatibility(user1, user2);
              suggestions.push({
                user1,
                user2,
                reason: `💕 MUTUAL LIKE! Both liked each other. ${compatibility.reason}`,
                score: 100 + compatibility.score
              });
              processedPairs.add(pairKey);
            }
          }
        }
      }

      // Priority 2: One-way likes with compatible filters
      for (const [likerId, likedIds] of likesMap) {
        for (const likedId of likedIds) {
          const pairKey = [likerId, likedId].sort().join('_');
          if (processedPairs.has(pairKey) || matchedPairs.has(pairKey)) continue;

          const user1 = usersMap.get(likerId);
          const user2 = usersMap.get(likedId);
          
          if (user1 && user2) {
            const compatibility = checkCompatibility(user1, user2);
            if (compatibility.compatible) {
              suggestions.push({
                user1,
                user2,
                reason: `❤️ ${user1.first_name} liked ${user2.first_name}. ${compatibility.reason}`,
                score: 50 + compatibility.score
              });
              processedPairs.add(pairKey);
            }
          }
        }
      }

      // Priority 3: Compatible users who haven't interacted (limit to prevent too many)
      const activeUsers = users.filter(u => u.gender && u.preference).slice(0, 100);
      for (let i = 0; i < activeUsers.length && suggestions.length < 50; i++) {
        for (let j = i + 1; j < activeUsers.length && suggestions.length < 50; j++) {
          const user1 = activeUsers[i];
          const user2 = activeUsers[j];
          const pairKey = [user1.id, user2.id].sort().join('_');
          
          if (processedPairs.has(pairKey) || matchedPairs.has(pairKey)) continue;

          const compatibility = checkCompatibility(user1, user2);
          if (compatibility.compatible && compatibility.score >= 50) {
            suggestions.push({
              user1,
              user2,
              reason: `✨ High compatibility: ${compatibility.reason}`,
              score: compatibility.score
            });
            processedPairs.add(pairKey);
          }
        }
      }

      // Sort by score descending
      suggestions.sort((a, b) => b.score - a.score);
      
      // Limit to top 20
      setSuggestions(suggestions.slice(0, 20));

      toast({
        title: 'Suggestions Generated',
        description: `Found ${Math.min(suggestions.length, 20)} potential matches!`
      });

    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate suggestions',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createMatch = async (suggestion: MatchSuggestion) => {
    const pairKey = [suggestion.user1.id, suggestion.user2.id].sort().join('_');
    setMatchingIds(prev => new Set(prev).add(pairKey));

    try {
      const { data, error } = await supabase.rpc('admin_create_match', {
        p_user1_id: suggestion.user1.id,
        p_user2_id: suggestion.user2.id
      });

      if (error) throw error;

      const result = data as { success?: boolean; error?: string; message?: string } | null;
      if (result?.success === false) {
        throw new Error(result.error || 'Failed to create match');
      }

      toast({
        title: 'Match Created!',
        description: `${suggestion.user1.first_name} & ${suggestion.user2.first_name} are now matched!`
      });

      // Remove from suggestions
      setSuggestions(prev => prev.filter(s => 
        !(s.user1.id === suggestion.user1.id && s.user2.id === suggestion.user2.id)
      ));

      onMatchCreated();

    } catch (error) {
      console.error('Error creating match:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create match',
        variant: 'destructive'
      });
    } finally {
      setMatchingIds(prev => {
        const next = new Set(prev);
        next.delete(pairKey);
        return next;
      });
    }
  };

  return (
    <div className="space-y-3">
      <Button
        onClick={generateSuggestions}
        disabled={isLoading}
        variant="outline"
        className="w-full text-xs h-8"
        size="sm"
      >
        {isLoading ? (
          <>
            <Sparkles className="w-3 h-3 mr-1 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Lightbulb className="w-3 h-3 mr-1" />
            Smart Suggest Matches
          </>
        )}
      </Button>

      {suggestions.length > 0 && (
        <ScrollArea className="h-64 border rounded-lg p-2">
          <div className="space-y-2">
            {suggestions.map((suggestion, idx) => {
              const pairKey = [suggestion.user1.id, suggestion.user2.id].sort().join('_');
              const isMatching = matchingIds.has(pairKey);

              return (
                <div 
                  key={idx}
                  className="p-2 bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg border border-pink-200"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Users className="w-3 h-3 text-pink-500" />
                      <span className="text-xs font-medium">
                        {suggestion.user1.first_name} {suggestion.user1.last_name?.charAt(0)}.
                      </span>
                      <Heart className="w-3 h-3 text-red-400" />
                      <span className="text-xs font-medium">
                        {suggestion.user2.first_name} {suggestion.user2.last_name?.charAt(0)}.
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {suggestion.score}pts
                    </Badge>
                  </div>
                  <p className="text-[10px] text-gray-600 mb-2">{suggestion.reason}</p>
                  <Button
                    size="sm"
                    className="w-full h-6 text-[10px]"
                    onClick={() => createMatch(suggestion)}
                    disabled={isMatching}
                  >
                    {isMatching ? (
                      'Matching...'
                    ) : (
                      <>
                        <Check className="w-3 h-3 mr-1" />
                        Create Match
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {suggestions.length === 0 && !isLoading && (
        <p className="text-xs text-gray-500 text-center py-2">
          Click "Smart Suggest" to analyze users and find compatible matches
        </p>
      )}
    </div>
  );
};

export default SmartMatchSuggestions;