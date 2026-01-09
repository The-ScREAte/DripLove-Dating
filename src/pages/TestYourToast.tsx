import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, TrendingUp, Star, Trash2, Loader2, Home } from 'lucide-react';
import {
  addResult,
  clearResults,
  getBestResults,
  getLevelBests,
  updateBestForLevel,
  clearLevelBests,
  type GameType,
} from '@/utils/gameStorage';
import { saveFinalGameResultToDb, clearGameResultsFromDb } from '@/utils/gameResultsDb';
import { useToast } from '@/hooks/use-toast';
import { Scenario } from '@/data/games/types';
import { getScenariosForLevel, seededShuffle } from '@/data/games/scenarioLoader';

const scenarios: Scenario[] = [
  {
    id: 1,
    personality: 'The Adventurer',
    situation: "They just posted about their weekend rock climbing trip. What's your opening line?",
    options: [
      "Hey! That climbing spot looks amazing. What's the toughest route you've conquered?",
      "Hi there! How was your weekend?",
      "Wow, rock climbing is so cool! I've always wanted to try it.",
      "Hey beautiful! 😍"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! 🎯 You showed genuine interest and asked a specific question that invites storytelling. This is how you build connection!",
      incorrect: "Not bad, but too generic! Try being more specific about their interests. Reference what they shared and ask an engaging question."
    }
  },
  {
    id: 2,
    personality: 'The Creative',
    situation: "Their bio mentions they're a graphic designer who loves late-night art sessions. How do you start?",
    options: [
      "Hey! What kind of projects are you working on?",
      "I saw you're into design! I bet your place looks super aesthetic 😄",
      "Late-night art sessions sound intense! What's your go-to fuel - coffee or chaos?",
      "Hi! You seem really creative."
    ],
    correctIndex: 2,
    feedback: {
      correct: "Excellent! 🔥 You acknowledged their passion with humor and personality. This stands out and invites a fun response!",
      incorrect: "You're on the right track but could add more personality! Try incorporating humor or a unique angle that makes them smile."
    }
  },
  {
    id: 3,
    personality: 'The Professional',
    situation: "They mention working in tech and loving strategy games. What's your approach?",
    options: [
      "So you're a gamer? What's your favorite game?",
      "Tech and strategy games - I bet you're the type who plans three moves ahead in life too 😏",
      "Hey! I love games too!",
      "Hi! Your profile caught my eye."
    ],
    correctIndex: 1,
    feedback: {
      correct: "Nailed it! 💼 You made a clever connection between their interests and personality. Shows you're thoughtful and witty!",
      incorrect: "Too safe! Connect their interests to something deeper about them. Show you're thinking beyond surface level."
    }
  },
  {
    id: 4,
    personality: 'The Foodie',
    situation: "Their profile is filled with food adventures from different cuisines. Open with?",
    options: [
      "You like food? Me too!",
      "I see you're into food! What's the best meal you've had recently?",
      "That ramen spot in your photo - did it live up to the hype or are you still searching for the perfect bowl?",
      "Hey! Want to grab dinner sometime?"
    ],
    correctIndex: 2,
    feedback: {
      correct: "Chef's kiss! 👨‍🍳 You referenced a specific detail and created intrigue with a playful challenge. This is expert level!",
      incorrect: "Close, but could be sharper! Try referencing a specific photo or detail from their profile to show you really looked."
    }
  },
  {
    id: 5,
    personality: 'The Bookworm',
    situation: "They list fantasy novels and coffee shops as their happy place. What's your line?",
    options: [
      "Hey! What are you reading right now?",
      "Fantasy novels and coffee shops - are you Team 'Reading in peaceful silence' or Team 'Café background noise'?",
      "Hi! I like to read too.",
      "I saw you like fantasy! Have you read Harry Potter?"
    ],
    correctIndex: 1,
    feedback: {
      correct: "Brilliant! 📚 You created a fun either/or scenario that's easy to answer and reveals personality. This is how you start great conversations!",
      incorrect: "Good start but needs more creativity! Try creating a fun scenario or playful question that's easy and fun to answer."
    }
  },
  {
    id: 6,
    personality: 'The Traveler',
    situation: "They have photos in Tokyo, Paris, and Mexico City. What's your move?",
    options: [
      "Love your travel shots! Which city had the best food?",
      "Wow you've been everywhere!",
      "You travel a lot. Why?",
      "Let's plan a trip together!"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Nice! You picked a specific, easy-to-answer angle that keeps the convo flowing.",
      incorrect: "Too vague. Show you noticed a detail and ask a tight question to spark a reply."
    }
  },
  {
    id: 7,
    personality: 'The Music Head',
    situation: "They list indie concerts and vinyl hunting as weekend plans.",
    options: [
      "Indie shows + vinyl? What's your rarest find or favorite live set?",
      "Music is cool!",
      "Concerts are fun. Do you like them?",
      "What's your favorite song?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Specific + personal. You're inviting them to share a story.",
      incorrect: "Generic. Reference their hobby and ask something that unlocks a story."
    }
  },
  {
    id: 8,
    personality: 'The Minimalist',
    situation: "Their profile mentions 'less but better', slow mornings, and matcha.",
    options: [
      "Less but better? What's one thing you recently ditched and don't miss?",
      "I like matcha too!",
      "Slow mornings are nice.",
      "Minimalism is interesting."
    ],
    correctIndex: 0,
    feedback: {
      correct: "Nice! You're aligning with their philosophy and asking a reflective question.",
      incorrect: "Try mirroring their language and ask something they can answer fast."
    }
  },
  {
    id: 9,
    personality: 'The Athlete',
    situation: "They run half-marathons and post meal prep Sundays.",
    options: [
      "Half-marathons AND meal prep? What's your pre-race breakfast?",
      "You run a lot. That's cool.",
      "Are you fast?",
      "Let's run together!"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Spot on—specific, respectful, and easy to answer.",
      incorrect: "Ask about something they already love talking about (races, rituals, food)."
    }
  },
  {
    id: 10,
    personality: 'The Film Buff',
    situation: "They have Criterion picks and quotes in their bio.",
    options: [
      "Your Criterion picks are elite. What's your comfort rewatch and what snack pairs with it?",
      "Movies are great, right?",
      "Nice quotes!",
      "Do you like movies?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect—specific compliment + question that invites taste sharing.",
      incorrect: "Generic. Point to something they chose (Criterion/quotes) and ask about it."
    }
  },
  {
    id: 11,
    personality: 'The Pet Parent',
    situation: "Photos feature a corgi in raincoats and trail pics.",
    options: [
      "Your corgi in the raincoat made my day. Trail or city walk this weekend?",
      "Cute dog!",
      "I like dogs too.",
      "Want to walk our dogs?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! You referenced a specific photo and asked an easy either/or.",
      incorrect: "Too broad. Call out the exact thing you saw and give them an easy button to reply."
    }
  },
  {
    id: 12,
    personality: 'The Food Scientist',
    situation: "They are into fermentation, homemade kimchi, and coffee tastings.",
    options: [
      "Fermentation + coffee? What's your current experiment and which roast pairs best?",
      "Kimchi is nice!",
      "Coffee lover here too",
      "Teach me!"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Excellent—specific, curious, and invites them to nerd out.",
      incorrect: "Make it easier for them to geek out by asking about their current experiment."
    }
  },
  {
    id: 13,
    personality: 'The City Explorer',
    situation: "They post hidden parks, murals, and coffee alleys.",
    options: [
      "Hidden parks + murals? What's your favorite micro-adventure under 1 hour?",
      "Cities are fun!",
      "I like murals.",
      "We should hang out sometime."
    ],
    correctIndex: 0,
    feedback: {
      correct: "Love it—specific to their vibe and asks for a small story.",
      incorrect: "Too generic. Ask about a specific habit or favorite hidden gem."
    }
  },
  {
    id: 14,
    personality: 'The Gamer-Strategist',
    situation: "They mention cozy co-op + tactical board games.",
    options: [
      "Cozy co-op + tactics? What's your perfect chill game night lineup?",
      "Games are cool",
      "Do you like video games?",
      "What's your favorite board game?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Nice! Specific and invites them to share their ideal stack.",
      incorrect: "Generic. Combine their interests and ask about a scenario."
    }
  },
  {
    id: 15,
    personality: 'The Wellness Nerd',
    situation: "They journal, cold plunge, and talk sleep scores.",
    options: [
      "Cold plunge + sleep scores? What's your current recovery flex and how do you celebrate small wins?",
      "Healthy living is good",
      "I like sleep too",
      "What's a cold plunge?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great—specific, playful, and invites a brag.",
      incorrect: "Ask about their rituals and make it easy for them to share one."
    }
  }
];

