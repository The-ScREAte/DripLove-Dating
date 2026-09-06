import React, { useMemo, useState, useEffect, useRef } from 'react';
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
import { useAllowScreenshots } from '@/hooks/useAllowScreenshots';
import { Scenario } from '@/data/games/types';
import { getScenariosForLevel } from '@/data/games/scenarioLoader';

const GAME_TYPE: GameType = 'test-your-toast';

const levelConfig: Record<number, { name: string; difficulty: string; questionCount: number; }> = {
  1: { name: 'Warm Up', difficulty: 'Easy', questionCount: 5 },
  2: { name: 'Starter', difficulty: 'Medium', questionCount: 7 },
  3: { name: 'Smooth', difficulty: 'Hard', questionCount: 8 },
  4: { name: 'Cold Open', difficulty: 'Very Hard', questionCount: 10 },
  5: { name: 'Toast Master', difficulty: 'Elite', questionCount: 10 },
};

// --- RANDOMNESS UTILITIES ---
const RECENT_KEY = 'driplove:recent-questions';

const pickRandomScenarios = (all: Scenario[], count: number): Scenario[] => {
  const copy = [...all];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
};

const filterRecentlySeen = (all: Scenario[]): Scenario[] => {
  const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  return all.filter(q => !recent.includes(q.id));
};

const markSeen = (ids: number[]) => {
  const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  const updated = [...new Set([...ids, ...recent])].slice(0, 50);
  localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
};

