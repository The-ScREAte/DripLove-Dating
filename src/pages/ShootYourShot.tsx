import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Target, Zap, Star, Trash2, Trophy, Home } from 'lucide-react';
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
  },
  {
    id: 6,
    name: "Morgan",
    bio: "Plant parent 🌱 | Yoga instructor | Sunset chaser 🌅",
    prompt: "My apartment is basically a jungle now... send help",
    image: "🌱",
    mood: 'curious'
  },
  {
    id: 7,
    name: "Taylor",
    bio: "Entrepreneur 💼 | Podcast enthusiast | Weekend warrior",
    prompt: "Just launched my side project! Nervous and excited",
    image: "💼",
    mood: 'neutral'
  },
  {
    id: 8,
    name: "Drew",
    bio: "Beach lover 🏖️ | Surfing newbie | Sunset photographer",
    prompt: "Caught my first real wave today! Progress!",
    image: "🏄",
    mood: 'curious'
  },
  {
    id: 9,
    name: "Skylar",
    bio: "Artist 🎨 | Gallery hopper | Coffee snob ☕",
    prompt: "Working on a new collection. Creative block is real...",
    image: "🎨",
    mood: 'guarded'
  },
  {
    id: 10,
    name: "Avery",
    bio: "Runner 🏃 | Meal prepper | Early bird 🌄",
    prompt: "Training for a half marathon. Who needs sleep anyway?",
    image: "🏃",
    mood: 'busy'
  },
  {
    id: 11,
    name: "River",
    bio: "Gamer 🎮 | Tech geek | Pizza connoisseur 🍕",
    prompt: "Just beat the final boss! Only took me 47 tries...",
    image: "🎮",
    mood: 'neutral'
  },
  {
    id: 12,
    name: "Phoenix",
    bio: "Dancer 💃 | Salsa lover | Night owl 🌙",
    prompt: "Found an amazing salsa club. My feet are killing me!",
    image: "💃",
    mood: 'curious'
  },
  {
    id: 13,
    name: "Dakota",
    bio: "Chef 👨‍🍳 | Foodie explorer | Wine enthusiast 🍷",
    prompt: "Experimenting with fusion cuisine today. Pray for me",
    image: "👨‍🍳",
    mood: 'curious'
  },
  {
    id: 14,
    name: "Quinn",
    bio: "Writer ✍️ | Bookstore browser | Tea addict 🍵",
    prompt: "Writer's block is hitting hard. Need inspiration!",
    image: "✍️",
    mood: 'guarded'
  },
  {
    id: 15,
    name: "Blake",
    bio: "Rock climber 🧗 | Adventure seeker | Nature lover 🏔️",
    prompt: "Conquered a V5 today! Hands are destroyed but worth it",
    image: "🧗",
    mood: 'neutral'
  },
  {
    id: 16,
    name: "Sage",
    bio: "Meditation teacher 🧘 | Wellness coach | Green smoothie fan",
    prompt: "Teaching my first workshop tomorrow! Zen but nervous",
    image: "🧘",
    mood: 'curious'
  },
  {
    id: 17,
    name: "Rowan",
    bio: "Architect 🏗️ | Design nerd | Espresso dependent ☕",
    prompt: "Finally got approval on my project! Celebration time",
    image: "🏗️",
    mood: 'neutral'
  },
  {
    id: 18,
    name: "Eden",
    bio: "Fashion blogger 👗 | Thrift shop hunter | Vintage lover",
    prompt: "Found the perfect vintage jacket today! Score!",
    image: "👗",
    mood: 'curious'
  },
  {
    id: 19,
    name: "Ash",
    bio: "Musician 🎸 | Open mic regular | Songwriting enthusiast",
    prompt: "Performing my original song tonight. Wish me luck!",
    image: "🎸",
    mood: 'busy'
  },
  {
    id: 20,
    name: "Winter",
    bio: "Ski instructor ⛷️ | Mountain lover | Hot cocoa expert",
    prompt: "First snow of the season! Season starts soon!",
    image: "⛷️",
    mood: 'curious'
  },
  {
    id: 21,
    name: "Cedar",
    bio: "Marine biologist 🐠 | Ocean advocate | Scuba diver",
    prompt: "Saw a sea turtle today! Never gets old",
    image: "🐠",
    mood: 'curious'
  },
  {
    id: 22,
    name: "Indigo",
    bio: "Barista ☕ | Latte art master | Coffee roaster",
    prompt: "Perfected my rosetta today! Only took 1000 tries",
    image: "☕",
    mood: 'neutral'
  },
  {
    id: 23,
    name: "Storm",
    bio: "Photographer 📸 | Golden hour chaser | Travel junkie ✈️",
    prompt: "Caught the perfect sunrise today! Worth waking up at 5am",
    image: "📸",
    mood: 'curious'
  },
  {
    id: 24,
    name: "Sage",
    bio: "Baker 🥐 | Sourdough starter parent | Pastry perfectionist",
    prompt: "My croissants finally turned out flaky! Third time's the charm",
    image: "🥐",
    mood: 'neutral'
  },
  {
    id: 25,
    name: "Atlas",
    bio: "Personal trainer 💪 | Fitness motivator | Smoothie bowl creator",
    prompt: "Hit a new PR today! Progress never stops",
    image: "💪",
    mood: 'busy'
  },
  {
    id: 26,
    name: "Nova",
    bio: "Astronomy nerd 🔭 | Stargazer | Science communicator",
    prompt: "Clear skies tonight! Perfect for meteor watching",
    image: "🔭",
    mood: 'curious'
  },
  {
    id: 27,
    name: "Ember",
    bio: "Candle maker 🕯️ | Scent enthusiast | Small biz owner",
    prompt: "Just launched my new fall collection! Pumpkin spice who?",
    image: "🕯️",
    mood: 'neutral'
  },
  {
    id: 28,
    name: "Ocean",
    bio: "Marine conservationist 🌊 | Beach cleaner | Paddle boarder",
    prompt: "Organized a beach cleanup today! Made a real difference",
    image: "🌊",
    mood: 'curious'
  },
  {
    id: 29,
    name: "Jasper",
    bio: "Sommelier 🍷 | Wine taster | Cheese board curator",
    prompt: "Discovered an amazing natural wine today. Game changer!",
    image: "🍷",
    mood: 'guarded'
  },
  {
    id: 30,
    name: "Willow",
    bio: "Florist 💐 | Garden lover | Butterfly whisperer 🦋",
    prompt: "Creating bouquets for a wedding this weekend! So excited",
    image: "💐",
    mood: 'curious'
  },
  {
    id: 31,
    name: "Scout",
    bio: "Dog walker 🐕 | Animal lover | Park explorer",
    prompt: "Walked 12 dogs today! Living my best life",
    image: "🐕",
    mood: 'neutral'
  },
  {
    id: 32,
    name: "Onyx",
    bio: "Tattoo artist 🎨 | Ink enthusiast | Sketch book carrier",
    prompt: "Finished an amazing sleeve today! My best work yet",
    image: "🎨",
    mood: 'busy'
  },
  {
    id: 33,
    name: "Luna",
    bio: "Astrologer 🌙 | Crystal collector | Tarot reader",
    prompt: "Mercury retrograde is over! Finally can breathe",
    image: "🌙",
    mood: 'curious'
  },
  {
    id: 34,
    name: "Fox",
    bio: "Mixologist 🍸 | Cocktail creator | Speakeasy hunter",
    prompt: "Created a new signature drink today! Taste testers needed",
    image: "🍸",
    mood: 'neutral'
  },
  {
    id: 35,
    name: "Raven",
    bio: "Poet ✨ | Open mic performer | Coffee shop dweller ☕",
    prompt: "Wrote a piece I'm actually proud of. Rare moment!",
    image: "✨",
    mood: 'guarded'
  },
  {
    id: 36,
    name: "Kai",
    bio: "Therapist 🧠 | Yoga enthusiast | Emotional intelligence advocate",
    prompt: "Today's session reminded me why I love this work.",
    image: "🧠",
    mood: 'neutral'
  },
  {
    id: 37,
    name: "Jasmine",
    bio: "Single parent 👶 | Graphic designer | Weekend warrior",
    prompt: "Finally got a kid-free Saturday. What's adulting again?",
    image: "👶",
    mood: 'curious'
  },
  {
    id: 38,
    name: "Phoenix",
    bio: "Recovering workaholic 💼 | Learning to say no | Self-care advocate",
    prompt: "Left work at 5pm today. Small wins!",
    image: "💼",
    mood: 'neutral'
  },
  {
    id: 39,
    name: "Blair",
    bio: "Fashion blogger 👗 | Thrift store queen | Sustainable style",
    prompt: "Found the most incredible vintage jacket today!",
    image: "👗",
    mood: 'curious'
  },
  {
    id: 40,
    name: "River",
    bio: "Environmental scientist 🌍 | Climate activist | Nature lover",
    prompt: "Another frustrating day of data vs. denial.",
    image: "🌍",
    mood: 'guarded'
  },
  {
    id: 41,
    name: "Indie",
    bio: "Indie game developer 🎮 | Pixel art enthusiast | Coffee addict",
    prompt: "Just fixed a bug that's haunted me for weeks!",
    image: "🎮",
    mood: 'curious'
  },
  {
    id: 42,
    name: "Sage",
    bio: "Herbalist 🌿 | Tea ceremony host | Slow living advocate",
    prompt: "Made the perfect blend today. Took 47 tries.",
    image: "🌿",
    mood: 'neutral'
  },
  {
    id: 43,
    name: "Dakota",
    bio: "Emergency vet 🐾 | Night shift survivor | Animal rescuer",
    prompt: "Saved a puppy tonight. Best feeling ever.",
    image: "🐾",
    mood: 'curious'
  },
  {
    id: 44,
    name: "Quinn",
    bio: "Podcast host 🎙️ | True crime obsessed | Amateur detective",
    prompt: "Recording tomorrow's episode. Nervous and excited!",
    image: "🎙️",
    mood: 'busy'
  },
  {
    id: 45,
    name: "Rowan",
    bio: "Woodworker 🪵 | Custom furniture maker | Sawdust everywhere",
    prompt: "Finally finished that live-edge table. 3 months!",
    image: "🪵",
    mood: 'neutral'
  },
  {
    id: 46,
    name: "Marley",
    bio: "Reggae DJ 🎶 | Vinyl collector | Good vibes only",
    prompt: "Found a rare Bob Marley pressing today!",
    image: "🎶",
    mood: 'curious'
  },
  {
    id: 47,
    name: "Sage",
    bio: "Meditation teacher 🧘 | Mindfulness coach | Tea lover",
    prompt: "Hosted my first online retreat. Grateful.",
    image: "🧘",
    mood: 'neutral'
  },
  {
    id: 48,
    name: "Ember",
    bio: "Fire dancer 🔥 | Circus performer | Living on the edge",
    prompt: "Show tonight. Pre-performance jitters are real.",
    image: "🔥",
    mood: 'busy'
  },
  {
    id: 49,
    name: "Zara",
    bio: "Language nerd 📖 | Speaks 5 languages | World traveler",
    prompt: "Started learning language #6. Challenge accepted!",
    image: "📖",
    mood: 'curious'
  },
  {
    id: 50,
    name: "Atlas",
    bio: "Rock climber 🧗 | Adventure seeker | Fear crusher",
    prompt: "Conquered my first V7 today. Next level!",
    image: "🧗",
    mood: 'curious'
  },
  {
    id: 51,
    name: "Luna",
    bio: "Astrology enthusiast ✨ | Tarot reader | Moon ritual host",
    prompt: "Mercury retrograde is finally over. Thank goodness.",
    image: "✨",
    mood: 'neutral'
  },
  {
    id: 52,
    name: "Cedar",
    bio: "Urban gardener 🌱 | Rooftop farm builder | Green thumb",
    prompt: "First tomatoes of the season! Nature is magic.",
    image: "🌱",
    mood: 'curious'
  },
  {
    id: 53,
    name: "Storm",
    bio: "Storm chaser ⛈️ | Weather photographer | Adrenaline junkie",
    prompt: "Caught an incredible supercell today!",
    image: "⛈️",
    mood: 'curious'
  },
  {
    id: 54,
    name: "Jules",
    bio: "Bartender 🍸 | Cocktail innovator | Night owl",
    prompt: "Created a new drink tonight. Customers loved it!",
    image: "🍸",
    mood: 'neutral'
  },
  {
    id: 55,
    name: "Remy",
    bio: "Chef 👨‍🍳 | Food truck owner | Flavor experimenter",
    prompt: "Sold out in 2 hours today. Best problem ever.",
    image: "👨‍🍳",
    mood: 'curious'
  },
  {
    id: 56,
    name: "Willow",
    bio: "Florist 🌸 | Event designer | Color enthusiast",
    prompt: "Working on a wedding tomorrow. Wish me luck!",
    image: "🌸",
    mood: 'busy'
  },
  {
    id: 57,
    name: "Jett",
    bio: "Skateboarder 🛹 | Street photographer | City explorer",
    prompt: "Found an amazing new spot today!",
    image: "🛹",
    mood: 'curious'
  },
  {
    id: 58,
    name: "Aria",
    bio: "Opera singer 🎭 | Voice coach | Performance artist",
    prompt: "Opening night tomorrow. Nerves and excitement!",
    image: "🎭",
    mood: 'busy'
  },
  {
    id: 59,
    name: "Fox",
    bio: "Wildlife photographer 📷 | Nature documentarian | Patient observer",
    prompt: "Waited 6 hours for this shot. Worth it.",
    image: "📷",
    mood: 'neutral'
  },
  {
    id: 60,
    name: "Indigo",
    bio: "Textile artist 🧵 | Natural dye enthusiast | Slow fashion advocate",
    prompt: "Finally perfected my indigo dye technique!",
    image: "🧵",
    mood: 'curious'
  },
  {
    id: 61,
    name: "Blaze",
    bio: "Firefighter 🚒 | CrossFit athlete | Community volunteer",
    prompt: "Tough shift but everyone's safe. That's what matters.",
    image: "🚒",
    mood: 'neutral'
  },
  {
    id: 62,
    name: "Pearl",
    bio: "Vintage jewelry restorer 💎 | Estate sale hunter | History lover",
    prompt: "Found a 1920s Art Deco piece today!",
    image: "💎",
    mood: 'curious'
  },
  {
    id: 63,
    name: "Soren",
    bio: "Philosophy major 📚 | Coffee shop debater | Deep thinker",
    prompt: "Finally defended my thesis. Exhausted and relieved!",
    image: "📚",
    mood: 'guarded'
  },
  {
    id: 64,
    name: "Wren",
    bio: "Bird watcher 🦜 | Nature guide | Early riser",
    prompt: "Spotted a rare species this morning!",
    image: "🦜",
    mood: 'curious'
  },
  {
    id: 65,
    name: "Bodhi",
    bio: "Surf instructor 🏄 | Ocean advocate | Sunrise chaser",
    prompt: "Perfect waves this morning. Best start to the day!",
    image: "🏄",
    mood: 'curious'
  },
  {
    id: 66,
    name: "Nova",
    bio: "Astrophysics student 🔭 | Stargazer | Science communicator",
    prompt: "Just witnessed a meteor shower. Universe is incredible.",
    image: "🔭",
    mood: 'neutral'
  },
  {
    id: 67,
    name: "Ash",
    bio: "Tattoo artist 🎨 | Custom design specialist | Ink enthusiast",
    prompt: "Finished a massive back piece today. 40 hours total!",
    image: "🎨",
    mood: 'neutral'
  },
  {
    id: 68,
    name: "Echo",
    bio: "Sound engineer 🎚️ | Music producer | Studio rat",
    prompt: "Mixed an album I'm really proud of today.",
    image: "🎚️",
    mood: 'guarded'
  },
  {
    id: 69,
    name: "Sage",
    bio: "Beekeeper 🐝 | Honey maker | Pollinator advocate",
    prompt: "First honey harvest of the season. Sweet success!",
    image: "🐝",
    mood: 'curious'
  },
  {
    id: 70,
    name: "Crimson",
    bio: "Makeup artist 💄 | Special effects creator | Fantasy enthusiast",
    prompt: "Working on a film set tomorrow. Hollywood dreams!",
    image: "💄",
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
    
    if (!text.includes(challenge.name.toLowerCase()) && !/(coffee|hiking|dog|gym|workout|book|cat|food|ramen|music|concert|vinyl|record)/i.test(text)) {
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
      <div className="h-screen bg-black flex flex-col">
        <div className="bg-black border-b border-pink-500/30 shadow-sm sticky top-0 z-10" style={{ paddingTop: 'clamp(8px, env(safe-area-inset-top, 8px), 40px)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)} title="Home" className="text-white hover:bg-white/10">
                  <Home className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/games')} title="Back to Games" className="text-white hover:bg-white/10">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-lg font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">DripLove</h1>
                  <p className="text-xs text-gray-300">Shoot Your Shot 🎯</p>
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
            <CardContent className="pt-6 space-y-3">
              {Object.entries(levelConfig).map(([levelStr, cfg]) => {
                const level = Number(levelStr);
                return (
                  <Button
                    key={level}
                    onClick={() => startLevel(level)}
                    className="w-full h-auto p-4 flex items-start justify-between text-left hover:shadow-md transition-all bg-black/60 border-pink-500/30 text-white hover:bg-white/5"
                    variant="outline"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-lg text-white">Level {level}</span>
                        <span className="text-sm text-gray-300">- {cfg.name}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: level }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-purple-400 text-purple-400" />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-gray-300">{cfg.difficulty} • {cfg.challenges} shots • {cfg.timeLimit}s timer</p>
                    </div>
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          {best3.length > 0 && (
            <Card className="bg-neutral-900 border-pink-500/30">
              <CardContent className="pt-6 space-y-2">
                <div className="font-semibold text-white">Your best 3 (this device)</div>
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

  if (levelComplete) {
    const copy = getLevelSummaryCopy(levelComplete.percentage);
    return (
      <div className="h-screen bg-black flex flex-col">
        <div className="bg-black border-b border-pink-500/30 shadow-sm sticky top-0 z-10" style={{ paddingTop: 'clamp(8px, env(safe-area-inset-top, 8px), 40px)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} title="Home" className="text-white hover:bg-white/10">
                <Home className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/games')} title="Back to Games" className="text-white hover:bg-white/10">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">DripLove</h1>
                <p className="text-xs text-gray-300">Shoot Your Shot 🎯</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-safe-offset-32">
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <Card className="bg-neutral-900 border-pink-500/30">
            <CardContent className="pt-6">
              <div className="text-center space-y-2">
                <Trophy className="w-10 h-10 text-purple-400 mx-auto" />
                <div className="text-4xl font-extrabold text-white">{levelComplete.percentage.toFixed(0)}%</div>
                <div className="font-bold text-lg text-white">{copy.title}</div>
                <div className="text-sm text-gray-300 max-w-md mx-auto">{copy.message}</div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-green-950/40 border border-green-500/40 p-3">
                  <div className="text-xs text-green-300">Swish</div>
                  <div className="text-xl font-bold text-green-400">{levelComplete.swish}</div>
                </div>
                <div className="rounded-lg bg-orange-950/40 border border-orange-500/40 p-3">
                  <div className="text-xs text-orange-300">Brick</div>
                  <div className="text-xl font-bold text-orange-400">{levelComplete.brick}</div>
                </div>
                <div className="rounded-lg bg-red-950/40 border border-red-500/40 p-3">
                  <div className="text-xs text-red-300">Airball</div>
                  <div className="text-xl font-bold text-red-400">{levelComplete.airball}</div>
                </div>
              </div>

              <div className="mt-4 text-xs text-gray-400 flex items-center justify-between">
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
                <Button onClick={backToLevelSelect} variant="outline" className="w-full border-pink-500/40 text-white hover:bg-white/10">
                  Choose Another Level
                </Button>
              </div>
            </CardContent>
          </Card>

          {best3.length > 0 && (
            <Card className="bg-neutral-900 border-pink-500/30">
              <CardContent className="pt-6 space-y-2">
                <div className="font-semibold text-white">Your best 3 (this device)</div>
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

  return (
    <div className="h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="bg-black border-b border-pink-500/30 shadow-sm sticky top-0 z-10" style={{ paddingTop: 'clamp(8px, env(safe-area-inset-top, 8px), 40px)' }}>
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')} title="Home" className="text-white hover:bg-white/10">
                <Home className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/games')} title="Back to Games" className="text-white hover:bg-white/10">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-sm font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">DripLove</h1>
                <p className="text-xs text-gray-300">Shoot Your Shot 🎯 • {currentChallenge + 1}/{levelChallenges.length}</p>
              </div>
            </div>
            <div className="text-right text-xs text-gray-400">Timer-based</div>
          </div>
        </div>
      </div>

      {/* Timer */}
      {gameStarted && !result && (
        <div className="bg-black border-b border-pink-500/20">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-medium text-gray-200">Time Remaining</span>
              </div>
              <div className={`text-2xl font-bold ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                {timeLeft}s
              </div>
            </div>
            <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
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

      {/* Scrollable Challenge Card */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-safe-offset-32 pt-6 pb-8">
        <div className="max-w-2xl mx-auto px-4 py-6">
        {!result ? (
          <Card className="mb-6 bg-neutral-900 border-pink-500/30">
            <CardContent className="pt-6">
              {/* Profile Preview */}
              <div className="flex items-start gap-4 mb-6 pb-6 border-b border-pink-500/20">
                <div className="text-6xl">{challenge.image}</div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-white mb-2">{challenge.name}</h2>
                  <p className="text-gray-300 mb-3">{challenge.bio}</p>
                  <div className="bg-blue-950/40 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-sm text-gray-200">"{challenge.prompt}"</p>
                  </div>
                </div>
              </div>

              {/* Message Input */}
              {!gameStarted ? (
                <div className="text-center space-y-4">
                  <div className="bg-orange-950/40 border border-orange-500/30 rounded-lg p-4">
                    <Target className="w-12 h-12 text-orange-400 mx-auto mb-3" />
                    <h3 className="font-bold text-lg mb-2 text-white">Ready to shoot your shot?</h3>
                    <p className="text-sm text-gray-300 mb-4">
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
                    <label className="block text-sm font-semibold text-gray-200 mb-2">
                      Your ONE shot:
                    </label>
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={`Message ${challenge.name}...`}
                      className="min-h-32 text-base resize-none bg-black/60 border-pink-500/30 text-white placeholder:text-gray-500"
                      maxLength={200}
                      disabled={!isActive}
                    />
                    <div className="text-right text-xs text-gray-400 mt-1">
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
          <Card className={`border-2 bg-neutral-900 ${
            resultInfo?.color === 'green' ? 'border-green-500/60' :
            resultInfo?.color === 'orange' ? 'border-orange-500/60' :
            'border-red-500/60'
          }`}>
            <CardContent className="pt-6">
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">{resultInfo?.emoji}</div>
                <h2 className="text-3xl font-bold mb-3 text-white">{resultInfo?.title}</h2>
                <p className="text-lg leading-relaxed text-gray-300">{resultInfo?.message}</p>
              </div>

              {message && (
                <div className="bg-black/60 rounded-lg p-4 mb-6 border-2 border-pink-500/20">
                  <p className="text-sm text-gray-400 mb-2 font-semibold">Your message:</p>
                  <p className="text-gray-100">"{message}"</p>
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
    </div>
  );
};

export default ShootYourShot;
