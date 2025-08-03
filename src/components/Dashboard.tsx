
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, MessageCircle, User, Settings, LogOut } from 'lucide-react';

interface DashboardProps {
  user: any;
  onLogout: () => void;
}

const Dashboard = ({ user, onLogout }: DashboardProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 safe-area-mobile"
         style={{ 
           touchAction: 'pan-x pan-y',
           userSelect: 'none',
           WebkitUserSelect: 'none',
           WebkitTouchCallout: 'none'
         }}>
      <div className="container mx-auto px-4 py-8 safe-area-top">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              Welcome back, {user?.name || 'User'}!
            </h1>
            <p className="text-gray-600 mt-2">Ready to find your perfect match today?</p>
          </div>
          <Button 
            onClick={onLogout}
            variant="outline"
            className="flex items-center space-x-2 border-pink-200 text-pink-600 hover:bg-pink-50"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow duration-200 border-pink-100">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full flex items-center justify-center mb-4">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-pink-600">Discover</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-4">Find new people who share your interests</p>
              <Button className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700">
                Start Swiping
              </Button>
            </CardContent>
          </Card>
          
          <Card className="hover:shadow-lg transition-shadow duration-200 border-pink-100">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mb-4">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-purple-600">Messages</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-4">Chat with your matches</p>
              <Button variant="outline" className="w-full border-purple-200 text-purple-600 hover:bg-purple-50">
                View Chats
              </Button>
            </CardContent>
          </Card>
          
          <Card className="hover:shadow-lg transition-shadow duration-200 border-pink-100">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
                <User className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-indigo-600">Profile</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-4">Complete your profile to get better matches</p>
              <Button variant="outline" className="w-full border-indigo-200 text-indigo-600 hover:bg-indigo-50">
                Edit Profile
              </Button>
            </CardContent>
          </Card>
        </div>
        
        <Card className="mt-8 bg-gradient-to-r from-pink-500 to-purple-600 text-white border-0">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Ready to find love?</h2>
            <p className="text-white/90 mb-6">
              Your perfect match might be just one swipe away. Start exploring now!
            </p>
            <Button className="bg-white text-purple-600 hover:bg-gray-100 font-semibold px-8 py-3">
              Start Matching
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
