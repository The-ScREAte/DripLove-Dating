import { ScenarioPack } from '../types';

// PACK 1: ADVENTURE / ACTIVE + CREATIVE
// Answer length normalized: short can be optimal, long can be poor
export const pack1: ScenarioPack = {
  packId: 1,
  scenarios: [
    {
      id: 101,
      personality: 'Weekend Hiker',
      situation: "They post sunrise hikes every weekend.",
      options: [
        "Which trail pushed you the most?",
        "Sunrise hikes look so peaceful and serene",
        "Hey there",
        "That's really inspiring to see someone so active"
      ],
      correctIndex: 0,
      quality: 'optimal', // short but specific
      feedback: {
        correct: "Perfect! Short, specific, and invites a story. No fluff needed.",
        incorrect: "Too generic or vague. Be specific about what you noticed."
      }
    },
    {
      id: 102,
      personality: 'Marathon Trainer',
      situation: "Bio says: 'Training for my first marathon.'",
      options: [
        "That's really cool that you're doing such a challenging athletic endeavor",
        "How's training going?",
        "First marathon? What's the hardest part so far—mileage or motivation?",
        "Running is healthy"
      ],
      correctIndex: 2,
      quality: 'optimal', // medium length, specific question
      feedback: {
        correct: "Nice! You asked a thoughtful either/or that's easy to answer.",
        incorrect: "Either too vague or too wordy. Find the middle ground with a specific question."
      }
    },
    {
      id: 103,
      personality: 'Adrenaline Seeker',
      situation: "Profile photo: cliff jumping.",
      options: [
        "Whoa!",
        "That cliff jump—what's the rush like and how did you build up to it?",
        "You seem brave",
        "Cliff jumping looks dangerous but exciting and thrilling"
      ],
      correctIndex: 1,
      quality: 'optimal',
      feedback: {
        correct: "Great! Specific, shows genuine curiosity, and invites storytelling.",
        incorrect: "Too short/vague or too wordy. Balance specificity with conciseness."
      }
    },
    {
      id: 104,
      personality: 'Solo Traveler',
      situation: "Mentions solo travel in Peru.",
      options: [
        "Peru looks amazing",
        "Solo travel takes courage! What surprised you most about Peru?",
        "That's interesting",
        "I've always wanted to travel alone too but never had the confidence"
      ],
      correctIndex: 1,
      quality: 'optimal',
      feedback: {
        correct: "Excellent! You acknowledged their courage and asked a specific question.",
        incorrect: "Be more specific and concise. Show you care, then ask."
      }
    },
    {
      id: 105,
      personality: 'Kayak Enthusiast',
      situation: "Weekend story: kayaking mishap.",
      options: [
        "Kayaking mishap? Did you capsize or just get really wet?",
        "Oh no",
        "That sounds rough",
        "I'm sorry that happened but I hope you're okay and it didn't ruin your day"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Playful, specific, and invites them to share the story.",
        incorrect: "Too flat or too concerned. Keep it light and curious."
      }
    },
    {
      id: 106,
      personality: 'Snowboarder',
      situation: "Lists snowboarding as personality.",
      options: [
        "Snowboarding is cool",
        "What's your go-to mountain?",
        "That's awesome that you snowboard regularly and enjoy winter sports",
        "Do you like it?"
      ],
      correctIndex: 1,
      quality: 'optimal', // short and specific wins
      feedback: {
        correct: "Nice! Short, direct, and opens conversation naturally.",
        incorrect: "Either too generic or unnecessarily long. Keep it tight."
      }
    },
    {
      id: 107,
      personality: 'Trail Runner',
      situation: "Photo: muddy trail shoes.",
      options: [
        "Muddy shoes = good run?",
        "Cool shoes",
        "Those trail shoes have seen some adventures! What's the gnarliest trail you've tackled?",
        "I like running"
      ],
      correctIndex: 0,
      quality: 'optimal', // super short but clever
      feedback: {
        correct: "Love it! Short, playful, and gets straight to the point.",
        incorrect: "Either too bland or overthinking it. Simple can win."
      }
    },
    {
      id: 108,
      personality: 'Adrenaline Philosopher',
      situation: "Bio: 'Chasing adrenaline responsibly.'",
      options: [
        "That's a good mindset to have about adventure and safety",
        "What does 'responsible adrenaline' look like for you?",
        "Nice philosophy",
        "You seem wise"
      ],
      correctIndex: 1,
      quality: 'optimal',
      feedback: {
        correct: "Spot on! You engaged with their philosophy and asked them to expand.",
        incorrect: "Too vague or generic. Quote their words back and ask about it."
      }
    },
    {
      id: 109,
      personality: 'Nature Healer',
      situation: "Mentions outdoor therapy.",
      options: [
        "Outdoor therapy—what's your favorite trail to think on?",
        "That's healthy",
        "I believe in the healing power of nature too",
        "Nature is great"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Specific, concise, and invites personal sharing.",
        incorrect: "Too generic. Ask about their actual practice, not the concept."
      }
    },
    {
      id: 110,
      personality: 'Route Planner',
      situation: "Posted a trail map screenshot.",
      options: [
        "Interesting map",
        "That trail map—scouting or reminiscing?",
        "You must really enjoy planning your hikes ahead of time",
        "Maps are useful"
      ],
      correctIndex: 1,
      quality: 'optimal', // short + playful either/or
      feedback: {
        correct: "Great! Short, playful, and gives them an easy reply path.",
        incorrect: "Be more playful and concise. Create intrigue."
      }
    }
  ]
};