const GAME_TYPE: GameType = 'test-your-toast';

const levelConfig: Record<number, { name: string; difficulty: string; questionCount: number; }> = {
  1: { name: 'Warm Up', difficulty: 'Easy', questionCount: 5 },
  2: { name: 'Starter', difficulty: 'Medium', questionCount: 7 },
  3: { name: 'Smooth', difficulty: 'Hard', questionCount: 8 },
  4: { name: 'Cold Open', difficulty: 'Very Hard', questionCount: 10 },
  5: { name: 'Toast Master', difficulty: 'Elite', questionCount: 10 },
};

const TestYourToast = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [streak, setStreak] = useState(0);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [answerHistory, setAnswerHistory] = useState<Array<{ correct: boolean; option: string }>>([]);
  const [best3, setBest3] = useState(() => getBestResults(GAME_TYPE));
  const [bestByLevel, setBestByLevel] = useState<Record<number, ReturnType<typeof getBestResults>[number]>>(
    () => getLevelBests(GAME_TYPE)
  );

  // Load scenarios when level is selected
  useEffect(() => {
    if (!selectedLevel) return;
    
    const loadScenarios = async () => {
      setLoadingScenarios(true);
      try {
        const pack = await getScenariosForLevel(selectedLevel);
        const questionCount = levelConfig[selectedLevel]?.questionCount ?? 10;
        // Take only the number of scenarios needed for this level
        setScenarios(pack.scenarios.slice(0, questionCount));
      } catch (error) {
        console.error('Failed to load scenarios:', error);
        toast({
          title: "Error",
          description: "Failed to load game scenarios. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoadingScenarios(false);
      }
    };
    
    loadScenarios();
  }, [selectedLevel, toast]);

  const currentScenario = scenarios[questionIndex];
  const correctDisplayedIndex = currentScenario?.correctIndex ?? -1;

  const isCorrect = selectedOption === correctDisplayedIndex;

  const startLevel = (level: number) => {
    setSelectedLevel(level);
    setQuestionIndex(0);
    setScore(0);
    setSelectedOption(null);
    setShowFeedback(false);
    setGameComplete(false);
    setStreak(0);
    setStartedAtMs(Date.now());
    setGameOver(false);
    setAnswerHistory([]);
  };

  const handleOptionSelect = (index: number) => {
    if (showFeedback || !currentScenario) return;
    
    setSelectedOption(index);
    const correct = index === correctDisplayedIndex;
    const chosenOption = currentScenario.options[index] || '';

    // Store answer for deferred feedback (levels 3-5)
    setAnswerHistory([...answerHistory, { correct, option: chosenOption }]);

    // Levels 1-2: show feedback immediately
    const showImmediateFeedback = selectedLevel && selectedLevel <= 2;
    if (showImmediateFeedback) {
      setShowFeedback(true);
    }
    
    if (correct) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      // Streak bonus: 3 in a row = +1 bonus point
      const bonusPoints = newStreak >= 3 && newStreak % 3 === 0 ? 1 : 0;
      setScore(score + 1 + bonusPoints);
      if (bonusPoints > 0 && showImmediateFeedback) {
        toast({ title: '🔥 Streak Bonus!', description: '+1 bonus point', duration: 1500 });
      }
    } else {
      setStreak(0);
      // Sudden death mode for levels 4-5: 1 wrong = game over
      if (selectedLevel && selectedLevel >= 4) {
        setGameOver(true);
        setGameComplete(true);
      }
    }

    // For levels 3-5, auto-advance without showing feedback
    if (!showImmediateFeedback) {
      setTimeout(() => {
        if (correct || (selectedLevel && selectedLevel < 4)) {
          handleNext();
        }
      }, 300);
    }
  };

  const handleNext = async () => {
    if (!selectedLevel) return;

    if (questionIndex < scenarios.length - 1) {
      setQuestionIndex(questionIndex + 1);
      setSelectedOption(null);
      setShowFeedback(false);
    } else {
      setGameComplete(true);

      const playedAt = new Date().toISOString();
      const timeTakenSeconds = startedAtMs ? Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000)) : undefined;
      const percentage = scenarios.length > 0 ? (score / scenarios.length) * 100 : 0;

      const merged = addResult({
        gameType: GAME_TYPE,
        level: selectedLevel,
        percentage,
        score,
        total: scenarios.length,
        timeTakenSeconds,
        playedAt,
      });

      const levelBest = updateBestForLevel({
        gameType: GAME_TYPE,
        level: selectedLevel,
        percentage,
        score,
        total: scenarios.length,
        timeTakenSeconds,
        playedAt,
      });

      setBest3(merged);
      setBestByLevel(levelBest);

      // Minimal DB write: just summary + date played
      await saveFinalGameResultToDb({ gameType: GAME_TYPE, level: selectedLevel, percentage, playedAt });

      toast({
        title: 'Saved locally',
        description: `Level ${selectedLevel} • ${percentage.toFixed(0)}%`,
        duration: 2500,
      });
    }
  };

  const handleRestart = () => {
    setSelectedLevel(null);
    setQuestionIndex(0);
    setScore(0);
    setSelectedOption(null);
    setShowFeedback(false);
    setGameComplete(false);
    setStreak(0);
    setStartedAtMs(null);
  };

  const getScoreRating = () => {
    const total = scenarios.length || 1;
    const percentage = (score / total) * 100;
    if (gameOver && selectedLevel && selectedLevel >= 4) {
      return { title: "💀 Sudden Death", message: "One wrong answer ended it. Try again!" };
    }
    if (percentage === 100) return { title: "🏆 Perfect Run", message: "Flawless! You're a natural." };
    if (percentage >= 80) return { title: "🔥 Smooth", message: "Great instincts. Keep it up!" };
    if (percentage >= 60) return { title: "💪 Solid", message: "Good work. Room to improve!" };
    return { title: "📚 Learning", message: "Keep practicing!" };
  };

  const handleClearResults = async () => {
    clearResults(GAME_TYPE);
    clearLevelBests(GAME_TYPE);
    await clearGameResultsFromDb(GAME_TYPE);
    setBest3([]);
    setBestByLevel({});
    toast({ title: 'Cleared', description: 'Your game results were cleared on this device.', duration: 2000 });
  };

  if (!selectedLevel) {
    return (
      <div className="h-screen bg-gradient-to-br from-yellow-50 to-orange-50 flex flex-col">
        <div className="pt-safe pt-10 bg-white border-b shadow-sm sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)} title="Home">
                  <Home className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/games')} title="Back to Games">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-lg font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">DripLove</h1>
                  <p className="text-xs text-gray-600">Test Your Toast 🥂</p>
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

        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-safe-offset-32 pt-6 pb-8">
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select a level</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(levelConfig).map(([levelStr, config]) => {
                const level = Number(levelStr);
                const levelBest = bestByLevel[level];
                return (
                  <Button
                    key={level}
                    onClick={() => startLevel(level)}
                    className="w-full h-auto p-4 flex items-start justify-between text-left hover:shadow-md transition-all active:scale-95"
                    variant="outline"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-lg">Level {level}</span>
                        <span className="text-sm text-gray-600">- {config.name}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: level }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">{config.difficulty} • {config.questionCount} questions{level >= 4 ? ' • 💀 Sudden Death' : ''}</p>
                    </div>
                    <div className="text-right text-sm font-semibold text-gray-900 min-w-[80px]">
                      {levelBest ? `${levelBest.percentage.toFixed(0)}%` : '—'}
                      <div className="text-[11px] text-gray-500">Best</div>
                    </div>
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          {best3.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Your best 3 (this device)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
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
      </div>
    );
  }

  if (gameComplete) {
    const rating = getScoreRating();
    const totalQuestions = Math.max(1, scenarios.length);
    const percentage = (score / totalQuestions) * 100;
    const bestPct = bestByLevel[selectedLevel ?? -1]?.percentage;
    const isNewBest = bestPct === undefined || percentage >= bestPct;
    return (
      <div className="h-screen bg-gradient-to-br from-yellow-50 to-orange-50 flex flex-col pt-safe">
        <div className="bg-white border-b shadow-sm sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} title="Home">
                <Home className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/games')} title="Back to Games">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">DripLove</h1>
                <p className="text-xs text-gray-600">Test Your Toast 🥂</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-safe-offset-32 pt-6 pb-8">
          <div className="max-w-2xl mx-auto px-4 py-8">
          <Card className="text-center">
            <CardContent className="pt-8 pb-8">
              <Trophy className="w-20 h-20 mx-auto mb-6 text-yellow-500" />
              <h2 className="text-3xl font-bold mb-2">{rating.title}</h2>
              <p className="text-xl text-gray-600 mb-6">{rating.message}</p>
              
              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <div className="text-5xl font-extrabold text-gray-900 mb-2">{percentage.toFixed(0)}%</div>
                <p className="text-gray-600 mb-2">Level {selectedLevel} • {score} / {scenarios.length} correct</p>
                <div className="text-sm text-gray-600">
                  Best for this level: {bestPct !== undefined ? `${bestPct.toFixed(0)}%` : '—'} {isNewBest ? '🎉' : ''}
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handleRestart}
                  className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:opacity-90 text-white font-semibold"
                >
                  Try Another Set
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
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-yellow-50 to-orange-50 flex flex-col pt-safe">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)} title="Home">
                <Home className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/games')} title="Back to Games">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-sm font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">DripLove</h1>
                <p className="text-xs text-gray-600">Test Your Toast • Q{questionIndex + 1}/{scenarios.length}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Best</div>
              <div className="text-lg font-bold text-gray-900">
                {bestByLevel[selectedLevel ?? -1]?.percentage !== undefined
                  ? `${bestByLevel[selectedLevel ?? -1]?.percentage.toFixed(0)}%`
                  : '—'}
              </div>
              {streak > 1 && (
                <div className="text-[11px] text-orange-600 font-semibold flex items-center gap-1 justify-end mt-1">
                  <TrendingUp className="w-3 h-3" />
                  {streak} streak
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-2">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-300"
              style={{ width: `${((questionIndex + 1) / Math.max(1, scenarios.length)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Scrollable Game Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-safe-offset-32 pt-6 pb-8">
        <div className="max-w-2xl mx-auto px-4 py-6">
        {loadingScenarios ? (
          <Card className="mb-6">
            <CardContent className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                <p className="text-gray-600">Loading scenarios...</p>
              </div>
            </CardContent>
          </Card>
        ) : !currentScenario ? (
          <Card className="mb-6">
            <CardContent className="py-12 text-center text-gray-600">
              No scenarios available
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="mb-6">
              <CardHeader>
                <div className="inline-block px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-semibold mb-3">
                  {currentScenario.personality}
                </div>
                <CardTitle className="text-lg leading-relaxed">{currentScenario.situation}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentScenario.options.map((option, index) => {
                  const isSelected = selectedOption === index;
                  const isCorrectAnswer = index === correctDisplayedIndex;
                  
                  let buttonClass = "w-full text-left p-4 rounded-lg border-2 transition-all ";
                  
                  if (showFeedback) {
                    if (isCorrectAnswer) {
                      buttonClass += "border-green-500 bg-green-50 text-green-900 shadow-green-200/50 shadow-md";
                    } else if (isSelected && !isCorrectAnswer) {
                      buttonClass += "border-red-500 bg-red-50 text-red-900";
                    } else {
                      buttonClass += "border-gray-200 bg-gray-50 text-gray-500";
                    }
                  } else {
                    buttonClass += "border-gray-200 hover:border-orange-400 hover:bg-orange-50 cursor-pointer active:scale-98 transition-transform";
                  }

                  return (
                    <button
                      key={index}
                      onClick={() => handleOptionSelect(index)}
                  className={buttonClass}
                  disabled={showFeedback}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5">
                      {showFeedback && isCorrectAnswer && <span className="text-green-600 font-bold">✓</span>}
                      {showFeedback && isSelected && !isCorrectAnswer && <span className="text-red-600 font-bold">✕</span>}
                    </div>
                    <span className="flex-1 leading-relaxed">{option}</span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Feedback Card */}
        {showFeedback && (
          <Card className={`mb-6 border-2 ${isCorrect ? 'border-green-500 bg-green-50' : 'border-orange-500 bg-orange-50'}`}>
            <CardContent className="pt-6">
              <p className="text-lg leading-relaxed mb-4">
                {isCorrect ? currentScenario.feedback.correct : currentScenario.feedback.incorrect}
              </p>
              <Button
                onClick={handleNext}
                className={`w-full font-semibold ${
                  isCorrect 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {questionIndex < scenarios.length - 1 ? 'Next Question' : 'See Results'}
              </Button>
            </CardContent>
          </Card>
        )}
        </>
        )}
        </div>
      </div>
    </div>
  );
};

export default TestYourToast;
