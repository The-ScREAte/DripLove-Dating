// Auto-populated fun questions for user selection
export const FUN_QUESTIONS = {
  fun_fact: [
    "I can speak three languages fluently",
    "I've never broken a bone in my body",
    "I collect vintage postcards from around the world",
    "I can solve a Rubik's cube in under 2 minutes",
    "I've visited 5 different countries this year",
    "I can cook traditional dishes from 4 different cultures",
    "I once performed on stage in front of 500 people",
    "I've run a half marathon without training",
    "I can play 3 musical instruments",
    "I'm a certified yoga instructor",
    "I've never watched Star Wars",
    "I can recite the alphabet backwards in 10 seconds",
    "I've been to a concert of my favorite artist 7 times",
    "I can juggle with 3 balls",
    "I've never owned a car and use public transport everywhere"
  ],
  
  perfect_first_date: [
    "Coffee shop conversation followed by a walk in the park",
    "Cooking dinner together and watching our favorite movies",
    "Mini golf and ice cream after",
    "Art gallery tour and lunch at a cozy restaurant",
    "Hiking a scenic trail and having a picnic",
    "Farmers market shopping and cooking together",
    "Beach sunset walk and seafood dinner",
    "Bowling and arcade games",
    "Museum visit and afternoon tea",
    "Live music at a local venue",
    "Bookstore browsing and café discussion",
    "Food truck hopping around the city",
    "Escape room challenge and celebratory drinks",
    "Outdoor movie screening with homemade snacks",
    "Pottery class followed by dinner"
  ],
  
  last_googled: [
    "How to make the perfect pasta sauce",
    "Best hidden gems in my city",
    "Why do cats purr when they're happy",
    "How to grow herbs indoors",
    "Best workout routines for beginners",
    "How to say 'hello' in 10 different languages",
    "What's the difference between empathy and sympathy",
    "How to fold a fitted sheet properly",
    "Best books to read this year",
    "How to make friends as an adult",
    "Why is the sky blue",
    "How to meditation for stress relief",
    "Best date night ideas on a budget",
    "How to learn a new skill in 30 days",
    "What makes people genuinely happy"
  ]
};

export type QuestionType = keyof typeof FUN_QUESTIONS;
