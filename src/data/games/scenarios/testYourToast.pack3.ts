import { ScenarioPack } from '../types';

// PACK 3: FOOD / LIFESTYLE
export const pack3: ScenarioPack = {
  packId: 3,
  scenarios: [
    {
      id: 301,
      personality: 'Fermentation Fan',
      situation: "Fermentation experiments.",
      options: [
        "What's fermenting right now?",
        "That's unique",
        "Fermentation is such an interesting culinary technique with deep history",
        "Sounds weird"
      ],
      correctIndex: 0,
      quality: 'optimal', // super short
      feedback: {
        correct: "Perfect! Direct, curious, and invites them to share current projects.",
        incorrect: "Too judgmental or verbose. Just ask what they're working on."
      }
    },
    {
      id: 302,
      personality: 'Meal Prepper',
      situation: "Meal prep Sundays.",
      options: [
        "Meal prep Sundays—chaos or zen?",
        "That's organized",
        "I really admire people who have the discipline to meal prep",
        "Do you like cooking?"
      ],
      correctIndex: 0,
      quality: 'optimal', // short + playful either/or
      feedback: {
        correct: "Great! Playful framing makes it easy and fun to answer.",
        incorrect: "Too generic. Create a scenario or ask about their process."
      }
    },
    {
      id: 303,
      personality: 'Latte Artist',
      situation: "Posts latte art fails.",
      options: [
        "I think it's brave to share the fails instead of just the wins",
        "Latte art fails are still art. What's your best 'it was supposed to be a swan'?",
        "Coffee is good",
        "That's funny"
      ],
      correctIndex: 1,
      quality: 'optimal',
      feedback: {
        correct: "Love it! Playful, specific, and invites a funny story.",
        incorrect: "Too generic. Engage with the humor and ask for a specific fail."
      }
    },
    {
      id: 304,
      personality: 'Food Love Language',
      situation: "Bio: 'Food is my love language.'",
      options: [
        "What's your signature dish?",
        "Food is important",
        "I completely understand that sentiment because food brings people together",
        "Same here"
      ],
      correctIndex: 0,
      quality: 'optimal', // short and direct
      feedback: {
        correct: "Perfect! Short, specific, and invites them to share pride.",
        incorrect: "Too vague or agreeable. Ask for specifics."
      }
    },
    {
      id: 305,
      personality: 'Travel Foodie',
      situation: "Travel food reels.",
      options: [
        "Which city had the best street food?",
        "Food looks good",
        "Traveling for food is such a unique and enriching way to experience culture",
        "I like food travel too"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Nice! Specific, easy to answer, and invites comparison.",
        incorrect: "Too broad or wordy. Ask a tight question about their experiences."
      }
    },
    {
      id: 306,
      personality: 'Bread Baker',
      situation: "Homemade sourdough.",
      options: [
        "Sourdough! How old's your starter and does it have a name?",
        "Bread is nice",
        "That's impressive",
        "I've heard sourdough is difficult but rewarding to make at home"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Excellent! Shows you know the culture and asks a fun question.",
        incorrect: "Too generic. Reference starter culture (literally)."
      }
    },
    {
      id: 307,
      personality: 'Stress Cook',
      situation: "Cooks for stress relief.",
      options: [
        "What do you make when stressed?",
        "That's healthy",
        "Cooking as therapy makes a lot of sense to me",
        "Food helps"
      ],
      correctIndex: 0,
      quality: 'optimal', // short and specific
      feedback: {
        correct: "Great! Simple, direct, and invites them to share rituals.",
        incorrect: "Too vague. Ask what they actually cook."
      }
    },
    {
      id: 308,
      personality: 'Food Truck Hunter',
      situation: "Food truck reviews.",
      options: [
        "What's the best truck find so far?",
        "Food trucks are fun",
        "I appreciate people who support local food businesses like food trucks",
        "That's cool"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Specific, easy to answer, and invites enthusiasm.",
        incorrect: "Too generic. Ask for their favorite find."
      }
    },
    {
      id: 309,
      personality: 'Spice Warrior',
      situation: "Spice tolerance brag.",
      options: [
        "What's your spice limit?",
        "Brave",
        "I think high spice tolerance is both impressive and potentially concerning",
        "I like spicy food too"
      ],
      correctIndex: 0,
      quality: 'optimal', // super short
      feedback: {
        correct: "Love it! Short, direct, and invites a fun challenge response.",
        incorrect: "Too wordy or generic. Keep it simple."
      }
    },
    {
      id: 310,
      personality: 'Recipe Keeper',
      situation: "Recipe notebook photo.",
      options: [
        "Recipe notebook—family recipes or experiments?",
        "That's organized",
        "I love the idea of keeping a physical recipe book in a digital age",
        "Notebooks are nice"
      ],
      correctIndex: 0,
      quality: 'optimal', // either/or
      feedback: {
        correct: "Great! Either/or makes it easy and reveals something personal.",
        incorrect: "Too generic. Ask what kind of recipes they collect."
      }
    }
  ]
};
