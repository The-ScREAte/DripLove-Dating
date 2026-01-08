import { ScenarioPack } from '../types';

// PACK 6: MIXED LIFESTYLES (Music, Minimalism, Athletes, Film, Pets)
export const pack6: ScenarioPack = {
  packId: 6,
  scenarios: [
    {
      id: 601,
      personality: 'Vinyl Collector',
      situation: "Lists indie concerts and vinyl hunting as weekend plans.",
      options: [
        "Indie shows + vinyl? What's your rarest find or favorite live set?",
        "Music is cool",
        "I think vinyl collecting is a unique way to appreciate music",
        "Concerts are fun"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Specific + either/or gives them options to share.",
        incorrect: "Too generic. Ask about their collection or a memorable show."
      }
    },
    {
      id: 602,
      personality: 'Minimalist',
      situation: "Profile mentions 'less but better', slow mornings, and matcha.",
      options: [
        "Less but better? What's one thing you recently ditched and don't miss?",
        "I like matcha too",
        "Minimalism seems like a peaceful way to live",
        "Slow mornings are nice"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Excellent! You engaged with their philosophy and asked for specifics.",
        incorrect: "Too generic or about yourself. Ask about their practice."
      }
    },
    {
      id: 603,
      personality: 'Half-Marathoner',
      situation: "They run half-marathons and post meal prep Sundays.",
      options: [
        "Half-marathons AND meal prep? What's your pre-race breakfast?",
        "You run a lot",
        "That's disciplined",
        "I wish I had that kind of fitness commitment"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Connected two interests with a specific ritual question.",
        incorrect: "Too vague or self-focused. Ask about their routine."
      }
    },
    {
      id: 604,
      personality: 'Criterion Collector',
      situation: "They have Criterion picks and quotes in their bio.",
      options: [
        "Your Criterion picks are elite. Comfort rewatch?",
        "Movies are great",
        "Nice quotes",
        "I appreciate people who are into classic and art house cinema"
      ],
      correctIndex: 0,
      quality: 'optimal', // shorter version
      feedback: {
        correct: "Perfect! Compliment + specific question keeps it flowing.",
        incorrect: "Too generic or wordy. Compliment their taste, then ask a tight question."
      }
    },
    {
      id: 605,
      personality: 'Corgi Parent',
      situation: "Photos feature a corgi in raincoats and trail pics.",
      options: [
        "Your corgi in the raincoat made my day. Trail or city walk this weekend?",
        "Cute dog",
        "I like dogs too",
        "That raincoat is adorable and shows you care about your pet"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Excellent! Specific detail + easy either/or about plans.",
        incorrect: "Too generic. Reference a specific photo and ask about plans."
      }
    },
    {
      id: 606,
      personality: 'Coffee Connoisseur',
      situation: "Into fermentation, homemade kimchi, and coffee tastings.",
      options: [
        "Fermentation + coffee? Current experiment?",
        "Kimchi is good",
        "Coffee lover here",
        "That combination of interests shows you appreciate complex flavors"
      ],
      correctIndex: 0,
      quality: 'optimal', // super short
      feedback: {
        correct: "Great! Short, connects both interests, asks what's current.",
        incorrect: "Too generic or wordy. Just ask what they're working on now."
      }
    },
    {
      id: 607,
      personality: 'Urban Explorer',
      situation: "They post hidden parks, murals, and coffee alleys.",
      options: [
        "Hidden parks + murals? Favorite micro-adventure under 1 hour?",
        "Cities are fun",
        "I like murals",
        "Your ability to find hidden gems in the city is really impressive"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Specific to their vibe + constraint makes it easy to answer.",
        incorrect: "Too vague. Ask for their favorite short adventure."
      }
    },
    {
      id: 608,
      personality: 'Board Game Tactician',
      situation: "They mention cozy co-op + tactical board games.",
      options: [
        "Cozy co-op + tactics? Perfect game night lineup?",
        "Games are cool",
        "I like board games",
        "That's a nice balance between cooperative and competitive gameplay"
      ],
      correctIndex: 0,
      quality: 'optimal', // short
      feedback: {
        correct: "Great! Combined their interests and asked for their ideal stack.",
        incorrect: "Too generic. Ask them to build their perfect game night."
      }
    },
    {
      id: 609,
      personality: 'Recovery Nerd',
      situation: "They journal, cold plunge, and talk sleep scores.",
      options: [
        "Cold plunge + sleep scores? What's your current recovery flex?",
        "Healthy living is good",
        "I like sleep too",
        "That shows you take your wellness and recovery seriously"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Excellent! Playful, specific, and invites them to brag a bit.",
        incorrect: "Too generic or serious. Make it playful and ask what they're proud of."
      }
    },
    {
      id: 610,
      personality: 'Jazz Cafe',
      situation: "Posts about jazz cafes and late-night espresso.",
      options: [
        "Jazz cafes + late espresso? Best spot and best hour?",
        "Jazz is nice",
        "Coffee at night is bold",
        "That's a sophisticated combination of interests"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Specific either/or about their favorite combo.",
        incorrect: "Too generic. Ask for their favorite spot and time."
      }
    }
  ]
};
