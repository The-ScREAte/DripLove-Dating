
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

interface LikedMePageProps {
  currentUser: any;
}

const LikedMePage = ({ currentUser }: LikedMePageProps) => {
  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="w-6 h-6 text-pink-600" />
            <span>People who liked you</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No likes yet</h3>
            <p className="text-gray-600">Keep swiping! Someone special is waiting to find you.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LikedMePage;
