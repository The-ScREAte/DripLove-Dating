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
      quality: 'optimal',
      feedback: {
        correct: "Great! Short, playful, and gives them an easy reply path.",
        incorrect: "Be more playful and concise. Create intrigue."
      }
    },
    {
      id: 111,
      personality: 'Rock Climber',
      situation: "Photo: chalk bag and climbing holds.",
      options: [
        "Indoor or outdoor—where do you prefer to climb?",
        "Cool climbing gear",
        "Rock climbing is such an amazing sport that requires strength",
        "Nice pic"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Direct either/or question about their preference.",
        incorrect: "Too generic or wordy. Keep it specific and conversational."
      }
    },
    {
      id: 112,
      personality: 'Camping Regular',
      situation: "Bio mentions: 'Live for weekend campouts.'",
      options: [
        "What's your dream camping spot?",
        "Camping is fun",
        "I really admire people who enjoy spending time outdoors camping",
        "Cool hobby"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Simple question that lets them share their passion.",
        incorrect: "Too boring or too long. Be concise and specific."
      }
    },
    {
      id: 113,
      personality: 'Mountain Biker',
      situation: "Shares muddy bike photo.",
      options: [
        "That bike's seen action! Favorite trail?",
        "Nice bike",
        "Mountain biking looks like such an exhilarating and adventurous activity",
        "Cool"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Love it! Acknowledges their activity and asks for specifics.",
        incorrect: "Too bland or overdone. Show interest with a question."
      }
    },
    {
      id: 114,
      personality: 'Scuba Diver',
      situation: "Profile says: 'PADI certified.'",
      options: [
        "What's the coolest thing you've seen diving?",
        "That's impressive",
        "Being PADI certified must have taken a lot of dedication and training",
        "Diving sounds fun"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Gets to the exciting part—their experiences.",
        incorrect: "Too generic. Ask about their actual dive stories."
      }
    },
    {
      id: 115,
      personality: 'Yoga Lover',
      situation: "Photo: sunrise yoga pose on a cliff.",
      options: [
        "Sunrise yoga on a cliff? How do you even find those spots?",
        "Pretty view",
        "That's really beautiful and you look so peaceful and centered",
        "Nice pose"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Shows you noticed the unique setting and asks how they do it.",
        incorrect: "Too focused on appearance or too generic. Ask about the activity."
      }
    },
    {
      id: 116,
      personality: 'Beach Volleyball Player',
      situation: "Bio: 'Pickup volleyball every Sunday.'",
      options: [
        "Sunday volleyball—same crew or random pickups?",
        "Volleyball is athletic",
        "That sounds like a really fun way to spend your Sunday mornings",
        "Cool"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Nice! Specific question about their routine shows genuine interest.",
        incorrect: "Too vague. Dig into the specifics of what they shared."
      }
    },
    {
      id: 117,
      personality: 'Paddleboarder',
      situation: "Photo: paddleboarding at sunset.",
      options: [
        "Sunset paddleboarding looks peaceful! Regular spot or exploring?",
        "Pretty sunset",
        "I've always wanted to try paddleboarding it looks so relaxing",
        "Nice"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Acknowledges the activity and asks about their habits.",
        incorrect: "Too focused on you or too generic. Keep focus on them."
      }
    },
    {
      id: 118,
      personality: 'Surfer',
      situation: "Mentions catching waves at dawn.",
      options: [
        "Dawn surfer! What beach?",
        "Surfing is cool",
        "Waking up early to surf shows real dedication to your passion",
        "Wow"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Love it! Super short, shows excitement, and asks for location.",
        incorrect: "Too wordy or too bland. Keep it punchy."
      }
    },
    {
      id: 119,
      personality: 'Trail Photographer',
      situation: "Portfolio of landscape photos.",
      options: [
        "These landscapes are stunning! Where's your favorite shooting spot?",
        "Nice photos",
        "You have a real talent for capturing the beauty of nature in your images",
        "Pretty"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Compliment plus specific question about their craft.",
        incorrect: "Too generic. Show you looked at their work closely."
      }
    },
    {
      id: 120,
      personality: 'Parkour Enthusiast',
      situation: "Bio says: 'Urban exploring + parkour.'",
      options: [
        "Parkour in the city! Ever get kicked out of spots?",
        "That's interesting",
        "Parkour requires such incredible athleticism and spatial awareness",
        "Cool skill"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Playful question about their adventures.",
        incorrect: "Too serious or too vague. Be playful and curious."
      }
    },
    {
      id: 121,
      personality: 'Skateboard Rider',
      situation: "Photo: skateboard with stickers.",
      options: [
        "Those stickers tell a story. Street or park?",
        "Cool skateboard",
        "I like the aesthetic of your skateboard and all the unique stickers",
        "Nice board"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Personal detail plus specific question about style.",
        incorrect: "Too surface level. Ask about how they skate."
      }
    },
    {
      id: 122,
      personality: 'Bouldering Fan',
      situation: "Mentions V7 climbs.",
      options: [
        "V7! What problem took you the longest to crack?",
        "That's hard",
        "Climbing at that difficulty level is really impressive and challenging",
        "Wow"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Shows you know the sport and asks for a story.",
        incorrect: "Too generic. Engage with their actual achievement level."
      }
    },
    {
      id: 123,
      personality: 'Cyclist Commuter',
      situation: "Bio: 'Bike commuter, rain or shine.'",
      options: [
        "Rain or shine—what's your worst weather ride story?",
        "That's dedicated",
        "Biking in all weather conditions shows real commitment to sustainability",
        "Cool"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Love it! Playful callback to their bio and invites storytelling.",
        incorrect: "Too preachy or boring. Ask for their experience."
      }
    },
    {
      id: 124,
      personality: 'Adventure Photographer',
      situation: "Photo: camera with mountain backdrop.",
      options: [
        "What's the gnarliest spot you've shot?",
        "Nice camera",
        "Combining photography with adventure travel must create amazing memories",
        "Pretty view"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Gets right to their best stories with casual language.",
        incorrect: "Too generic or too formal. Be conversational."
      }
    },
    {
      id: 125,
      personality: 'Running Coach',
      situation: "Bio says: 'Helping others reach their goals.'",
      options: [
        "Running coach! What's your coaching philosophy?",
        "That's nice",
        "It's wonderful that you dedicate your time to helping others succeed",
        "Cool job"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Professional but personal question about their approach.",
        incorrect: "Too vague or too praising. Ask about their actual work."
      }
    },
    {
      id: 126,
      personality: 'White Water Rafter',
      situation: "Shares Class V rapids photo.",
      options: [
        "Class V! Where and how terrified were you?",
        "Wow dangerous",
        "White water rafting at that level requires serious skill and bravery",
        "Scary"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Love it! Shows you know rapids + playful question about fear.",
        incorrect: "Too timid or too wordy. Be playful and specific."
      }
    },
    {
      id: 127,
      personality: 'Trailblazer',
      situation: "Bio: 'First to explore new trails.'",
      options: [
        "First on new trails? How do you find them?",
        "Brave",
        "Exploring uncharted trails shows a real adventurous independent spirit",
        "Interesting"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Specific question about their process.",
        incorrect: "Too generic. Ask how they actually do it."
      }
    },
    {
      id: 128,
      personality: 'Kite Surfer',
      situation: "Photo: kite surfing in action.",
      options: [
        "Kite surfing! Where'd you learn?",
        "That looks fun",
        "Kite surfing combines so many skills wind water and board control",
        "Cool sport"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Short, enthusiastic, and asks about their journey.",
        incorrect: "Too descriptive or bland. Keep it simple and curious."
      }
    },
    {
      id: 129,
      personality: 'Wilderness Guide',
      situation: "Bio mentions: 'Licensed wilderness guide.'",
      options: [
        "Wilderness guide! What's your favorite area to lead?",
        "That's cool",
        "Being a licensed guide means you must have extensive outdoors knowledge",
        "Interesting job"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Professional opener with specific question.",
        incorrect: "Too obvious or vague. Ask about their actual work."
      }
    },
    {
      id: 130,
      personality: 'Freediver',
      situation: "Profile mentions breath-hold diving.",
      options: [
        "Freediving! What's your longest breath hold?",
        "That's impressive",
        "Freediving requires incredible mental and physical discipline and control",
        "Wow"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Direct question about their skill that invites sharing.",
        incorrect: "Too generic. Ask about their actual achievements."
      }
    },
    {
      id: 131,
      personality: 'Ultra Runner',
      situation: "Mentions running 50-mile races.",
      options: [
        "50-milers! What keeps you going at mile 40?",
        "That's crazy",
        "Ultra running requires such incredible endurance and mental toughness",
        "Wow impressive"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Love it! Shows you understand the challenge and asks for insight.",
        incorrect: "Too vague or too wordy. Get specific about the experience."
      }
    },
    {
      id: 132,
      personality: 'Canyoneer',
      situation: "Photo: rappelling down a slot canyon.",
      options: [
        "Slot canyon! Where is this?",
        "Cool photo",
        "Canyoneering looks like such an exciting way to explore geology",
        "Nice"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Shows excitement and asks for location to continue chat.",
        incorrect: "Too generic or educational. Just ask where!"
      }
    },
    {
      id: 133,
      personality: 'Slackliner',
      situation: "Bio: 'Balancing life on a slackline.'",
      options: [
        "Slacklining! Hardest trick you've landed?",
        "That's unique",
        "Slacklining is such a great metaphor for finding balance in life",
        "Cool hobby"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Perfect! Skips the metaphor and asks about their skills.",
        incorrect: "Too philosophical or vague. Focus on the actual activity."
      }
    },
    {
      id: 134,
      personality: 'Backcountry Skier',
      situation: "Mentions earning turns.",
      options: [
        "Earning turns! Favorite backcountry zone?",
        "That's hard work",
        "Backcountry skiing requires so much more effort than resort skiing",
        "Cool"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Love it! Uses their language and asks for their favorite spot.",
        incorrect: "Too obvious or boring. Engage with their passion directly."
      }
    },
    {
      id: 135,
      personality: 'Wind Surfer',
      situation: "Photo: windsurfing gear at beach.",
      options: [
        "Wind conditions—where's your go-to spot?",
        "Nice gear",
        "Windsurfing is such a technical sport that depends on reading wind",
        "Cool setup"
      ],
      correctIndex: 0,
      quality: 'optimal',
      feedback: {
        correct: "Great! Specific question about their preferred location.",
        incorrect: "Too generic or technical. Just ask where they go."
      }
    }
  ]
};

