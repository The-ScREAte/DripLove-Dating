import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, Target, Flag, Home } from 'lucide-react';

const Games = () => {
  const navigate = useNavigate();

  const games = [
    {
      id: 'test-your-toast',
      title: 'Test Your Toast',
      subtitle: 'Flagship Game',
      tagline: 'Win them over with your words',
      description: 'Practice messaging through real scenarios. Choose your level and improve your conversation skills.',
      icon: Gamepad2,
      gradient: 'from-yellow-400 to-orange-500',
      path: '/games/test-your-toast'
    },
    {
      id: 'shoot-your-shot',
      title: 'Shoot Your Shot',
      subtitle: 'Quick Challenge',
      tagline: 'One shot. Make it count.',
      description: 'You have one message and limited time. Test your wit under pressure.',
      icon: Target,
      gradient: 'from-blue-400 to-purple-500',
      path: '/games/shoot-your-shot'
    },
    {
      id: 'red-flag-green-flag',
      title: 'Red Flag or Green Flag',
      subtitle: 'Dating Instincts',
      tagline: 'Would you swipe right?',
      description: 'Judge dating scenarios and profiles. Sharpen your instincts.',
      icon: Flag,
      gradient: 'from-red-400 to-green-500',
      path: '/games/red-flag-green-flag'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="hover:bg-gray-100"
            >
              <Home className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Games</h1>
              <p className="text-sm text-gray-600">Have fun, practice, and learn</p>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4 pb-32">
          {games.map((game) => {
            const IconComponent = game.icon;
            return (
              <Card
                key={game.id}
                className="overflow-hidden hover:border-gray-300 transition-all duration-200 hover:shadow-md cursor-pointer"
                onClick={() => navigate(game.path)}
              >
                <div className={`h-1.5 bg-gradient-to-r ${game.gradient}`} />
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-lg bg-gradient-to-br ${game.gradient}`}>
                      <IconComponent className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-0.5">{game.title}</CardTitle>
                      <p className="text-xs text-gray-500">{game.subtitle}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">{game.tagline}</p>
                  <p className="text-sm text-gray-600 mb-4">{game.description}</p>
                  <Button
                    className={`w-full bg-gradient-to-r ${game.gradient} hover:opacity-90 text-white font-medium`}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(game.path);
                    }}
                  >
                    Play Now
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Games;
