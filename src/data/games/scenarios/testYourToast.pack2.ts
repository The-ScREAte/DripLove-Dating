import { ScenarioPack } from '../types';

// PACK 2: CREATIVE / ARTS
// Mix of short optimal and longer poor answers
export const pack2: ScenarioPack = {
  packId: 2,
  scenarios: [
    {
      id: 201,
      personality: 'Night Sketcher',
      situation: "Late-night sketch uploads.",
      options: [
        "What time do ideas hit?",
        "Cool art",
        "I really admire people who can draw and create visual art",
        "Those late-night sketches have a vibe—when do ideas usually hit you?"
      ],
      correctIndex: 0,
      quality: 'optimal', // super short, direct
      feedback: {
        correct: "Perfect! Short, curious, and conversational.",
        incorrect: "Either too generic or overexplaining. Keep it simple."
      }
    },
    {
      id: 202,
      personality: 'Honest Designer',
      situation: "Bio: 'Designing things nobody asked for.'",
      options: [
        "That's funny",
        "I love that bio! What's your most unnecessary design?",
        "You seem creative and have a good sense of humor about your work",
        "Design is cool"
      ],
      correctIndex: 1,
      quality: 'optimal',
      feedback: {
        correct: "Great! You engaged with their humor and asked a fun question.",
        incorrect: "Too flat or wordy. Match their energy with a playful question."
      }
    },
    {
      id: 203,
      personality: 'Messy Creator',
      situation: "Photo: messy art desk.",
      options: [
        "Messy desk = creative mind?",
        "Your desk looks busy",
        "I think a messy workspace often means someone is deeply focused",
        "Clean your desk"
      ],
      correctIndex: 0,
      quality: 'optimal', // short + playful
      feedback: {
        correct: "Nice! Short, playful, and opens dialogue without judgment.",
        incorrect: "Too literal or preachy. Keep it light and curious."
      }
    },
    {
      id: 204,
      personality: 'Self-Doubter',
      situation: "Mentions imposter syndrome.",
      options: [
        "That's relatable and I think many creative people feel that way",
        "Imposter syndrome hits creatives hard. What helps you push through?",
        "Everyone feels that",
        "You're not alone"
      ],
      correctIndex: 1,
      quality: 'optimal',
      feedback: {
        correct: "Excellent! Empathetic + actionable question that invites sharing.",
        incorrect: "Too vague or generic. Acknowledge it, then ask how they cope."
      }
    },
    {
      id: 205,
      personality: 'Raw Poet',
      situation: "Posts unfinished poems.",
      options: [
        "Unfinished poems feel more honest sometimes. What's the one you can't finish?",
        "Poetry is nice",
        "That's brave",
        "I've always appreciated the art form of poetry and creative writing"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Beautiful! You honored their vulnerability and asked a deep question.",
        incorrect: "Too surface-level. Engage with the rawness directly."
      }
    },
    {
      id: 206,
      personality: 'Type Nerd',
      situation: "Shares typography screenshots.",
      options: [
        "What's your favorite font?",
        "Fonts are interesting",
        "I can tell you have a really good eye for design details",
        "Typography screenshots? Serif or sans gang?"
      ],
      correctIndex: 3,
      quality: 'optimal', // playful + specific
      feedback: {
        correct: "Love it! Playful, nerdy, and shows you get their obsession.",
        incorrect: "Too generic. Show you understand the niche."
      }
    },
    {
      id: 207,
      personality: 'Process Over Product',
      situation: "Bio: 'Creativity over perfection.'",
      options: [
        "That's a healthy mindset for creative work and life in general",
        "What's a messy project you loved making?",
        "I agree",
        "Nice philosophy"
      ],
      correctIndex: 1,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! You asked them to share a story, not just agree.",
        incorrect: "Agreeing isn't connecting. Ask for a specific example."
      }
    },
    {
      id: 208,
      personality: 'Film Shooter',
      situation: "Photo: film camera.",
      options: [
        "Film over digital—why?",
        "Cool camera",
        "I think film photography has a certain quality that digital can't match",
        "That's old school"
      ],
      correctIndex: 0,
      quality: 'optimal', // short + invites philosophy
      feedback: {
        correct: "Great! Short, direct, and invites them to share their why.",
        incorrect: "Too generic or assumptive. Just ask why they choose film."
      }
    },
    {
      id: 209,
      personality: 'Burned Out Artist',
      situation: "Mentions creative burnout.",
      options: [
        "Burnout is tough",
        "Creative burnout is real. How do you recharge?",
        "That happens to everyone at some point in their creative journey",
        "Take a break"
      ],
      correctIndex: 1,
      quality: 'optimal',
      feedback: {
        correct: "Solid! Empathetic acknowledgment + actionable question.",
        incorrect: "Too generic or preachy. Ask how they recover, don't advise."
      }
    },
    {
      id: 210,
      personality: 'Sunday Gallery-Goer',
      situation: "Sunday gallery hopping.",
      options: [
        "Gallery hopping on Sundays—solo ritual or social thing?",
        "That's cultured",
        "I wish I had the discipline to do something enriching every Sunday",
        "Galleries are nice"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Either/or makes it easy to answer and reveals personality.",
        incorrect: "Too flat. Give them an easy choice to respond to."
      }
    }
  ]
};
