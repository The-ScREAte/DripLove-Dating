import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  Heart,
  MessageSquare,
  UserX,
  TrendingUp,
  Calendar,
  Shield,
  UserPlus,
  Crown,
  Pause,
  Activity,
  History,
  Archive,
  ChevronDown,
  Radio,
} from 'lucide-react';
import { AdminStats } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { format, subDays } from 'date-fns';

interface StatsCardProps {
  stats: AdminStats;
}

interface DailyActiveStat {
  stat_date: string;
  active_count: number;
}

const StatsCard: React.FC<StatsCardProps> = ({ stats }) => {
  const [historicalData, setHistoricalData] = useState<DailyActiveStat[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedDateCount, setSelectedDateCount] = useState<number | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Load historical data on mount
  useEffect(() => {
    const loadHistoricalData = async () => {
      setIsLoadingHistory(true);
      try {
        const { data, error } = await supabase
          .from('daily_active_stats')
          .select('stat_date, active_count')
          .order('stat_date', { ascending: false })
          .limit(30);
        
        if (error) {
          console.error('Failed to load historical stats:', error);
        } else if (data) {
          setHistoricalData(data);
        }
      } catch (err) {
        console.error('Error loading historical data:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistoricalData();
  }, []);

  // When selecting a historical date
  const handleSelectDate = async (date: Date) => {
    setSelectedDate(date);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Check if we have this date in historical data
    const historicalEntry = historicalData.find(h => h.stat_date === dateStr);
    
    if (historicalEntry) {
      setSelectedDateCount(historicalEntry.active_count);
    } else {
      // Try to fetch from database function
      try {
        const { data, error } = await supabase.rpc('get_active_users_for_date', {
          target_date: dateStr
        });
        
        if (error) {
          console.error('Error fetching date count:', error);
          setSelectedDateCount(0);
        } else {
          setSelectedDateCount(data || 0);
        }
      } catch (err) {
        console.error('Error:', err);
        setSelectedDateCount(0);
      }
    }
  };

  // Generate date options (last 30 days)
  const dateOptions = Array.from({ length: 30 }, (_, i) => {
    const date = subDays(new Date(), i);
    return {
      date,
      label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : format(date, 'MMM d, yyyy')
    };
  });

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  const displayActiveToday = isToday ? stats.active_users_today : selectedDateCount ?? 0;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-base">
          <TrendingUp className="w-5 h-5 mr-2" />
          Platform Statistics
        </CardTitle>
      </CardHeader>


      <CardContent className="pt-0">
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <div className="flex flex-col items-center p-2 bg-blue-50 rounded-lg">
            <Users className="w-4 h-4 text-blue-600 mb-1" />
            <span className="text-lg font-bold text-blue-600">{stats.total_users}</span>
            <span className="text-xs text-gray-600">Users</span>
          </div>
          
          <div className="flex flex-col items-center p-2 bg-pink-50 rounded-lg">
            <Heart className="w-4 h-4 text-pink-600 mb-1" />
            <span className="text-lg font-bold text-pink-600">{stats.total_matches}</span>
            <span className="text-xs text-gray-600">Matches</span>
          </div>
          
          <div className="flex flex-col items-center p-2 bg-green-50 rounded-lg">
            <MessageSquare className="w-4 h-4 text-green-600 mb-1" />
            <span className="text-lg font-bold text-green-600">{stats.total_messages}</span>
            <span className="text-xs text-gray-600">Messages</span>
          </div>
          
          {/* Active Now */}
          <div className="flex flex-col items-center p-2 bg-emerald-50 rounded-lg border border-emerald-200">
            <div className="relative">
              <Radio className="w-4 h-4 text-emerald-600 mb-1" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            </div>
            <span className="text-lg font-bold text-emerald-600">{stats.active_now ?? 0}</span>
            <span className="text-xs text-emerald-700">Active Now</span>
          </div>
          
          {/* Active Today with dropdown */}
          <div className="flex flex-col items-center p-2 bg-purple-50 rounded-lg">
            <Activity className="w-4 h-4 text-purple-600 mb-1" />
            <span className="text-lg font-bold text-purple-600">{displayActiveToday}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs text-gray-600 px-1 py-0 h-auto">
                  {isToday ? 'Today' : format(selectedDate, 'MMM d')}
                  <ChevronDown className="w-2 h-2 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-48 overflow-y-auto z-50">
                {dateOptions.map((option, index) => (
                  <DropdownMenuItem
                    key={index}
                    onClick={() => handleSelectDate(option.date)}
                    className={format(selectedDate, 'yyyy-MM-dd') === format(option.date, 'yyyy-MM-dd') ? 'bg-purple-100' : ''}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          <div className="flex flex-col items-center p-2 bg-indigo-50 rounded-lg">
            <UserPlus className="w-4 h-4 text-indigo-600 mb-1" />
            <span className="text-lg font-bold text-indigo-600">{stats.new_users_this_week}</span>
            <span className="text-xs text-gray-600">New/Week</span>
          </div>
          
          <div className="flex flex-col items-center p-2 bg-yellow-50 rounded-lg">
            <Pause className="w-4 h-4 text-yellow-600 mb-1" />
            <span className="text-lg font-bold text-yellow-600">{stats.users_on_hold}</span>
            <span className="text-xs text-gray-600">On Hold</span>
          </div>
          
          <div className="flex flex-col items-center p-2 bg-red-50 rounded-lg">
            <UserX className="w-4 h-4 text-red-600 mb-1" />
            <span className="text-lg font-bold text-red-600">{stats.blocked_users}</span>
            <span className="text-xs text-gray-600">Blocked</span>
          </div>
          
          <div className="flex flex-col items-center p-2 bg-gray-50 rounded-lg">
            <Shield className="w-4 h-4 text-gray-600 mb-1" />
            <span className="text-lg font-bold text-gray-600">{stats.total_admins}</span>
            <span className="text-xs text-gray-600">Admins</span>
          </div>
          
          <div className="flex flex-col items-center p-2 bg-orange-50 rounded-lg">
            <Crown className="w-4 h-4 text-orange-600 mb-1" />
            <span className="text-lg font-bold text-orange-600">{stats.premium_users}</span>
            <span className="text-xs text-gray-600">Premium</span>
          </div>
          
          <div className="flex flex-col items-center p-2 bg-teal-50 rounded-lg">
            <Calendar className="w-4 h-4 text-teal-600 mb-1" />
            <span className="text-lg font-bold text-teal-600">{stats.active_users_30_days || 0}</span>
            <span className="text-xs text-gray-600">30 Days</span>
          </div>
          
          <div className="flex flex-col items-center p-2 bg-amber-50 rounded-lg">
            <Archive className="w-4 h-4 text-amber-600 mb-1" />
            <span className="text-lg font-bold text-amber-600">{stats.archived_users || 0}</span>
            <span className="text-xs text-gray-600">Archived</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatsCard;