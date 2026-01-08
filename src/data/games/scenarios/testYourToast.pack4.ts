import { ScenarioPack } from '../types';

// PACK 4: PROFESSIONAL / THINKERS
export const pack4: ScenarioPack = {
  packId: 4,
  scenarios: [
    {
      id: 401,
      personality: 'Curious Mind',
      situation: "Bio: 'Curious > confident.'",
      options: [
        "What's the last rabbit hole you fell into?",
        "That's wise",
        "I think prioritizing curiosity over confidence is a refreshing perspective",
        "Nice mindset"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! You engaged with their philosophy and asked a fun question.",
        incorrect: "Too generic. Ask for a specific example of their curiosity."
      }
    },
    {
      id: 402,
      personality: 'Strategy Gamer',
      situation: "Mentions strategy games.",
      options: [
        "Current strategy game obsession?",
        "Games are fun",
        "I find that people who enjoy strategy games often think deeply about things",
        "Which games?"
      ],
      correctIndex: 0,
      quality: 'optimal', // short and specific
      feedback: {
        correct: "Great! Direct, assumes they're obsessed (compliment), easy to answer.",
        incorrect: "Too vague or analytical. Just ask what they're playing."
      }
    },
    {
      id: 403,
      personality: 'Book Learner',
      situation: "Reads productivity books.",
      options: [
        "Productivity books—which one actually changed something for you?",
        "That's ambitious",
        "I think reading about productivity is good but implementation is harder",
        "Books are good"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Excellent! Specific question that separates readers from doers.",
        incorrect: "Too generic or preachy. Ask what stuck."
      }
    },
    {
      id: 404,
      personality: 'Visual Thinker',
      situation: "Shares whiteboard photos.",
      options: [
        "Whiteboard thinker! What's the current problem you're mapping?",
        "That's neat",
        "I appreciate when people think visually like this",
        "Interesting"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Shows you get their process and asks about current focus.",
        incorrect: "Too bland. Engage with the method and ask what they're solving."
      }
    },
    {
      id: 405,
      personality: 'Career Pivoter',
      situation: "Mentions career pivot.",
      options: [
        "Career pivot—brave. What pushed you?",
        "That's bold",
        "I think career changes take a lot of courage and self-awareness",
        "Change is good"
      ],
      correctIndex: 0,
      quality: 'optimal', // short + compliment + question
      feedback: {
        correct: "Perfect! Acknowledged courage, then asked the why.",
        incorrect: "Too generic. Compliment briefly, then ask what motivated it."
      }
    },
    {
      id: 406,
      personality: 'Balance Seeker',
      situation: "Talks about work-life balance.",
      options: [
        "Work-life balance—what does yours actually look like?",
        "That's healthy",
        "I think everyone struggles with work-life balance in different ways",
        "Balance is important"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Solid! Avoids clichés, asks for their specific reality.",
        incorrect: "Too generic. Ask about their actual practice, not the concept."
      }
    },
    {
      id: 407,
      personality: 'Remote Worker',
      situation: "Remote work setup photo.",
      options: [
        "Setup looks clean! Coffee nearby or tea person?",
        "Nice desk",
        "Your remote setup seems very organized and thoughtfully arranged",
        "Cool office"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Compliment + easy either/or that reveals personality.",
        incorrect: "Too generic or wordy. Compliment fast, then ask something small."
      }
    },
    {
      id: 408,
      personality: 'Question Asker',
      situation: "Bio: 'Asking better questions.'",
      options: [
        "What's a question you're sitting with right now?",
        "That's thoughtful",
        "I believe asking the right questions is often more valuable than having answers",
        "Good philosophy"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Love it! Meta, specific, and invites vulnerability.",
        incorrect: "Too generic. Actually ask them a good question."
      }
    },
    {
      id: 409,
      personality: 'Systems Thinker',
      situation: "Posted a flowchart.",
      options: [
        "Flowchart energy! What's the system you're building or breaking?",
        "That's organized",
        "I appreciate people who think in systems and frameworks",
        "Diagrams are useful"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Excellent! Shows you get their mindset, asks what they're working on.",
        incorrect: "Too generic. Ask what problem they're mapping."
      }
    },
    {
      id: 410,
      personality: 'Mentor',
      situation: "Mentions mentoring juniors.",
      options: [
        "Mentoring juniors—what's something you wish someone told you earlier?",
        "That's kind",
        "I think mentorship is one of the most valuable ways to give back",
        "Good work"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Specific, reflective, and invites wisdom-sharing.",
        incorrect: "Too generic. Ask for a specific lesson or insight."
      }
    }
  ]
};
