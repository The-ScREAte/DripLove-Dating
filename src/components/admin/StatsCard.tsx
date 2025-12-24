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
        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-1.5 md:gap-2">
          <div className="flex flex-col items-center p-1.5 bg-blue-50 rounded">
            <Users className="w-3 h-3 text-blue-600 mb-0.5" />
            <span className="text-sm font-bold text-blue-600">{stats.total_users}</span>
            <span className="text-[10px] text-gray-600">All Time Users</span>
          </div>
           <div className="flex flex-col items-center p-1.5 bg-teal-50 rounded">
            <Calendar className="w-3 h-3 text-teal-600 mb-0.5" />
            <span className="text-sm font-bold text-teal-600">{stats.active_users_30_days || 0}</span>
            <span className="text-[10px] text-gray-600">Current Users</span>
          </div>

               {/* Active Now */}
          <div className="flex flex-col items-center p-1.5 bg-emerald-50 rounded border border-emerald-200">
            <div className="relative">
              <Radio className="w-3 h-3 text-emerald-600 mb-0.5" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            </div>
            <span className="text-sm font-bold text-emerald-600">{stats.active_now ?? 0}</span>
            <span className="text-[10px] text-emerald-700">Active Now</span>
          </div>

             <div className="flex flex-col items-center p-1.5 bg-indigo-50 rounded">
            <UserPlus className="w-3 h-3 text-indigo-600 mb-0.5" />
            <span className="text-sm font-bold text-indigo-600">{stats.new_users_this_week}</span>
            <span className="text-[10px] text-gray-600">New/Wk</span>
          </div>
          
          <div className="flex flex-col items-center p-1.5 bg-pink-50 rounded">
            <Heart className="w-3 h-3 text-pink-600 mb-0.5" />
            <span className="text-sm font-bold text-pink-600">{stats.total_matches}</span>
            <span className="text-[10px] text-gray-600">Matches</span>
          </div>
          
          <div className="flex flex-col items-center p-1.5 bg-green-50 rounded">
            <MessageSquare className="w-3 h-3 text-green-600 mb-0.5" />
            <span className="text-sm font-bold text-green-600">{stats.total_messages}</span>
            <span className="text-[10px] text-gray-600">Messages</span>
          </div>
          
     
          
          {/* Active Today with dropdown */}
          <div className="flex flex-col items-center p-1.5 bg-purple-50 rounded">
            <Activity className="w-3 h-3 text-purple-600 mb-0.5" />
            <span className="text-sm font-bold text-purple-600">{displayActiveToday}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-[10px] text-gray-600 px-0.5 py-0 h-auto">
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
          
          
          <div className="flex flex-col items-center p-1.5 bg-yellow-50 rounded">
            <Pause className="w-3 h-3 text-yellow-600 mb-0.5" />
            <span className="text-sm font-bold text-yellow-600">{stats.users_on_hold}</span>
            <span className="text-[10px] text-gray-600">Hold</span>
          </div>
          
          <div className="flex flex-col items-center p-1.5 bg-red-50 rounded">
            <UserX className="w-3 h-3 text-red-600 mb-0.5" />
            <span className="text-sm font-bold text-red-600">{stats.blocked_users}</span>
            <span className="text-[10px] text-gray-600">Blocked</span>
          </div>
          
          <div className="flex flex-col items-center p-1.5 bg-gray-50 rounded">
            <Shield className="w-3 h-3 text-gray-600 mb-0.5" />
            <span className="text-sm font-bold text-gray-600">{stats.total_admins}</span>
            <span className="text-[10px] text-gray-600">Admins</span>
          </div>
          
          <div className="flex flex-col items-center p-1.5 bg-orange-50 rounded">
            <Crown className="w-3 h-3 text-orange-600 mb-0.5" />
            <span className="text-sm font-bold text-orange-600">{stats.premium_users}</span>
            <span className="text-[10px] text-gray-600">Premium</span>
          </div>
          
         
          
          <div className="flex flex-col items-center p-1.5 bg-amber-50 rounded">
            <Archive className="w-3 h-3 text-amber-600 mb-0.5" />
            <span className="text-sm font-bold text-amber-600">{stats.archived_users || 0}</span>
            <span className="text-[10px] text-gray-600">Archived</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatsCard;