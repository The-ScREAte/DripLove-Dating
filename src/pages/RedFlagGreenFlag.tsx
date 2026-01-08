import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ThumbsUp, ThumbsDown, Star, Trash2 } from 'lucide-react';
import { addResult, clearResults, getBestResults, type GameType } from '@/utils/gameStorage';
import { saveFinalGameResultToDb, clearGameResultsFromDb } from '@/utils/gameResultsDb';
import { useToast } from '@/hooks/use-toast';

interface Scenario {
  id: number;
  type: 'profile' | 'behavior' | 'text';
  content: string;
  isRedFlag: boolean;
  explanation: string;
}

const scenarios: Scenario[] = [
  {
    id: 1,
    type: 'text',
    content: '"Hey beautiful 😍 You look absolutely gorgeous in your pics"',
    isRedFlag: true,
    explanation: "🚩 Too focused on appearance right away. Better to reference something from their bio or interests first!"
  },
  {
    id: 2,
    type: 'behavior',
    content: "Only has group photos - you can't tell which person they are",
    isRedFlag: true,
    explanation: "🚩 Classic red flag! If they won't show clear photos of themselves, that's hiding something."
  },
  {
    id: 3,
    type: 'profile',
    content: 'Bio: "Just ask 🤷" with no other information',
    isRedFlag: true,
    explanation: '🚩 Low effort profile = low effort person. If they can\'t be bothered to write a bio, they probably won\'t put effort into dating either.'
  },
  {
    id: 4,
    type: 'text',
    content: '"I saw you like hiking! What\'s your favorite trail around here?"',
    isRedFlag: false,
    explanation: "💚 Perfect! Shows they read your profile and asks an engaging question. This is what you want to see!"
  },
  {
    id: 5,
    type: 'behavior',
    content: "Takes 3-5 days to respond to messages without explanation",
    isRedFlag: true,
    explanation: "🚩 Consistently slow responses without reason shows lack of interest. You deserve someone who's excited to talk to you!"
  },
  {
    id: 6,
    type: 'profile',
    content: 'All photos are from 5+ years ago (you can tell from the dates/events)',
    isRedFlag: true,
    explanation: "🚩 Not showing current photos is misleading. Genuine people use recent pictures."
  },
  {
    id: 7,
    type: 'text',
    content: '"Wanna come over? 😏" as a first message',
    isRedFlag: true,
    explanation: "🚩 Major red flag! Anyone asking you to their place immediately doesn't have good intentions."
  },
  {
    id: 8,
    type: 'behavior',
    content: "Suggests meeting for coffee in a public place for the first date",
    isRedFlag: false,
    explanation: "💚 Great green flag! They're thinking about safety and comfort. Public first dates are always smart."
  },
  {
    id: 9,
    type: 'profile',
    content: 'Bio: "Looking for something real. Love dogs, travel, and trying new restaurants 🍜"',
    isRedFlag: false,
    explanation: "💚 Clear, positive, and shares interests. This gives you something to start a conversation about!"
  },
  {
    id: 10,
    type: 'behavior',
    content: 'Constantly talks about their ex on the first date',
    isRedFlag: true,
    explanation: "🚩 Not over their ex! If they can't stop bringing them up, they're not ready for something new."
  },
  {
    id: 11,
    type: 'text',
    content: '"I\'m actually running late but I\'ll be there in 15! Sorry about that"',
    isRedFlag: false,
    explanation: "💚 Good communication! They're letting you know about the delay instead of ghosting or making excuses later."
  },
  {
    id: 12,
    type: 'behavior',
    content: 'Rude to the waiter/staff on your date',
    isRedFlag: true,
    explanation: "🚩 HUGE red flag! How someone treats service workers shows their true character. Run!"
  },
  {
    id: 13,
    type: 'profile',
    content: '"No drama, no games, no time wasters" in bio',
    isRedFlag: true,
    explanation: "🚩 Ironically, people who say 'no drama' usually bring the most drama. Negative bios = red flag."
  },
  {
    id: 14,
    type: 'text',
    content: '"That coffee shop you mentioned sounds great! I love trying new places. How about Saturday afternoon?"',
    isRedFlag: false,
    explanation: "💚 Shows enthusiasm, references what you said, and suggests a specific time. Perfect follow-through!"
  },
  {
    id: 15,
    type: 'behavior',
    content: "Their friends say good things about them and they have long-term friendships",
    isRedFlag: false,
    explanation: "💚 Strong green flag! Long-term friendships show they can maintain healthy relationships and are trustworthy."
  }
];

const GAME_TYPE: GameType = 'red-flag-green-flag';

const levelConfig: Record<number, { name: string; difficulty: string; scenarios: number; }> = {
  1: { name: 'Basics', difficulty: 'Easy', scenarios: 5 },
  2: { name: 'Instincts', difficulty: 'Medium', scenarios: 7 },
  3: { name: 'Reality Check', difficulty: 'Hard', scenarios: 10 },
  4: { name: 'No Excuses', difficulty: 'Very Hard', scenarios: 12 },
  5: { name: 'Expert Mode', difficulty: 'Elite', scenarios: 15 },
};

const RedFlagGreenFlag = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const best3 = useMemo(() => getBestResults(GAME_TYPE), []);

  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [gameComplete, setGameComplete] = useState(false);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);

  const levelScenarios = useMemo(() => {
    if (!selectedLevel) return [] as Scenario[];
    const count = levelConfig[selectedLevel]?.scenarios ?? scenarios.length;
    return scenarios.slice(0, Math.min(count, scenarios.length));
  }, [selectedLevel]);

  const currentScenario = levelScenarios[currentIndex];

  const startLevel = (level: number) => {
    setSelectedLevel(level);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setScore({ correct: 0, wrong: 0 });
    setGameComplete(false);
    setStartedAtMs(Date.now());
  };

  const handleAnswer = (isRedFlag: boolean) => {
    if (showExplanation) return;

    setSelectedAnswer(isRedFlag);
    setShowExplanation(true);

    if (isRedFlag === currentScenario.isRedFlag) {
      setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
    } else {
      setScore(prev => ({ ...prev, wrong: prev.wrong + 1 }));
    }
  };

  const handleNext = () => {
    if (currentIndex < levelScenarios.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      setGameComplete(true);

      if (selectedLevel) {
        const playedAt = new Date().toISOString();
        const total = levelScenarios.length || 1;
        const percentage = (score.correct / total) * 100;
        const timeTakenSeconds = startedAtMs ? Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000)) : undefined;

        addResult({
          gameType: GAME_TYPE,
          level: selectedLevel,
          percentage,
          score: score.correct,
          total,
          timeTakenSeconds,
          playedAt,
        });

        void saveFinalGameResultToDb({ gameType: GAME_TYPE, level: selectedLevel, percentage, playedAt });

        toast({
          title: 'Saved locally',
          description: `Level ${selectedLevel} • ${percentage.toFixed(0)}%`,
          duration: 2500,
        });
      }
    }
  };

  const handleRestart = () => {
    setSelectedLevel(null);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setScore({ correct: 0, wrong: 0 });
    setGameComplete(false);
    setStartedAtMs(null);
  };

  const getScoreRating = () => {
    const total = levelScenarios.length || 1;
    const percentage = (score.correct / total) * 100;
    if (percentage >= 90) return { title: "🏆 Dating Guru!", message: "You've got excellent judgment! Your red flag radar is on point!" };
    if (percentage >= 75) return { title: "👀 Sharp Observer", message: "Great instincts! You know what to look for in dating!" };
    if (percentage >= 60) return { title: "📚 Learning Fast", message: "Not bad! Keep practicing and you'll master the dating game!" };
    return { title: "🎓 Student Mode", message: "Everyone learns! Play again to sharpen your dating instincts!" };
  };

  const handleClearResults = async () => {
    clearResults(GAME_TYPE);
    await clearGameResultsFromDb(GAME_TYPE);
    toast({ title: 'Cleared', description: 'Your game results were cleared on this device.', duration: 2000 });
  };

  if (!selectedLevel) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-green-50 pb-20">
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate('/games')}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Red Flag or Green Flag</h1>
                  <p className="text-xs text-gray-600">Pick a level to play</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearResults}
                className="border-gray-300 text-gray-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-3">
              {Object.entries(levelConfig).map(([levelStr, cfg]) => {
                const level = Number(levelStr);
                return (
                  <Button
                    key={level}
                    onClick={() => startLevel(level)}
                    className="w-full h-auto p-4 flex items-start justify-between text-left hover:shadow-md transition-all"
                    variant="outline"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-lg">Level {level}</span>
                        <span className="text-sm text-gray-600">- {cfg.name}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: level }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-green-400 text-green-400" />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">{cfg.difficulty} • {cfg.scenarios} scenarios</p>
                    </div>
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          {best3.length > 0 && (
            <Card>
              <CardContent className="pt-6 space-y-2">
                <div className="font-semibold text-gray-900">Your best 3 (this device)</div>
                {best3.map((r, idx) => (
                  <div key={`${r.playedAt}-${idx}`} className="flex items-center justify-between text-sm">
                    <div className="text-gray-700">Level {r.level} • {r.percentage.toFixed(0)}%</div>
                    <div className="text-gray-500">{new Date(r.playedAt).toLocaleDateString()}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (gameComplete) {
    const rating = getScoreRating();
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-green-50 pb-20">
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/games')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-xl font-bold text-gray-900">Red Flag or Green Flag</h1>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8">
          <Card className="text-center">
            <CardContent className="pt-8 pb-8">
              <div className="text-6xl mb-6">🎯</div>
              <h2 className="text-3xl font-bold mb-2">{rating.title}</h2>
              <p className="text-xl text-gray-600 mb-6">{rating.message}</p>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
                  <div className="text-3xl font-bold text-green-600">{score.correct}</div>
                  <p className="text-sm text-gray-600">Correct</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4 border-2 border-red-200">
                  <div className="text-3xl font-bold text-red-600">{score.wrong}</div>
                  <p className="text-sm text-gray-600">Wrong</p>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handleRestart}
                  className="w-full bg-gradient-to-r from-red-500 to-green-500 hover:opacity-90 text-white font-semibold"
                >
                  Play Again
                </Button>
                <Button
                  onClick={() => navigate('/games')}
                  variant="outline"
                  className="w-full"
                >
                  Back to Games
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isCorrect = selectedAnswer === currentScenario.isRedFlag;

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-green-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/games')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Red Flag or Green Flag</h1>
                <p className="text-xs text-gray-600">Level {selectedLevel} • Scenario {currentIndex + 1} of {levelScenarios.length}</p>
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">No score shown until end</div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-2">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-green-500 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / Math.max(1, levelScenarios.length)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Game Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {!showExplanation ? (
          <Card className="mb-6">
            <CardContent className="pt-8 pb-8">
              {/* Type Badge */}
              <div className="text-center mb-6">
                <span className="inline-block px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-semibold capitalize mb-6">
                  {currentScenario.type === 'text' ? '💬 Message' : 
                   currentScenario.type === 'behavior' ? '👤 Behavior' : 
                   '📋 Profile'}
                </span>
              </div>

              {/* Scenario */}
              <div className="bg-gray-50 rounded-xl p-6 mb-8 min-h-[120px] flex items-center justify-center">
                <p className="text-lg text-center leading-relaxed text-gray-800">
                  {currentScenario.content}
                </p>
              </div>

              {/* Question */}
              <h2 className="text-2xl font-bold text-center mb-8 text-gray-900">
                Would you date this? 🤔
              </h2>

              {/* Answer Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={() => handleAnswer(true)}
                  className="h-32 flex flex-col items-center justify-center gap-3 bg-red-500 hover:bg-red-600 text-white font-bold text-lg"
                >
                  <ThumbsDown className="w-10 h-10" />
                  <span>Red Flag 🚩</span>
                </Button>
                <Button
                  onClick={() => handleAnswer(false)}
                  className="h-32 flex flex-col items-center justify-center gap-3 bg-green-500 hover:bg-green-600 text-white font-bold text-lg"
                >
                  <ThumbsUp className="w-10 h-10" />
                  <span>Green Flag 💚</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className={`border-2 ${isCorrect ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
            <CardContent className="pt-8 pb-8">
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">
                  {isCorrect ? '✅' : '❌'}
                </div>
                <h2 className="text-3xl font-bold mb-4">
                  {isCorrect ? 'Correct!' : 'Not quite!'}
                </h2>
                <div className={`inline-block px-4 py-2 rounded-full font-bold text-lg mb-4 ${
                  currentScenario.isRedFlag 
                    ? 'bg-red-200 text-red-800' 
                    : 'bg-green-200 text-green-800'
                }`}>
                  {currentScenario.isRedFlag ? '🚩 Red Flag' : '💚 Green Flag'}
                </div>
              </div>

              {/* Scenario Reminder */}
              <div className="bg-white rounded-lg p-4 mb-6 border">
                <p className="text-gray-700 text-center">
                  {currentScenario.content}
                </p>
              </div>

              {/* Explanation */}
              <div className="bg-white rounded-lg p-6 mb-6 border-2 border-gray-200">
                <p className="text-lg leading-relaxed text-gray-800">
                  {currentScenario.explanation}
                </p>
              </div>

              <Button
                onClick={handleNext}
                className={`w-full font-bold text-lg py-6 ${
                  isCorrect 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {currentIndex < levelScenarios.length - 1 ? 'Next Scenario' : 'See Results'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default RedFlagGreenFlag;
