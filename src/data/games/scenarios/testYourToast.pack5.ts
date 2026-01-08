import { ScenarioPack } from '../types';

// PACK 5: EMOTIONAL / VALUES
export const pack5: ScenarioPack = {
  packId: 5,
  scenarios: [
    {
      id: 501,
      personality: 'Emotionally Open',
      situation: "Bio: 'Emotionally available.'",
      options: [
        "Emotionally available—rare flex. What does that mean to you?",
        "That's refreshing",
        "I think emotional availability is really important in modern dating",
        "Good quality"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! You acknowledged it's rare, then asked for their definition.",
        incorrect: "Too generic. Make them define what it means to them."
      }
    },
    {
      id: 502,
      personality: 'Therapy Advocate',
      situation: "Mentions therapy casually.",
      options: [
        "Therapy mention = instant respect. What's the best thing it's taught you?",
        "That's healthy",
        "I think normalizing therapy is important for mental health",
        "Good for you"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! You respected it, then asked what they've learned.",
        incorrect: "Too generic. Ask for a specific takeaway or lesson."
      }
    },
    {
      id: 503,
      personality: 'Gratitude Journaler',
      situation: "Posts gratitude journal.",
      options: [
        "What's in today's gratitude list?",
        "That's positive",
        "Gratitude journaling is a wonderful practice for mental health",
        "I should try that"
      ],
      correctIndex: 0,
      quality: 'optimal', // super short
      feedback: {
        correct: "Love it! Direct, present-tense, and invites immediate sharing.",
        incorrect: "Too general or about yourself. Ask about their current practice."
      }
    },
    {
      id: 504,
      personality: 'Boundary Setter',
      situation: "Talks about boundaries.",
      options: [
        "Boundaries talk = green flag. What boundary changed your life?",
        "That's mature",
        "I believe healthy boundaries are essential for any relationship",
        "Good mindset"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Excellent! Affirmed it's positive, then asked for a specific example.",
        incorrect: "Too generic. Ask which boundary made the biggest difference."
      }
    },
    {
      id: 505,
      personality: 'Family-Oriented',
      situation: "Shares family traditions.",
      options: [
        "Family traditions—what's one you'll keep forever?",
        "That's sweet",
        "I think family traditions create strong bonds and lasting memories",
        "Family is important"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Specific question that invites emotional sharing.",
        incorrect: "Too generic. Ask about a specific tradition they love."
      }
    },
    {
      id: 506,
      personality: 'Community Giver',
      situation: "Volunteering photos.",
      options: [
        "Where do you volunteer?",
        "That's kind",
        "Volunteering shows you care about making a positive impact",
        "Good work"
      ],
      correctIndex: 0,
      quality: 'optimal', // super short and direct
      feedback: {
        correct: "Perfect! Simple, direct, and opens conversation naturally.",
        incorrect: "Too much praise, not enough question. Just ask where."
      }
    },
    {
      id: 507,
      personality: 'Growth Reflector',
      situation: "Reflects on growth.",
      options: [
        "Reflection posts hit different. What's the biggest shift for you lately?",
        "That's mature",
        "I appreciate when people take time for self-reflection and growth",
        "Growth is good"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Acknowledged the vibe, then asked for a specific shift.",
        incorrect: "Too generic. Ask for a concrete example of growth."
      }
    },
    {
      id: 508,
      personality: 'Healing Era',
      situation: "Mentions healing era.",
      options: [
        "Healing era—what does rest look like for you?",
        "That's brave",
        "I think prioritizing healing takes a lot of self-awareness",
        "Good for you"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Respectful acknowledgment + specific question about practice.",
        incorrect: "Too vague. Ask what they're actually doing to heal."
      }
    },
    {
      id: 509,
      personality: 'Communication Advocate',
      situation: "Talks about communication.",
      options: [
        "Communication is everything. What's your biggest pet peeve in convos?",
        "That's important",
        "I agree that good communication is the foundation of connection",
        "True"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Excellent! Agreed, then asked for their specific pet peeve.",
        incorrect: "Too agreeable. Ask about their preferences or frustrations."
      }
    },
    {
      id: 510,
      personality: 'Sunday Reflector',
      situation: "Posts Sunday reflections.",
      options: [
        "Sunday reflections—ritual or spontaneous?",
        "That's thoughtful",
        "I think taking time to reflect is a valuable practice",
        "Nice habit"
      ],
      correctIndex: 0,
      quality: 'optimal', // short either/or
      feedback: {
        correct: "Great! Either/or is easy to answer and reveals their style.",
        incorrect: "Too generic. Ask about their actual practice."
      }
    }
  ]
};
