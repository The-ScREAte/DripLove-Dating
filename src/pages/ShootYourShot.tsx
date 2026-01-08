import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Target, Zap, Star, Trash2, Trophy } from 'lucide-react';
import { addResult, clearResults, getBestResults, type GameType } from '@/utils/gameStorage';
import { saveFinalGameResultToDb, clearGameResultsFromDb } from '@/utils/gameResultsDb';
import { useToast } from '@/hooks/use-toast';

interface Challenge {
  id: number;
  name: string;
  bio: string;
  prompt: string;
  image: string;
  mood: 'neutral' | 'busy' | 'curious' | 'guarded';
}

const challenges: Challenge[] = [
  {
    id: 1,
    name: "Alex",
    bio: "Coffee enthusiast ☕ | Loves hiking 🥾 | Dog person 🐕",
    prompt: "I just discovered the best hidden coffee shop!",
    image: "☕",
    mood: 'curious'
  },
  {
    id: 2,
    name: "Sam",
    bio: "Gym rat 💪 | Meal prep master | Early riser 🌅",
    prompt: "Morning workouts just hit different",
    image: "💪",
    mood: 'neutral'
  },
  {
    id: 3,
    name: "Jordan",
    bio: "Bookworm 📚 | Cat parent | Netflix binger",
    prompt: "Currently reading three books at once... is that normal?",
    image: "📚",
    mood: 'guarded'
  },
  {
    id: 4,
    name: "Riley",
    bio: "Foodie adventures 🍜 | Travel bug ✈️ | Photography",
    prompt: "Just tried making ramen from scratch... wish me luck!",
    image: "🍜",
    mood: 'curious'
  },
  {
    id: 5,
    name: "Casey",
    bio: "Music lover 🎵 | Concert addict | Vinyl collector",
    prompt: "Found a vintage record store today and I'm LIVING",
    image: "🎵",
    mood: 'busy'
  }
];

type Result = 'swish' | 'airball' | 'brick' | null;

const GAME_TYPE: GameType = 'shoot-your-shot';

const levelConfig: Record<number, { name: string; difficulty: string; timeLimit: number; challenges: number; }> = {
  1: { name: 'Warm Up', difficulty: 'Easy', timeLimit: 60, challenges: 3 },
  2: { name: 'Quick Hands', difficulty: 'Medium', timeLimit: 45, challenges: 4 },
  3: { name: 'Pressure', difficulty: 'Hard', timeLimit: 35, challenges: 5 },
  4: { name: 'Clutch', difficulty: 'Very Hard', timeLimit: 25, challenges: 5 },
  5: { name: 'No Mercy', difficulty: 'Elite', timeLimit: 20, challenges: 5 },
};