const shuffleOptions = (options: string[]): string[] => {
  const copy = [...options];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const TestYourToast = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useAllowScreenshots();

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
  const [savingResult, setSavingResult] = useState(false);

  // Tracks the levels-3-5 auto-advance timer (see handleOptionSelect) so a
  // level switch or unmount can cancel a still-pending one - otherwise a
  // stale timeout closes over the OLD questionIndex/selectedLevel and, when
  // it fires after the player has already started a new level, silently
  // stomps the freshly-reset question index with a leftover +1 from the
  // level they just left.
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
    };
  }, []);

  // Load scenarios when level is selected
  useEffect(() => {
    if (!selectedLevel) return;

    // getScenariosForLevel does a real dynamic import() - if the player picks
    // a level, backs out, and picks another before the first import resolves
    // (easy on a slow connection), two loads are in flight at once. Without
    // this flag, whichever resolves last wins even if it's the stale one,
    // silently serving the wrong level's questions.
    let cancelled = false;

    const loadScenarios = async () => {
      setLoadingScenarios(true);
      try {
        const pack = await getScenariosForLevel(selectedLevel);
        const questionCount = levelConfig[selectedLevel]?.questionCount ?? 10;
        // Filter out recently seen questions
        const pool = filterRecentlySeen(pack.scenarios);
        // Pick random scenarios from pool, fallback to all if pool is empty
        const picked = pickRandomScenarios(pool.length ? pool : pack.scenarios, questionCount);
        // Mark these as seen
        markSeen(picked.map(q => q.id));
        // Shuffle options for each scenario
        const randomized = picked.map(s => {
          const shuffled = shuffleOptions(s.options);
          // Find new correctIndex
          const correctText = s.options[s.correctIndex];
          const newCorrectIndex = shuffled.findIndex(opt => opt === correctText);
          return { ...s, options: shuffled, correctIndex: newCorrectIndex };
        });
        if (cancelled) return;
        setScenarios(randomized);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load scenarios:', error);
        toast({
          title: "Error",
          description: "Failed to load game scenarios. Please try again.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoadingScenarios(false);
      }
    };

    loadScenarios();
    return () => { cancelled = true; };
  }, [selectedLevel, toast]);

  const currentScenario = scenarios[questionIndex];
  const correctDisplayedIndex = currentScenario?.correctIndex ?? -1;

  const isCorrect = selectedOption === correctDisplayedIndex;

  const startLevel = (level: number) => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
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
    // selectedOption !== null blocks re-entry for levels 3-5 too - those
    // levels never set showFeedback, so without this a rapid double-tap in
    // the 300ms auto-advance window below could double-count the streak/score
    // and, worse, queue two independent auto-advance timers off two different
    // (index, streak, score) snapshots.
    if (showFeedback || selectedOption !== null || !currentScenario) return;

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
      setScore(s => s + 1 + bonusPoints);
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
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        autoAdvanceTimeoutRef.current = null;
        if (correct || (selectedLevel && selectedLevel < 4)) {
          handleNext();
        }
      }, 300);
    }
  };

  const handleNext = async () => {
    // savingResult only ever becomes true while finishing the last question,
    // so this also blocks a rapid double-tap (or the levels-3-5 auto-advance
    // timer racing a manual tap) from submitting the final result twice.
    if (!selectedLevel || savingResult) return;

    if (questionIndex < scenarios.length - 1) {
      setQuestionIndex(questionIndex + 1);
      setSelectedOption(null);
      setShowFeedback(false);
    } else {
      setSavingResult(true);
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

      try {
        // Minimal DB write: just summary + date played
        await saveFinalGameResultToDb({ gameType: GAME_TYPE, level: selectedLevel, percentage, playedAt });
      } finally {
        setSavingResult(false);
      }

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
      <div className="h-screen bg-black flex flex-col">
        <div className="bg-black border-b border-pink-500/30 shadow-sm sticky top-0 z-10" style={{ paddingTop: 'clamp(8px, env(safe-area-inset-top, 8px), 40px)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)} title="Home" className="text-white hover:bg-white/10 hover:text-white">
                  <Home className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/games')} title="Back to Games" className="text-white hover:bg-white/10 hover:text-white">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-lg font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">DripLove</h1>
                  <p className="text-xs text-gray-300">Test Your Toast 🥂</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearResults}
                className="bg-black border-pink-500/40 text-gray-200 hover:bg-white/10"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-safe-offset-32 pt-6 pb-8">
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <Card className="bg-neutral-900 border-pink-500/30">
            <CardHeader>
              <CardTitle className="text-white">Select a level</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(levelConfig).map(([levelStr, config]) => {
                const level = Number(levelStr);
                const levelBest = bestByLevel[level];
                return (
                  <Button
                    key={level}
                    onClick={() => startLevel(level)}
                    className="w-full h-auto p-4 flex items-start justify-between text-left hover:shadow-md transition-all active:scale-95 bg-black/60 border-pink-500/30 text-white hover:bg-white/5"
                    variant="outline"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-lg text-white">Level {level}</span>
                        <span className="text-sm text-gray-300">- {config.name}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: level }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-gray-300">{config.difficulty} • {config.questionCount} questions{level >= 4 ? ' • 💀 Sudden Death' : ''}</p>
                    </div>
                    <div className="text-right text-sm font-semibold text-white min-w-[80px]">
                      {levelBest ? `${levelBest.percentage.toFixed(0)}%` : '—'}
                      <div className="text-[11px] text-gray-400">Best</div>
                    </div>
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          {best3.length > 0 && (
            <Card className="bg-neutral-900 border-pink-500/30">
              <CardHeader>
                <CardTitle className="text-white">Your best 3 (this device)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {best3.map((r, idx) => (
                  <div key={`${r.playedAt}-${idx}`} className="flex items-center justify-between text-sm">
                    <div className="text-gray-200">Level {r.level} • {r.percentage.toFixed(0)}%</div>
                    <div className="text-gray-400">{new Date(r.playedAt).toLocaleDateString()}</div>
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
      <div className="h-screen bg-black flex flex-col">
        <div className="bg-black border-b border-pink-500/30 shadow-sm sticky top-0 z-10" style={{ paddingTop: 'clamp(8px, env(safe-area-inset-top, 8px), 40px)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} title="Home" className="text-white hover:bg-white/10 hover:text-white">
                <Home className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/games')} title="Back to Games" className="text-white hover:bg-white/10 hover:text-white">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">DripLove</h1>
                <p className="text-xs text-gray-300">Test Your Toast 🥂</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-safe-offset-32 pt-6 pb-8">
          <div className="max-w-2xl mx-auto px-4 py-8">
          <Card className="text-center bg-neutral-900 border-pink-500/30">
            <CardContent className="pt-8 pb-8">
              <Trophy className="w-20 h-20 mx-auto mb-6 text-yellow-400" />
              <h2 className="text-3xl font-bold mb-2 text-white">{rating.title}</h2>
              <p className="text-xl text-gray-300 mb-6">{rating.message}</p>

              <div className="bg-black/60 border border-pink-500/20 rounded-lg p-6 mb-6">
                <div className="text-5xl font-extrabold text-white mb-2">{percentage.toFixed(0)}%</div>
                <p className="text-gray-300 mb-2">Level {selectedLevel} • {score} / {scenarios.length} correct</p>
                <div className="text-sm text-gray-300">
                  Best for this level: {bestPct !== undefined ? `${bestPct.toFixed(0)}%` : '—'} {isNewBest ? '🎉' : ''}
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleRestart}
                  className="flex-1 bg-gradient-to-r from-yellow-400 to-orange-500 hover:opacity-90 text-white font-semibold"
                >
                  Try Another Set
                </Button>
                <Button
                  onClick={() => navigate('/games')}
                  variant="outline"
                  className="flex-1 bg-black/60 border-pink-500/40 text-white hover:bg-white/10 hover:text-white"
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
    <div className="h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="bg-black border-b border-pink-500/30 shadow-sm sticky top-0 z-10" style={{ paddingTop: 'clamp(8px, env(safe-area-inset-top, 8px), 40px)' }}>
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)} title="Home" className="text-white hover:bg-white/10 hover:text-white">
                <Home className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/games')} title="Back to Games" className="text-white hover:bg-white/10 hover:text-white">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-sm font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">DripLove</h1>
                <p className="text-xs text-gray-300">Test Your Toast • Q{questionIndex + 1}/{scenarios.length}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400 mb-1">Best</div>
              <div className="text-lg font-bold text-white">
                {bestByLevel[selectedLevel ?? -1]?.percentage !== undefined
                  ? `${bestByLevel[selectedLevel ?? -1]?.percentage.toFixed(0)}%`
                  : '—'}
              </div>
              {streak > 1 && (
                <div className="text-[11px] text-orange-400 font-semibold flex items-center gap-1 justify-end mt-1">
                  <TrendingUp className="w-3 h-3" />
                  {streak} streak
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-black border-b border-pink-500/20">
        <div className="max-w-2xl mx-auto px-4 py-2">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
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
          <Card className="mb-6 bg-neutral-900 border-pink-500/30">
            <CardContent className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
                <p className="text-gray-300">Loading scenarios...</p>
              </div>
            </CardContent>
          </Card>
        ) : !currentScenario ? (
          <Card className="mb-6 bg-neutral-900 border-pink-500/30">
            <CardContent className="py-12 text-center text-gray-300">
              No scenarios available
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="mb-6 bg-neutral-900 border-pink-500/30">
              <CardHeader>
                <div className="inline-block px-3 py-1 bg-orange-500/20 text-orange-300 rounded-full text-sm font-semibold mb-3">
                  {currentScenario.personality}
                </div>
                <CardTitle className="text-lg leading-relaxed text-white">{currentScenario.situation}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentScenario.options.map((option, index) => {
                  const isSelected = selectedOption === index;
                  const isCorrectAnswer = index === correctDisplayedIndex;

                  let buttonClass = "w-full text-left p-4 rounded-lg border-2 transition-all ";

                  if (showFeedback) {
                    if (isCorrectAnswer) {
                      buttonClass += "border-green-500/60 bg-green-500/10 text-green-200 shadow-green-500/10 shadow-md";
                    } else if (isSelected && !isCorrectAnswer) {
                      buttonClass += "border-red-500/60 bg-red-500/10 text-red-200";
                    } else {
                      buttonClass += "border-white/10 bg-white/5 text-gray-400";
                    }
                  } else if (isSelected) {
                    // Levels 3-5 have no color-coded feedback (answer is
                    // revealed later), but the tap still needs a visible
                    // "registered" state - otherwise the button looks
                    // identical to unanswered and invites a second tap.
                    buttonClass += "border-pink-500/60 bg-pink-500/10 text-white";
                  } else {
                    buttonClass += "border-pink-500/20 bg-black/40 text-gray-100 hover:border-orange-400 hover:bg-orange-500/10 cursor-pointer active:scale-98 transition-transform";
                  }

                  return (
                    <button
                      key={index}
                      onClick={() => handleOptionSelect(index)}
                  className={buttonClass}
                  disabled={showFeedback || selectedOption !== null}
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
          <Card className={`mb-6 border-2 bg-neutral-900 ${isCorrect ? 'border-green-500/60' : 'border-orange-500/60'}`}>
            <CardContent className="pt-6">
              <p className="text-lg leading-relaxed mb-4 text-gray-100">
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
