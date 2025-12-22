import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Radio
} from 'lucide-react';
import { AdminStats } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <TrendingUp className="w-5 h-5 mr-2" />
          Platform Statistics
        </CardTitle>
        <CardDescription>Real-time metrics including premium subscriptions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col items-center p-4 bg-blue-50 rounded-lg">
            <Users className="w-8 h-8 text-blue-600 mb-2" />
            <span className="text-2xl font-bold text-blue-600">{stats.total_users}</span>
            <span className="text-sm text-gray-600">Total Users</span>
          </div>
          
          <div className="flex flex-col items-center p-4 bg-pink-50 rounded-lg">
            <Heart className="w-8 h-8 text-pink-600 mb-2" />
            <span className="text-2xl font-bold text-pink-600">{stats.total_matches}</span>
            <span className="text-sm text-gray-600">Total Matches</span>
          </div>
          
          <div className="flex flex-col items-center p-4 bg-green-50 rounded-lg">
            <MessageSquare className="w-8 h-8 text-green-600 mb-2" />
            <span className="text-2xl font-bold text-green-600">{stats.total_messages}</span>
            <span className="text-sm text-gray-600">Messages Sent</span>
          </div>
          
          {/* Active Now - users active in last 15 minutes */}
          <div className="flex flex-col items-center p-4 bg-emerald-50 rounded-lg border-2 border-emerald-200">
            <div className="relative">
              <Radio className="w-8 h-8 text-emerald-600 mb-2" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
            </div>
            <span className="text-2xl font-bold text-emerald-600">{stats.active_now || 0}</span>
            <span className="text-sm text-gray-600 text-center font-medium">Active Now</span>
            <span className="text-xs text-gray-400">(last 15 min)</span>
          </div>
          
          {/* Active Today with date dropdown */}
          <div className="flex flex-col items-center p-4 bg-purple-50 rounded-lg relative">
            <Activity className="w-8 h-8 text-purple-600 mb-2" />
            <span className="text-2xl font-bold text-purple-600">{displayActiveToday}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-sm text-gray-600 hover:bg-purple-100 px-2 py-1 h-auto"
                >
                  {isToday ? (
                    <>
                      Active Today
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </>
                  ) : (
                    <>
                      {format(selectedDate, 'MMM d')}
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-64 overflow-y-auto">
                {dateOptions.map((option, index) => (
                  <DropdownMenuItem
                    key={index}
                    onClick={() => handleSelectDate(option.date)}
                    className={format(selectedDate, 'yyyy-MM-dd') === format(option.date, 'yyyy-MM-dd') 
                      ? 'bg-purple-100' 
                      : ''}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {!isToday && (
              <span className="text-xs text-purple-500 mt-1">
                {format(selectedDate, 'EEEE')}
              </span>
            )}
          </div>
          
          <div className="flex flex-col items-center p-4 bg-indigo-50 rounded-lg">
            <UserPlus className="w-8 h-8 text-indigo-600 mb-2" />
            <span className="text-2xl font-bold text-indigo-600">{stats.new_users_this_week}</span>
            <span className="text-sm text-gray-600">New This Week</span>
          </div>
          
          <div className="flex flex-col items-center p-4 bg-yellow-50 rounded-lg">
            <Pause className="w-8 h-8 text-yellow-600 mb-2" />
            <span className="text-2xl font-bold text-yellow-600">{stats.users_on_hold}</span>
            <span className="text-sm text-gray-600">Users On Hold</span>
          </div>
          
          <div className="flex flex-col items-center p-4 bg-red-50 rounded-lg">
            <UserX className="w-8 h-8 text-red-600 mb-2" />
            <span className="text-2xl font-bold text-red-600">{stats.blocked_users}</span>
            <span className="text-sm text-gray-600">Blocked Users</span>
          </div>
          
          <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
            <Shield className="w-8 h-8 text-gray-600 mb-2" />
            <span className="text-2xl font-bold text-gray-600">{stats.total_admins}</span>
            <span className="text-sm text-gray-600">Total Admins</span>
          </div>
          
          <div className="flex flex-col items-center p-4 bg-orange-50 rounded-lg">
            <Crown className="w-8 h-8 text-orange-600 mb-2" />
            <span className="text-2xl font-bold text-orange-600">{stats.premium_users}</span>
            <span className="text-sm text-gray-600 text-center">Active subscriptions</span>
          </div>
          
          <div className="flex flex-col items-center p-4 bg-teal-50 rounded-lg">
            <Calendar className="w-8 h-8 text-teal-600 mb-2" />
            <span className="text-2xl font-bold text-teal-600">{stats.active_users_30_days || 0}</span>
            <span className="text-sm text-gray-600 text-center">Active (30 days)</span>
          </div>
          
          <div className="flex flex-col items-center p-4 bg-slate-50 rounded-lg">
            <History className="w-8 h-8 text-slate-600 mb-2" />
            <span className="text-2xl font-bold text-slate-600">{stats.total_users_ever || stats.total_users}</span>
            <span className="text-sm text-gray-600 text-center">Total Users Ever</span>
          </div>
          
          <div className="flex flex-col items-center p-4 bg-amber-50 rounded-lg">
            <Archive className="w-8 h-8 text-amber-600 mb-2" />
            <span className="text-2xl font-bold text-amber-600">{stats.archived_users || 0}</span>
            <span className="text-sm text-gray-600 text-center">Archived Users</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatsCard;