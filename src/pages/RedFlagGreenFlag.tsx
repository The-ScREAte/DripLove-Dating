import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ThumbsUp, ThumbsDown, Star, Trash2, Home } from 'lucide-react';
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
  },
  {
    id: 16,
    type: 'text',
    content: '"You\'re too pretty to be on here. What\'s wrong with you?"',
    isRedFlag: true,
    explanation: "🚩 Backhanded compliment! Implying something is wrong with you is manipulative and disrespectful."
  },
  {
    id: 17,
    type: 'behavior',
    content: "Listens actively during conversation and asks follow-up questions",
    isRedFlag: false,
    explanation: "💚 Shows genuine interest! People who listen and engage make the best partners."
  },
  {
    id: 18,
    type: 'profile',
    content: 'Bio: "My ex was crazy" or similar complaints about past relationships',
    isRedFlag: true,
    explanation: "🚩 Talks badly about exes = red flag. Shows they might not take accountability and could do the same to you."
  },
  {
    id: 19,
    type: 'text',
    content: '"I noticed you\'re into photography. Do you have any favorite shots you\'ve taken recently?"',
    isRedFlag: false,
    explanation: "💚 Thoughtful opener! References your interests and invites you to share something you're passionate about."
  },
  {
    id: 20,
    type: 'behavior',
    content: "Pressures you to send photos or move to WhatsApp/text immediately",
    isRedFlag: true,
    explanation: "🚩 Rushing off the app quickly is suspicious. Genuine people are fine taking things at your pace."
  },
  {
    id: 21,
    type: 'profile',
    content: 'Shows verification badge and recent activity',
    isRedFlag: false,
    explanation: "💚 Verified profiles show they're real and serious about dating safely."
  },
  {
    id: 22,
    type: 'text',
    content: '"Not really looking for anything serious right now, just keeping it casual"',
    isRedFlag: false,
    explanation: "💚 Honest communication about intentions! It's a green flag when someone is upfront, even if their goals don't match yours."
  },
  {
    id: 23,
    type: 'behavior',
    content: "Love bombs you with excessive compliments and talks about the future after one date",
    isRedFlag: true,
    explanation: "🚩 Love bombing is a manipulation tactic! Healthy relationships build gradually, not overnight."
  },
  {
    id: 24,
    type: 'profile',
    content: 'Has multiple photos doing different activities and hobbies',
    isRedFlag: false,
    explanation: "💚 Shows they have a full life and interests! You want someone who's well-rounded and active."
  },
  {
    id: 25,
    type: 'text',
    content: '"I can\'t stand when people [insert complaint about entire gender]"',
    isRedFlag: true,
    explanation: "🚩 Generalizing and complaining about an entire gender shows bitterness and unresolved issues."
  },
  {
    id: 26,
    type: 'behavior',
    content: "Respects when you say you need time to think or want to take things slow",
    isRedFlag: false,
    explanation: "💚 Respecting boundaries is essential! Someone who pressures you doesn't respect you."
  },
  {
    id: 27,
    type: 'profile',
    content: 'Bio mentions height requirement: "Must be 6ft+" or similar',
    isRedFlag: true,
    explanation: "🚩 Overly focused on physical requirements shows shallow priorities. Real connections go deeper than measurements."
  },
  {
    id: 28,
    type: 'text',
    content: '"Hey! 👋 How was your weekend?"',
    isRedFlag: false,
    explanation: "💚 Simple, friendly, and open-ended. Sometimes the best openers are the straightforward ones!"
  },
  {
    id: 29,
    type: 'behavior',
    content: "Flakes on plans multiple times without rescheduling",
    isRedFlag: true,
    explanation: "🚩 If someone keeps canceling and doesn't make effort to reschedule, they're not that interested. Move on!"
  },
  {
    id: 30,
    type: 'profile',
    content: 'Profile shows them volunteering, with pets, or doing community activities',
    isRedFlag: false,
    explanation: "💚 Shows compassion and values! People who care about others make great partners."
  },
  {
    id: 31,
    type: 'text',
    content: '"Why are you still single? You seem perfect"',
    isRedFlag: true,
    explanation: "🚩 Seems like a compliment but implies something must be wrong with you. It's a subtle put-down."
  },
  {
    id: 32,
    type: 'behavior',
    content: "Shares memes and jokes that match your humor",
    isRedFlag: false,
    explanation: "💚 Humor compatibility matters! Someone who gets your jokes makes everything more fun."
  },
  {
    id: 33,
    type: 'profile',
    content: 'All selfies from the same angle with heavy filters',
    isRedFlag: true,
    explanation: "🚩 Heavily filtered photos can be misleading. You want someone who's comfortable showing their real self."
  },
  {
    id: 34,
    type: 'text',
    content: '"I saw your profile and we have so much in common! Tell me more about your art"',
    isRedFlag: false,
    explanation: "💚 Shows they paid attention and want to learn more about you. Genuine interest is attractive!"
  },
  {
    id: 35,
    type: 'behavior',
    content: "Becomes jealous or possessive before you're even in a relationship",
    isRedFlag: true,
    explanation: "🚩 Early jealousy is a major warning sign! Healthy relationships are built on trust, not control."
  },
  {
    id: 36,
    type: 'profile',
    content: 'Bio: "Swipe left if you can\'t handle me at my worst"',
    isRedFlag: true,
    explanation: "🚩 This phrase is often used to excuse bad behavior. You deserve someone at their best!"
  },
  {
    id: 37,
    type: 'text',
    content: '"I really enjoyed talking with you today. Let me know when you\'re free to continue this conversation!"',
    isRedFlag: false,
    explanation: "💚 Expresses interest while respecting your schedule. This is considerate and mature!"
  },
  {
    id: 38,
    type: 'behavior',
    content: "Checks in during the day with sweet messages without being overwhelming",
    isRedFlag: false,
    explanation: "💚 Thoughtful check-ins show they're thinking of you! The key is balance - not too much, not too little."
  },
  {
    id: 39,
    type: 'profile',
    content: 'Profile picture is clearly cropped to remove someone else',
    isRedFlag: true,
    explanation: "🚩 Poorly cropped ex photos suggest they're not over the relationship or just lazy with their profile."
  },
  {
    id: 40,
    type: 'text',
    content: '"You up?" at 2 AM as the first message ever',
    isRedFlag: true,
    explanation: "🚩 Late night first messages are never about getting to know you. They want one thing."
  },
  {
    id: 41,
    type: 'behavior',
    content: "Remembers small details you mentioned in passing",
    isRedFlag: false,
    explanation: "💚 Paying attention to details shows they truly care and value what you say!"
  },
  {
    id: 42,
    type: 'profile',
    content: 'Bio: "Entrepreneur" but profile looks fake or too perfect',
    isRedFlag: true,
    explanation: "🚩 'Entrepreneur' with model photos is often a scam profile. Trust your instincts if something feels off."
  },
  {
    id: 43,
    type: 'text',
    content: '"I\'m not really the texting type, prefer to meet in person"',
    isRedFlag: true,
    explanation: "🚩 While some people prefer calls, refusing to text at all before meeting is suspicious and unsafe."
  },
  {
    id: 44,
    type: 'behavior',
    content: "Introduces you to their friends early on without pressure",
    isRedFlag: false,
    explanation: "💚 Meeting friends shows they're serious and proud to have you in their life!"
  },
  {
    id: 45,
    type: 'profile',
    content: 'Multiple photos with different hairstyles, outfits, and settings showing personality',
    isRedFlag: false,
    explanation: "💚 Variety shows authenticity! You get a real sense of who they are and what they enjoy."
  },
  {
    id: 46,
    type: 'text',
    content: '"I don\'t usually use these apps but there\'s something about you..."',
    isRedFlag: true,
    explanation: "🚩 This line is used to make you feel special but it's usually manipulation. Everyone on the app uses the app!"
  },
  {
    id: 47,
    type: 'behavior',
    content: "Asks about your day and genuinely listens to the answer",
    isRedFlag: false,
    explanation: "💚 Simple but important! Caring about your daily life shows they want to be part of it."
  },
  {
    id: 48,
    type: 'profile',
    content: 'Bio: "If you can\'t keep up with me, swipe left" or similar challenge',
    isRedFlag: true,
    explanation: "🚩 Challenging people to 'keep up' is arrogant and off-putting. Relationships are partnerships, not competitions."
  },
  {
    id: 49,
    type: 'text',
    content: '"I\'m so tired of all the fake people on here. You seem different though"',
    isRedFlag: true,
    explanation: "🚩 Complaining about others while complimenting you is a manipulation tactic to make you feel special."
  },
  {
    id: 50,
    type: 'behavior',
    content: "Shows up on time and follows through on what they say they'll do",
    isRedFlag: false,
    explanation: "💚 Reliability is so attractive! Someone who keeps their word is someone you can trust."
  },
  {
    id: 51,
    type: 'profile',
    content: 'Bio lists specific interests and what they\'re looking for in a partner',
    isRedFlag: false,
    explanation: "💚 Clear about who they are and what they want. No games, no guessing!"
  },
  {
    id: 52,
    type: 'text',
    content: '"Send me a pic so I know you\'re real"',
    isRedFlag: true,
    explanation: "🚩 Demanding photos is pushy and controlling. Your profile photos are enough to start a conversation."
  },
  {
    id: 53,
    type: 'behavior',
    content: "Constantly on their phone during your date",
    isRedFlag: true,
    explanation: "🚩 Not giving you attention on a date shows lack of respect and interest. You deserve someone present!"
  },
  {
    id: 54,
    type: 'profile',
    content: 'Profile mentions they just got out of a serious relationship',
    isRedFlag: true,
    explanation: "🚩 Fresh out of a relationship usually means they're not ready for something new. You might be a rebound."
  },
  {
    id: 55,
    type: 'text',
    content: '"Your smile in that third pic is amazing! What were you doing there?"',
    isRedFlag: false,
    explanation: "💚 Compliments a specific photo and asks about the story behind it. Great conversation starter!"
  },
  {
    id: 56,
    type: 'behavior',
    content: "Offers to video chat before meeting in person",
    isRedFlag: false,
    explanation: "💚 Video chatting first is smart! It helps verify they're real and builds comfort before meeting."
  },
  {
    id: 57,
    type: 'profile',
    content: 'Bio: "Venmo me $5 and see what happens 😉"',
    isRedFlag: true,
    explanation: "🚩 Anyone asking for money on a dating app is either a scammer or not serious. Block immediately!"
  },
  {
    id: 58,
    type: 'text',
    content: '"I\'m actually not looking for hookups. I\'d love to get to know you properly"',
    isRedFlag: false,
    explanation: "💚 Being upfront about wanting something genuine shows maturity and saves everyone time!"
  },
  {
    id: 59,
    type: 'behavior',
    content: "Defensive and argues when you express a concern or boundary",
    isRedFlag: true,
    explanation: "🚩 Can't handle feedback or respect boundaries = big problem. Healthy people communicate, they don't fight you."
  },
  {
    id: 60,
    type: 'profile',
    content: 'Photos show them with family, at events, and living a balanced life',
    isRedFlag: false,
    explanation: "💚 Family connections and balance are positive signs of someone emotionally healthy!"
  },
  {
    id: 61,
    type: 'text',
    content: '"Sorry, just saw this!" after 3 days... for the 5th time',
    isRedFlag: true,
    explanation: "🚩 Pattern of slow responses shows lack of interest or poor communication habits."
  },
  {
    id: 62,
    type: 'behavior',
    content: 'Asks about your boundaries and respects them when you set them',
    isRedFlag: false,
    explanation: "💚 Respecting boundaries is fundamental to healthy relationships!"
  },
  {
    id: 63,
    type: 'profile',
    content: 'Bio says: \'Not here for games\' but profile is full of shirtless mirror selfies',
    isRedFlag: true,
    explanation: "🚩 Actions don\'t match words. Mixed signals are a red flag."
  },
  {
    id: 64,
    type: 'text',
    content: '"I\'m really bad at texting, sorry!" but their Instagram story is updated hourly',
    isRedFlag: true,
    explanation: "🚩 They have time for social media but not you? That\'s selective availability."
  },
  {
    id: 65,
    type: 'behavior',
    content: 'Checks in during the day with a simple \"Hope you\'re having a good day!\"',
    isRedFlag: false,
    explanation: "💚 Thoughtful gestures show they\'re thinking about you. Sweet and genuine!"
  },
  {
    id: 66,
    type: 'profile',
    content: 'Every photo has their ex cropped out (you can still see their arm/hand)',
    isRedFlag: true,
    explanation: "🚩 Not moving on from their ex. Take new photos!"
  },
  {
    id: 67,
    type: 'text',
    content: '"What are you looking for?" as their opening message',
    isRedFlag: false,
    explanation: "💚 Direct communication about intentions is mature and saves time!"
  },
  {
    id: 68,
    type: 'behavior',
    content: 'Introduces you to their friends after a few dates',
    isRedFlag: false,
    explanation: "💚 Including you in their social circle shows they\'re serious and proud to know you!"
  },
  {
    id: 69,
    type: 'profile',
    content: 'Bio: \'Brutally honest\' and lists everything they hate',
    isRedFlag: true,
    explanation: "🚩 \'Brutally honest\' usually means \'I\'m rude and call it honesty.\' Negativity is a red flag."
  },
  {
    id: 70,
    type: 'text',
    content: '"I\'m not really a phone person, prefer meeting in person!"',
    isRedFlag: false,
    explanation: "💚 Preferring real connection over endless texting is actually healthy!"
  },
  {
    id: 71,
    type: 'behavior',
    content: 'Cancels plans last minute without rescheduling',
    isRedFlag: true,
    explanation: "🚩 Not rescheduling shows they don\'t value your time or aren\'t that interested."
  },
  {
    id: 72,
    type: 'profile',
    content: 'Has a mix of solo photos, group photos, and hobby photos',
    isRedFlag: false,
    explanation: "💚 Variety shows a well-rounded life and gives you conversation starters!"
  },
  {
    id: 73,
    type: 'text',
    content: '"You\'re not like other girls/guys"',
    isRedFlag: true,
    explanation: "🚩 This line puts others down to compliment you. Not a good look."
  },
  {
    id: 74,
    type: 'behavior',
    content: 'Asks follow-up questions about things you mentioned before',
    isRedFlag: false,
    explanation: "💚 Remembering details and following up shows they actually listen and care!"
  },
  {
    id: 75,
    type: 'profile',
    content: 'Mentions being \'drama-free\' multiple times in bio',
    isRedFlag: true,
    explanation: "🚩 People who claim to be drama-free are often the source of drama."
  },
  {
    id: 76,
    type: 'text',
    content: '"I had a great time! Want to do this again?" after your first date',
    isRedFlag: false,
    explanation: "💚 Clear communication about interest is always a green flag!"
  },
  {
    id: 77,
    type: 'behavior',
    content: 'Only wants to hang out late at night at their place',
    isRedFlag: true,
    explanation: "🚩 No daytime dates? They\'re not interested in actually getting to know you."
  },
  {
    id: 78,
    type: 'profile',
    content: 'Profile shows genuine smiles and natural moments',
    isRedFlag: false,
    explanation: "💚 Authentic photos show confidence and comfort with themselves!"
  },
  {
    id: 79,
    type: 'text',
    content: '"My ex was crazy" without any self-reflection',
    isRedFlag: true,
    explanation: "🚩 If all their exes were \'crazy,\' they\'re probably the common denominator."
  },
  {
    id: 80,
    type: 'behavior',
    content: 'Suggests splitting the check or taking turns paying',
    isRedFlag: false,
    explanation: "💚 Fair dating dynamics show mutual respect and modern values!"
  },
  {
    id: 81,
    type: 'profile',
    content: 'Lists their actual interests instead of \'adventure\' and \'travel\'',
    isRedFlag: false,
    explanation: "💚 Specific interests give you real conversation topics!"
  },
  {
    id: 82,
    type: 'text',
    content: '"What\'s your body count?" early in conversation',
    isRedFlag: true,
    explanation: "🚩 Inappropriate and invasive question this early. Respect boundaries!"
  },
  {
    id: 83,
    type: 'behavior',
    content: 'Offers to pick you up but also says \"or I can meet you there if you\'re more comfortable\"',
    isRedFlag: false,
    explanation: "💚 Considerate of your comfort and safety. Excellent awareness!"
  },
  {
    id: 84,
    type: 'profile',
    content: 'Height requirement in bio: \'Must be over 6ft\' or \'Under 120lbs only\'',
    isRedFlag: true,
    explanation: "🚩 Superficial requirements show they\'re focused on the wrong things."
  },
  {
    id: 85,
    type: 'text',
    content: '"I\'m really busy with work but I\'ll make time for the right person"',
    isRedFlag: false,
    explanation: "💚 Honest about their schedule while showing they\'ll prioritize what matters!"
  },
  {
    id: 86,
    type: 'behavior',
    content: 'Love-bombs you with constant compliments and \'I miss you\' after one date',
    isRedFlag: true,
    explanation: "🚩 Love-bombing is a manipulation tactic. Healthy feelings develop gradually."
  },
  {
    id: 87,
    type: 'profile',
    content: 'Photos include activities, travels, and normal everyday moments',
    isRedFlag: false,
    explanation: "💚 Shows a full, authentic life. This is what you want to see!"
  },
  {
    id: 88,
    type: 'text',
    content: '"I deleted the app! Here\'s my number" after matching',
    isRedFlag: true,
    explanation: "🚩 Too fast. This pressures you to move off-app before you\'re comfortable."
  },
  {
    id: 89,
    type: 'behavior',
    content: 'Apologizes sincerely when they mess up and changes their behavior',
    isRedFlag: false,
    explanation: "💚 Real accountability and change? That\'s relationship gold!"
  },
  {
    id: 90,
    type: 'profile',
    content: 'Bio says \'Fluent in sarcasm\' and nothing else',
    isRedFlag: true,
    explanation: "🚩 Sarcasm as a personality trait? Low effort and tells you nothing about them."
  },
  {
    id: 91,
    type: 'text',
    content: '"I\'m not looking for anything serious" when that\'s what your profile says you want',
    isRedFlag: false,
    explanation: "💚 Honest communication about mismatched intentions saves time for both of you!"
  },
  {
    id: 92,
    type: 'behavior',
    content: 'Talks about future plans that include you after 2-3 dates',
    isRedFlag: true,
    explanation: "🚩 Moving too fast. Healthy relationships take time to develop."
  },
  {
    id: 93,
    type: 'profile',
    content: 'Mentions co-parenting and has photos with their kids (faces hidden)',
    isRedFlag: false,
    explanation: "💚 Transparent about parenting while protecting kids\' privacy. Responsible!"
  },
  {
    id: 94,
    type: 'text',
    content: '"Send me a pic" as their second message',
    isRedFlag: true,
    explanation: "🚩 Focused on looks, not connection. You\'re more than a photo!"
  },
  {
    id: 95,
    type: 'behavior',
    content: 'Has healthy friendships with people of all genders',
    isRedFlag: false,
    explanation: "💚 Secure people have diverse friendships. Shows emotional maturity!"
  },
  {
    id: 96,
    type: 'profile',
    content: 'Every photo is a professional photoshoot with perfect lighting',
    isRedFlag: true,
    explanation: "🚩 Overly curated. You want to see the real person, not a model portfolio."
  },
  {
    id: 97,
    type: 'text',
    content: '"I\'m better in person than over text! Want to grab coffee?"',
    isRedFlag: false,
    explanation: "💚 Self-aware and suggesting a real date. Perfect!"
  },
  {
    id: 98,
    type: 'behavior',
    content: 'Shares their location with a friend when meeting you the first time',
    isRedFlag: false,
    explanation: "💚 Safety-conscious and smart. This is responsible dating!"
  },
  {
    id: 99,
    type: 'profile',
    content: 'Only photos with alcohol/partying, mentions clubbing in every caption',
    isRedFlag: true,
    explanation: "🚩 If that\'s their entire identity, you might have incompatible lifestyles."
  },
  {
    id: 100,
    type: 'text',
    content: '"I\'m going through a lot right now but you seem great!"',
    isRedFlag: true,
    explanation: "🚩 Not ready to date. You deserve someone emotionally available!"
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
      <div className="h-screen bg-gradient-to-br from-red-50 via-pink-50 to-green-50 flex flex-col">
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
                  <p className="text-xs text-gray-600">Red Flag or Green Flag</p>
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
      </div>
    );
  }

  if (gameComplete) {
    const rating = getScoreRating();
    return (
      <div className="h-screen bg-gradient-to-br from-red-50 via-pink-50 to-green-50 flex flex-col">
        <div className="pt-safe pt-10 bg-white border-b shadow-sm sticky top-0 z-10">
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
                <p className="text-xs text-gray-600">Red Flag or Green Flag</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-safe-offset-32 pt-6 pb-8">
          <div className="max-w-2xl mx-auto px-4 py-8">
          <Card>
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
      </div>
    );
  }

  const isCorrect = selectedAnswer === currentScenario.isRedFlag;

  return (
    <div className="h-screen bg-gradient-to-br from-red-50 via-pink-50 to-green-50 flex flex-col">
      {/* Header */}
      <div className="pt-safe pt-10 bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')} title="Home">
                <Home className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/games')} title="Back to Games">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-sm font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">DripLove</h1>
                <p className="text-xs text-gray-600">Red Flag or Green Flag • {currentIndex + 1}/{levelScenarios.length}</p>
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">Lvl {selectedLevel}</div>
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

      {/* Scrollable Game Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-safe-offset-32 pt-6 pb-8">
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
    </div>
  );
};

export default RedFlagGreenFlag;
