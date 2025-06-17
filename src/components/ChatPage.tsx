
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle } from 'lucide-react';

interface ChatPageProps {
  currentUser: any;
}

const ChatPage = ({ currentUser }: ChatPageProps) => {
  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageCircle className="w-6 h-6 text-pink-600" />
            <span>Messages</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No messages yet</h3>
            <p className="text-gray-600">Start swiping to find matches and begin conversations!</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatPage;
