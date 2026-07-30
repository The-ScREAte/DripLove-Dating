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
      image: '/images/games/toast-chat.svg',
      cta: 'Start Toast',
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
      image: '/images/games/shot-target.svg',
      cta: 'Take the Shot',
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
      image: '/images/games/flags-instinct.svg',
      cta: 'Read the Signals',
      path: '/games/red-flag-green-flag'
    }
  ];

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-rose-50/50 to-violet-100/60 flex flex-col">
      {/* Header */}
      <div className="pt-safe pt-10 bg-white/90 backdrop-blur-sm border-b border-white/70 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="hover:bg-gray-100"
                title="Home"
              >
                <Home className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">DripLove</h1>
                <p className="text-sm text-gray-600">Games</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-pink-100 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              New mini-games weekly
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pt-6 pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6 pb-32 pb-safe-offset-32">
          <div className="mb-5">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Pick Your Vibe</h2>
            <p className="text-sm text-slate-600">Quick, fun drills to boost your dating game.</p>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {games.map((game) => {
            const IconComponent = game.icon;
            return (
              <Card
                key={game.id}
                className="group overflow-hidden border-white/70 bg-white/95 backdrop-blur-sm hover:border-white hover:shadow-xl hover:-translate-y-0.5 transition-all duration-250 cursor-pointer h-full"
                onClick={() => navigate(game.path)}
              >
                <div className="relative">
                  <img
                    src={game.image}
                    alt={`${game.title} artwork`}
                    className="h-24 sm:h-28 w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                  <div className={`absolute right-3 top-3 p-2.5 rounded-xl bg-gradient-to-br ${game.gradient} shadow-lg ring-2 ring-white/70`}>
                    <IconComponent className="w-4 h-4 text-white" />
                  </div>
                </div>

                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 mb-2">
                        {game.subtitle}
                      </div>
                      <CardTitle className="text-base sm:text-lg mb-0.5 text-slate-900 leading-tight">{game.title}</CardTitle>
                      <p className="text-xs sm:text-sm font-medium text-slate-700">{game.tagline}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4 flex flex-col h-full">
                  <p className="text-xs sm:text-sm text-slate-600 mb-4">{game.description}</p>
                  <Button
                    className={`mt-auto w-full bg-gradient-to-r ${game.gradient} hover:opacity-90 text-white font-medium`}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(game.path);
                    }}
                  >
                    {game.cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Games;