const ShootYourShot = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [best3, setBest3] = useState(() => getBestResults(GAME_TYPE));

  const resultsRef = React.useRef({ swish: 0, brick: 0, airball: 0 });

  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [currentChallenge, setCurrentChallenge] = useState(0);
  const [message, setMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [isActive, setIsActive] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);

  const [levelComplete, setLevelComplete] = useState<null | {
    level: number;
    percentage: number;
    total: number;
    swish: number;
    brick: number;
    airball: number;
    timeTakenSeconds?: number;
    playedAt: string;
  }>(null);

  const levelChallenges = useMemo(() => {
    if (!selectedLevel) return [] as Challenge[];
    const count = levelConfig[selectedLevel]?.challenges ?? challenges.length;
    return challenges.slice(0, Math.min(count, challenges.length));
  }, [selectedLevel]);

  const challenge = levelChallenges[currentChallenge];

  const analyzeMessage = (msg: string): Result => {
    const text = msg.trim().toLowerCase();
    
    // Airball - too short, generic, or inappropriate
    if (text.length < 10) return 'airball';
    if (/^(hey|hi|hello|sup|yo)\s*$/i.test(text)) return 'airball';
    if (/^(hey|hi|hello)[\s,!.]*beautiful|gorgeous|sexy|hot/i.test(text)) return 'airball';
    
    // Mood modifiers affect scoring
    const mood = challenge.mood;
    
    // Brick - okay but not great
    if (text.length < 25) {
      // Curious mood is more forgiving of short messages if they have personality
      if (mood === 'curious' && /[!?]|😊|😄/.test(text)) return 'brick';
      return 'airball';
    }
    
    if (!text.includes(challenge.name.toLowerCase()) && !/(coffee|hiking|dog|gym|workout|book|cat|food|ramen|music|concert|record)/i.test(text)) {
      // Guarded mood requires bio/prompt reference
      if (mood === 'guarded') return 'airball';
      return 'brick';
    }
    
    // Swish - references their bio/prompt, asks questions, shows personality
    const hasQuestion = /\?/.test(text);
    const referencesPrompt = new RegExp(
      challenge.prompt.toLowerCase().split(' ').slice(0, 3).join('|')
    ).test(text);
    const hasBioReference = /(coffee|hik|dog|gym|workout|meal|book|cat|netflix|food|ramen|travel|music|concert|vinyl|record)/i.test(text);
    const hasPersonality = /(haha|lol|😂|😄|😊|!)/i.test(text);
    
    // Mood-based scoring adjustments
    if (mood === 'busy') {
      // Busy mood needs concise + direct + interesting
      if (hasQuestion && hasBioReference && text.length < 80) return 'swish';
      return 'brick';
    }
    
    if (mood === 'guarded') {
      // Guarded needs strong bio/prompt reference + personality
      if ((referencesPrompt || hasBioReference) && hasPersonality && hasQuestion) return 'swish';
      return 'brick';
    }
    
    if (mood === 'curious') {
      // Curious is most forgiving - just needs some effort
      if ((hasQuestion && hasBioReference) || (hasPersonality && text.length > 30)) return 'swish';
    }
    
    // Neutral mood - standard scoring
    if ((hasQuestion && (referencesPrompt || hasBioReference)) || (hasBioReference && hasPersonality && text.length > 40)) {
      return 'swish';
    }
    
    return 'brick';
  };

  const handleSubmit = () => {
    if (!message.trim()) {
      setResult('airball');
    } else {
      const shotResult = analyzeMessage(message);
      setResult(shotResult);
    }
    
    setIsActive(false);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => time - 1);
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  // Separate effect for handling time expiry
  useEffect(() => {
    if (timeLeft === 0 && isActive && !result) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, isActive, result]);

  const startTimer = () => {
    setIsActive(true);
    setGameStarted(true);
    if (!startedAtMs) setStartedAtMs(Date.now());
  };

  const handleNext = async () => {
    if (!selectedLevel) return;

    if (currentChallenge < levelChallenges.length - 1) {
      setCurrentChallenge(currentChallenge + 1);
      setMessage('');
      setTimeLeft(levelConfig[selectedLevel]?.timeLimit ?? 60);
      setIsActive(false);
      setResult(null);
      setGameStarted(false);
    } else {
      // Level complete: compute percentage based on results stored in state below
      const playedAt = new Date().toISOString();
      const timeTakenSeconds = startedAtMs ? Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000)) : undefined;

      // Derive score from per-challenge results tracked locally in this component
      const swishCount = resultsRef.current.swish;
      const brickCount = resultsRef.current.brick;
      const airballCount = resultsRef.current.airball;
      const total = levelChallenges.length || 1;
      const rawScore = swishCount + brickCount * 0.5;
      const percentage = Math.max(0, Math.min(100, (rawScore / total) * 100));

      addResult({
        gameType: GAME_TYPE,
        level: selectedLevel,
        percentage,
        score: Math.round(rawScore * 100) / 100,
        total,
        timeTakenSeconds,
        playedAt,
      });
      await saveFinalGameResultToDb({ gameType: GAME_TYPE, level: selectedLevel, percentage, playedAt });

      setBest3(getBestResults(GAME_TYPE));

      toast({
        title: 'Saved locally',
        description: `Level ${selectedLevel} • ${percentage.toFixed(0)}%`,
        duration: 2500,
      });

      setIsActive(false);
      setGameStarted(false);
      setResult(null);
      setLevelComplete({
        level: selectedLevel,
        percentage,
        total,
        swish: swishCount,
        brick: brickCount,
        airball: airballCount,
        timeTakenSeconds,
        playedAt,
      });
    }
  };

  const startLevel = (level: number) => {
    setSelectedLevel(level);
    setCurrentChallenge(0);
    setMessage('');
    setTimeLeft(levelConfig[level]?.timeLimit ?? 60);
    setIsActive(false);
    setResult(null);
    setGameStarted(false);
    setStartedAtMs(null);
    setLevelComplete(null);
    resultsRef.current = { swish: 0, brick: 0, airball: 0 };
  };

  const handleClearResults = async () => {
    clearResults(GAME_TYPE);
    await clearGameResultsFromDb(GAME_TYPE);
    setBest3(getBestResults(GAME_TYPE));
    toast({ title: 'Cleared', description: 'Your game results were cleared on this device.', duration: 2000 });
  };

  const getLevelSummaryCopy = (percentage: number) => {
    if (percentage >= 85) {
      return {
        title: 'Certified SWISH 🏀',
        message: 'You referenced their vibe and kept it engaging. This is how you get replies.',
      };
    }
    if (percentage >= 70) {
      return {
        title: 'Solid shot ✅',
        message: 'Good instincts. Add one more specific detail + a question to level up.',
      };
    }
    if (percentage >= 50) {
      return {
        title: 'Getting warm 🔥',
        message: 'You’re close. Be more specific and avoid generic openers.',
      };
    }
    return {
      title: 'Airball recovery mode 💨',
      message: 'Read the prompt, name something specific, then ask a playful question.',
    };
  };

  const backToLevelSelect = () => {
    setSelectedLevel(null);
    setLevelComplete(null);
    setCurrentChallenge(0);
    setMessage('');
    setTimeLeft(60);
    setIsActive(false);
    setResult(null);
    setGameStarted(false);
    setStartedAtMs(null);
    resultsRef.current = { swish: 0, brick: 0, airball: 0 };
  };

  const getResultMessage = (): { title: string; message: string; emoji: string; color: string } => {
    if (result === 'swish') {
      return {
        title: "SWISH! 🔥",
        message: "Perfect shot! Great reference to their interests and you asked a question. That's how you stand out!",
        emoji: "🏀✨",
        color: "green"
      };
    }
    if (result === 'brick') {
      return {
        title: "BRICK 📦",
        message: "Hit the rim but didn't go in. Try referencing something specific from their bio or prompt, and ask an engaging question!",
        emoji: "📦",
        color: "orange"
      };
    }
    return {
      title: "AIRBALL 💨",
      message: "Completely missed! Too generic or too short. Show you read their profile and bring some personality!",
      emoji: "💨",
      color: "red"
    };
  };

  const resultInfo = result ? getResultMessage() : null;

  // Track outcomes per challenge (local only)
  useEffect(() => {
    if (!result) return;
    resultsRef.current = {
      ...resultsRef.current,
      [result]: resultsRef.current[result] + 1,
    };
  }, [result]);

  if (!selectedLevel) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 pb-20">
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate('/games')}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Shoot Your Shot 🎯</h1>
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
                            <Star key={i} className="w-3 h-3 fill-purple-400 text-purple-400" />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">{cfg.difficulty} • {cfg.challenges} shots • {cfg.timeLimit}s timer</p>
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

  if (levelComplete) {
    const copy = getLevelSummaryCopy(levelComplete.percentage);
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 pb-20">
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={backToLevelSelect}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Shoot Your Shot 🎯</h1>
                  <p className="text-xs text-gray-600">Level {levelComplete.level} complete</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/games')} className="border-gray-300 text-gray-700">
                Back to Games
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-2">
                <Trophy className="w-10 h-10 text-purple-600 mx-auto" />
                <div className="text-4xl font-extrabold text-gray-900">{levelComplete.percentage.toFixed(0)}%</div>
                <div className="font-bold text-lg text-gray-900">{copy.title}</div>
                <div className="text-sm text-gray-600 max-w-md mx-auto">{copy.message}</div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                  <div className="text-xs text-green-700">Swish</div>
                  <div className="text-xl font-bold text-green-800">{levelComplete.swish}</div>
                </div>
                <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                  <div className="text-xs text-orange-700">Brick</div>
                  <div className="text-xl font-bold text-orange-800">{levelComplete.brick}</div>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <div className="text-xs text-red-700">Airball</div>
                  <div className="text-xl font-bold text-red-800">{levelComplete.airball}</div>
                </div>
              </div>

              <div className="mt-4 text-xs text-gray-500 flex items-center justify-between">
                <div>{new Date(levelComplete.playedAt).toLocaleDateString()}</div>
                {typeof levelComplete.timeTakenSeconds === 'number' && (
                  <div>{levelComplete.timeTakenSeconds}s</div>
                )}
              </div>

              <div className="mt-6 space-y-2">
                <Button
                  onClick={() => startLevel(levelComplete.level)}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 text-white font-bold"
                >
                  Replay Level {levelComplete.level}
                </Button>
                <Button onClick={backToLevelSelect} variant="outline" className="w-full">
                  Choose Another Level
                </Button>
              </div>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/games')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Shoot Your Shot 🎯</h1>
                <p className="text-xs text-gray-600">Level {selectedLevel} • Shot {currentChallenge + 1} of {levelChallenges.length}</p>
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">Timer-based</div>
          </div>
        </div>
      </div>

      {/* Timer */}
      {gameStarted && !result && (
        <div className="bg-white border-b">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-700">Time Remaining</span>
              </div>
              <div className={`text-2xl font-bold ${timeLeft <= 10 ? 'text-red-600 animate-pulse' : 'text-gray-900'}`}>
                {timeLeft}s
              </div>
            </div>
            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ${
                  timeLeft <= 10 ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ width: `${(timeLeft / (levelConfig[selectedLevel]?.timeLimit ?? 60)) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Challenge Card */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {!result ? (
          <Card className="mb-6">
            <CardContent className="pt-6">
              {/* Profile Preview */}
              <div className="flex items-start gap-4 mb-6 pb-6 border-b">
                <div className="text-6xl">{challenge.image}</div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{challenge.name}</h2>
                  <p className="text-gray-600 mb-3">{challenge.bio}</p>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-gray-700">"{challenge.prompt}"</p>
                  </div>
                </div>
              </div>

              {/* Message Input */}
              {!gameStarted ? (
                <div className="text-center space-y-4">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <Target className="w-12 h-12 text-orange-600 mx-auto mb-3" />
                    <h3 className="font-bold text-lg mb-2">Ready to shoot your shot?</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      You have {levelConfig[selectedLevel]?.timeLimit ?? 60} seconds to write ONE message that will make {challenge.name} want to respond.
                      No edits. No second chances. Make it count!
                    </p>
                  </div>
                  <Button
                    onClick={startTimer}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 text-white font-bold text-lg py-6"
                  >
                    Start Timer
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Your ONE shot:
                    </label>
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={`Message ${challenge.name}...`}
                      className="min-h-32 text-base resize-none"
                      maxLength={200}
                      disabled={!isActive}
                    />
                    <div className="text-right text-xs text-gray-500 mt-1">
                      {message.length}/200
                    </div>
                  </div>
                  <Button
                    onClick={handleSubmit}
                    disabled={!isActive || !message.trim()}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 text-white font-bold disabled:opacity-50"
                  >
                    Send Message
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className={`border-2 ${
            resultInfo?.color === 'green' ? 'border-green-500 bg-green-50' :
            resultInfo?.color === 'orange' ? 'border-orange-500 bg-orange-50' :
            'border-red-500 bg-red-50'
          }`}>
            <CardContent className="pt-6">
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">{resultInfo?.emoji}</div>
                <h2 className="text-3xl font-bold mb-3">{resultInfo?.title}</h2>
                <p className="text-lg leading-relaxed text-gray-700">{resultInfo?.message}</p>
              </div>

              {message && (
                <div className="bg-white rounded-lg p-4 mb-6 border-2 border-gray-200">
                  <p className="text-sm text-gray-600 mb-2 font-semibold">Your message:</p>
                  <p className="text-gray-800">"{message}"</p>
                </div>
              )}

              <Button
                onClick={handleNext}
                className={`w-full font-bold ${
                  resultInfo?.color === 'green' ? 'bg-green-600 hover:bg-green-700' :
                  resultInfo?.color === 'orange' ? 'bg-orange-600 hover:bg-orange-700' :
                  'bg-red-600 hover:bg-red-700'
                }`}
              >
                {currentChallenge < levelChallenges.length - 1 ? 'Next Challenge' : 'See Results'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ShootYourShot;
