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
  },
  // --- NEW QUESTIONS (IDs 101–130) ---
  {
    id: 101,
    personality: 'The Adventurer',
    situation: "They posted a foggy mountain photo with no caption.",
    options: [
      "Where was this taken?",
      "That view looks unreal — sunrise or sunset?",
      "Nice picture",
      "I like mountains"
    ],
    correctIndex: 1,
    feedback: {
      correct: "Perfect! Specific + shows you're engaged.",
      incorrect: "Too generic. Ask something specific about the photo."
    }
  },
  {
    id: 102,
    personality: 'The Creative',
    situation: "Their bio says: 'Creating more than consuming.'",
    options: [
      "What are you creating lately?",
      "I like that quote",
      "Sounds deep",
      "Creativity is cool"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Direct and invites them to share.",
      incorrect: "Too vague. Ask about their creative work."
    }
  },
  {
    id: 103,
    personality: 'The Foodie',
    situation: "They shared a failed baking story.",
    options: [
      "What went wrong?",
      "Baking is hard",
      "At least you tried",
      "Food fails happen"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Nice! Invites storytelling.",
      incorrect: "Too generic. Show curiosity."
    }
  },
  {
    id: 104,
    personality: 'The Thinker',
    situation: "Their profile says: 'Asking better questions.'",
    options: [
      "What’s a question you’re obsessed with lately?",
      "That’s interesting",
      "I ask questions too",
      "Nice bio"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Excellent! Meta and engaging.",
      incorrect: "Be more specific about their interest."
    }
  },
  {
    id: 105,
    personality: 'The Minimalist',
    situation: "They mention cutting social media time.",
    options: [
      "What did you replace it with?",
      "That’s healthy",
      "Social media is bad",
      "Good choice"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Shows curiosity about their habits.",
      incorrect: "Ask about what they do instead."
    }
  },
  {
    id: 106,
    personality: 'The Adventurer',
    situation: "They posted a video of a waterfall hike.",
    options: [
      "How slippery was it?",
      "Waterfalls are cool",
      "Did you swim?",
      "Nice hike"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Specific detail question.",
      incorrect: "Be more specific about the experience."
    }
  },
  {
    id: 107,
    personality: 'The Creative',
    situation: "They shared a sketchbook doodle.",
    options: [
      "What inspired this doodle?",
      "I like drawing too",
      "Nice sketch",
      "Art is fun"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Nice! Asks about their process.",
      incorrect: "Ask about their inspiration."
    }
  },
  {
    id: 108,
    personality: 'The Foodie',
    situation: "They posted a ramen review.",
    options: [
      "What made it stand out?",
      "I love ramen",
      "Was it spicy?",
      "Good review"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Invites detailed response.",
      incorrect: "Ask what made it special."
    }
  },
  {
    id: 109,
    personality: 'The Thinker',
    situation: "They quoted a philosopher in their bio.",
    options: [
      "Why that quote?",
      "Philosophy is deep",
      "I like quotes",
      "Nice bio"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Shows interest in their values.",
      incorrect: "Ask why it matters to them."
    }
  },
  {
    id: 110,
    personality: 'The Minimalist',
    situation: "They posted a photo of a tidy desk.",
    options: [
      "How do you keep it so clean?",
      "Nice desk",
      "Minimalism is cool",
      "I need tips"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Asks for their method.",
      incorrect: "Ask about their system."
    }
  },
  {
    id: 111,
    personality: 'The Adventurer',
    situation: "They shared a story about getting lost hiking.",
    options: [
      "How did you find your way?",
      "Getting lost is scary",
      "I get lost too",
      "Nice story"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Nice! Invites the adventure story.",
      incorrect: "Ask about the resolution."
    }
  },
  {
    id: 112,
    personality: 'The Creative',
    situation: "They posted a photo of a mural they painted.",
    options: [
      "How long did it take?",
      "I love murals",
      "Nice painting",
      "Art is hard"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Shows interest in process.",
      incorrect: "Ask about their work process."
    }
  },
  {
    id: 113,
    personality: 'The Foodie',
    situation: "They posted a photo of homemade pizza.",
    options: [
      "What toppings did you use?",
      "I love pizza",
      "Looks tasty",
      "Homemade is best"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Specific question.",
      incorrect: "Ask about specifics."
    }
  },
  {
    id: 114,
    personality: 'The Thinker',
    situation: "They posted a book about psychology.",
    options: [
      "What did you learn?",
      "Psychology is cool",
      "I read too",
      "Nice book"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Invites insight sharing.",
      incorrect: "Ask what they learned."
    }
  },
  {
    id: 115,
    personality: 'The Minimalist',
    situation: "They posted about decluttering their closet.",
    options: [
      "What was hardest to let go?",
      "Decluttering is hard",
      "I need to declutter",
      "Good job"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Nice! Personal and thoughtful.",
      incorrect: "Ask about the emotional side."
    }
  },
  {
    id: 116,
    personality: 'The Adventurer',
    situation: "They posted a photo from a solo road trip.",
    options: [
      "What was your favorite stop?",
      "Road trips are fun",
      "I want to travel",
      "Nice trip"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Invites storytelling.",
      incorrect: "Ask about highlights."
    }
  },
  {
    id: 117,
    personality: 'The Creative',
    situation: "They posted a poem about rain.",
    options: [
      "What inspired the poem?",
      "I write poems too",
      "Nice poem",
      "Rain is nice"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Shows genuine interest.",
      incorrect: "Ask about inspiration."
    }
  },
  {
    id: 118,
    personality: 'The Foodie',
    situation: "They posted a photo of a food festival.",
    options: [
      "What was the best bite?",
      "Food festivals are fun",
      "I love food",
      "Nice festival"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Specific and fun.",
      incorrect: "Ask for their favorite."
    }
  },
  {
    id: 119,
    personality: 'The Thinker',
    situation: "They posted a TED talk link.",
    options: [
      "What did you take away?",
      "TED talks are cool",
      "I watch TED too",
      "Nice link"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Excellent! Invites reflection.",
      incorrect: "Ask what they learned."
    }
  },
  {
    id: 120,
    personality: 'The Minimalist',
    situation: "They posted about a capsule wardrobe.",
    options: [
      "What’s your go-to piece?",
      "Capsule wardrobes are smart",
      "I want one",
      "Nice style"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Nice! Personal and specific.",
      incorrect: "Ask about favorites."
    }
  },
  {
    id: 121,
    personality: 'The Adventurer',
    situation: "They posted a photo of a kayak trip.",
    options: [
      "Where did you paddle?",
      "Kayaking is fun",
      "I want to try",
      "Nice trip"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Location question.",
      incorrect: "Ask about the location."
    }
  },
  {
    id: 122,
    personality: 'The Creative',
    situation: "They posted a photo of a handmade mug.",
    options: [
      "How did you make it?",
      "I love mugs",
      "Nice work",
      "Pottery is cool"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Process question.",
      incorrect: "Ask about the making."
    }
  },
  {
    id: 123,
    personality: 'The Foodie',
    situation: "They posted a photo of a food truck meal.",
    options: [
      "What did you order?",
      "Food trucks are great",
      "I love street food",
      "Nice meal"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Nice! Direct and specific.",
      incorrect: "Ask what they got."
    }
  },
  {
    id: 124,
    personality: 'The Thinker',
    situation: "They posted a quote about curiosity.",
    options: [
      "Why does it resonate?",
      "Curiosity is important",
      "I like quotes",
      "Nice post"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Personal connection.",
      incorrect: "Ask why it matters."
    }
  },
  {
    id: 125,
    personality: 'The Minimalist',
    situation: "They posted about living with less.",
    options: [
      "What’s the biggest benefit?",
      "Living with less is smart",
      "I want to try",
      "Good idea"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Value question.",
      incorrect: "Ask about the benefits."
    }
  },
  {
    id: 126,
    personality: 'The Adventurer',
    situation: "They posted a photo of a mountain bike trail.",
    options: [
      "How tough was the trail?",
      "Mountain biking is cool",
      "I want to bike",
      "Nice trail"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Nice! Difficulty question.",
      incorrect: "Ask about the challenge."
    }
  },
  {
    id: 127,
    personality: 'The Creative',
    situation: "They posted a photo of a painted tote bag.",
    options: [
      "What inspired the design?",
      "I love tote bags",
      "Nice painting",
      "Art is fun"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Design question.",
      incorrect: "Ask about inspiration."
    }
  },
  {
    id: 128,
    personality: 'The Foodie',
    situation: "They posted a photo of a dessert table.",
    options: [
      "What was your favorite dessert?",
      "Desserts are great",
      "I love sweets",
      "Nice table"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Choice question.",
      incorrect: "Ask for their pick."
    }
  },
  {
    id: 129,
    personality: 'The Thinker',
    situation: "They posted a question about happiness.",
    options: [
      "What’s your answer?",
      "Happiness is important",
      "I think about that too",
      "Nice question"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Nice! Turns it back.",
      incorrect: "Ask for their perspective."
    }
  },
  {
    id: 130,
    personality: 'The Minimalist',
    situation: "They posted a photo of a simple meal.",
    options: [
      "What’s your go-to simple meal?",
      "Simple meals are best",
      "I like simple food",
      "Nice meal"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Recipe question.",
      incorrect: "Ask about their routine."
    }
  },
  // --- NEW TOUGH & REALISTIC QUESTIONS (IDs 131–165) --- 
  {
    id: 131,
    personality: 'The Overthinker',
    situation: "They mention ghosting makes them anxious. What's your opener?",
    options: [
      "What's your take on honest goodbyes vs. ghosting?",
      "Ghosting is the worst, right?",
      "I try not to ghost anyone.",
      "Why does it make you anxious?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Invites a nuanced conversation about boundaries and honesty.",
      incorrect: "Try to open a real discussion, not just agree or dismiss."
    }
  },
  {
    id: 132,
    personality: 'The Workaholic',
    situation: "They say they're always 'on call' for work.",
    options: [
      "How do you unwind when you finally get a break?",
      "Work must be stressful!",
      "I could never do that.",
      "Do you like your job?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Shows empathy and curiosity about their coping strategies.",
      incorrect: "Ask about their life outside work, not just the job itself."
    }
  },
  {
    id: 133,
    personality: 'The Parent',
    situation: "They mention co-parenting and busy weekends.",
    options: [
      "What's your favorite way to spend a rare kid-free day?",
      "Parenting is hard!",
      "I don't have kids, but respect.",
      "How many kids do you have?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Excellent! Focuses on their identity beyond parenting.",
      incorrect: "Ask about their personal joys, not just the fact they have kids."
    }
  },
  {
    id: 134,
    personality: 'The Activist',
    situation: "They post about climate marches and volunteering.",
    options: [
      "What cause are you most passionate about right now?",
      "Activism is important!",
      "I support the environment too.",
      "Marches look fun."
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Invites them to share their current focus.",
      incorrect: "Ask about their passion, not just agree."
    }
  },
  {
    id: 135,
    personality: 'The Traveler',
    situation: "They've lived in 4 countries in 5 years.",
    options: [
      "What surprised you most about moving so often?",
      "That's a lot of moving!",
      "Which country was your favorite?",
      "I wish I could travel that much."
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Asks for a deeper reflection, not just a list.",
      incorrect: "Ask about their experience, not just the places."
    }
  },
  {
    id: 136,
    personality: 'The Skeptic',
    situation: "Their bio says: 'Prove me wrong.'",
    options: [
      "What's a belief you secretly wish was true?",
      "I love debates!",
      "Why so skeptical?",
      "Challenge accepted!"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Excellent! Flips the script and invites vulnerability.",
      incorrect: "Try to open a real discussion, not just banter."
    }
  },
  {
    id: 137,
    personality: 'The Healer',
    situation: "They mention therapy and self-growth.",
    options: [
      "What's a lesson from therapy that stuck with you?",
      "Therapy is great!",
      "I believe in self-growth too.",
      "Do you go every week?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Invites a meaningful, personal story.",
      incorrect: "Ask for a takeaway, not just agree."
    }
  },
  {
    id: 138,
    personality: 'The Pet Parent',
    situation: "They post about fostering rescue animals.",
    options: [
      "What's the most rewarding part of fostering?",
      "I love animals too!",
      "How many pets do you have?",
      "That's so kind of you."
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Focuses on their motivation and joy.",
      incorrect: "Ask about their experience, not just the number of pets."
    }
  },
  {
    id: 139,
    personality: 'The Night Owl',
    situation: "They mention being most creative at 2am.",
    options: [
      "What's your favorite late-night project?",
      "I stay up late too!",
      "Why 2am?",
      "Do you sleep in?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Invites them to share their passion.",
      incorrect: "Ask about their creativity, not just their sleep."
    }
  },
  {
    id: 140,
    personality: 'The Realist',
    situation: "Their profile says: 'No games, just honesty.'",
    options: [
      "What's the most honest thing you've learned about yourself?",
      "I like honesty too!",
      "Why no games?",
      "Are you always this direct?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Excellent! Invites a real, self-aware answer.",
      incorrect: "Ask for a story, not just agree."
    }
  },
  {
    id: 141,
    personality: 'The Food Adventurer',
    situation: "They post about trying bugs in Thailand.",
    options: [
      "What food experience pushed you out of your comfort zone?",
      "I could never eat bugs!",
      "Thailand looks fun.",
      "What's the weirdest thing you've tried?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Invites a story about growth and risk.",
      incorrect: "Ask about their experience, not just the food."
    }
  },
  {
    id: 142,
    personality: 'The Philosopher',
    situation: "They quote Camus and talk about meaning.",
    options: [
      "What's a question you wrestle with lately?",
      "Philosophy is cool!",
      "I like Camus too.",
      "Why meaning?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Invites a deep, open-ended answer.",
      incorrect: "Ask for their thoughts, not just agree."
    }
  },
  {
    id: 143,
    personality: 'The Athlete',
    situation: "They mention marathon training and early mornings.",
    options: [
      "What keeps you motivated on tough days?",
      "I could never run that far!",
      "How early do you wake up?",
      "Do you run every day?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Excellent! Focuses on their mindset, not just the activity.",
      incorrect: "Ask about their motivation, not just the routine."
    }
  },
  {
    id: 144,
    personality: 'The Musician',
    situation: "They post about busking in the subway.",
    options: [
      "What's your wildest subway performance story?",
      "I play music too!",
      "Do you get nervous?",
      "What instrument do you play?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Invites a memorable story.",
      incorrect: "Ask for a story, not just a fact."
    }
  },
  {
    id: 145,
    personality: 'The Gamer',
    situation: "They mention rage-quitting and competitive games.",
    options: [
      "What's your funniest rage-quit moment?",
      "I get mad at games too!",
      "Why so competitive?",
      "What games do you play?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Invites a funny, self-aware story.",
      incorrect: "Ask for a story, not just a confession."
    }
  },
  {
    id: 146,
    personality: 'The Dater',
    situation: "They mention being burned by dating apps before.",
    options: [
      "What's something you wish more people did on first dates?",
      "Dating apps are tough!",
      "Why do you keep trying?",
      "Have you had any good dates?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Invites a positive, constructive answer.",
      incorrect: "Ask for their ideal, not just their complaints."
    }
  },
  {
    id: 147,
    personality: 'The Sibling',
    situation: "They post about being a twin.",
    options: [
      "What's the weirdest twin moment you've had?",
      "I always wanted a twin!",
      "Are you identical?",
      "Do you get mixed up a lot?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Excellent! Invites a unique, personal story.",
      incorrect: "Ask for a story, not just a fact."
    }
  },
  {
    id: 148,
    personality: 'The Entrepreneur',
    situation: "They mention launching a startup during the pandemic.",
    options: [
      "What was your biggest lesson from launching in chaos?",
      "Startups are risky!",
      "Why during the pandemic?",
      "Is it still going?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Great! Invites a story about resilience and learning.",
      incorrect: "Ask about their journey, not just the timing."
    }
  },
  {
    id: 149,
    personality: 'The Survivor',
    situation: "They mention overcoming a major illness.",
    options: [
      "What's something you appreciate more now?",
      "That must have been hard!",
      "Are you fully recovered?",
      "How did you get through it?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Perfect! Focuses on growth and gratitude.",
      incorrect: "Ask about their perspective, not just the event."
    }
  },
  {
    id: 150,
    personality: 'The Bookworm',
    situation: "They post about reading banned books.",
    options: [
      "What's a book that changed your mind?",
      "I love reading too!",
      "Why banned books?",
      "What's your favorite book?"
    ],
    correctIndex: 0,
    feedback: {
      correct: "Excellent! Invites a story about transformation.",
      incorrect: "Ask for a story, not just a title."
    }
  },
  // ...add more up to id: 165 following this pattern...
];

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
        setScenarios(randomized);
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
      <div className="h-screen bg-gradient-to-br from-yellow-50 to-orange-50 flex flex-col">
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
    <div className="h-screen bg-gradient-to-br from-yellow-50 to-orange-50 flex flex-col">
      {/* Header */}
      <div className="pt-safe pt-10 bg-white border-b shadow-sm sticky top-0 z-10">
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
