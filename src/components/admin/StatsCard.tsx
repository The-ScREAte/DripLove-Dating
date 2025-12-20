import React from 'react';
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
  History
} from 'lucide-react';
import { AdminStats } from '@/types';

interface StatsCardProps {
  stats: AdminStats;
}

const StatsCard: React.FC<StatsCardProps> = ({ stats }) => {
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
          
          <div className="flex flex-col items-center p-4 bg-purple-50 rounded-lg">
            <Activity className="w-8 h-8 text-purple-600 mb-2" />
            <span className="text-2xl font-bold text-purple-600">{stats.active_users_today}</span>
            <span className="text-sm text-gray-600">Active Today</span>
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
        </div>
      </CardContent>
    </Card>
  );
};

export default StatsCard;
