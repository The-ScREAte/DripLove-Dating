
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';

interface InterestsEditorProps {
  interests: string[];
  onInterestsChange: (interests: string[]) => void;
  disabled?: boolean;
}

const PREDEFINED_INTERESTS = [
  // Travel & Adventure
  'Travel', 'Adventure', 'Road Trips', 'Backpacking', 'Beach Life', 'Mountains', 'Camping', 'Exploring',
  // Arts & Creative
  'Photography', 'Art', 'Music', 'Dancing', 'Singing', 'Writing', 'Poetry', 'Theatre', 'Film Making', 'Painting', 'Crafts',
  // Sports & Fitness
  'Sports', 'Fitness', 'Yoga', 'Gym', 'Running', 'Swimming', 'Cycling', 'Hiking', 'Basketball', 'Football', 'Tennis', 'Golf', 'Martial Arts', 'CrossFit',
  // Food & Drink
  'Cooking', 'Baking', 'Foodie', 'Wine', 'Coffee', 'Brunch', 'Fine Dining', 'Street Food', 'BBQ', 'Cocktails',
  // Entertainment
  'Movies', 'Concerts', 'Live Music', 'Comedy', 'Netflix', 'Anime', 'K-Drama', 'Podcasts', 'Board Games', 'Video Games', 'Gaming',
  // Lifestyle
  'Fashion', 'Shopping', 'Skincare', 'Self-Care', 'Meditation', 'Spirituality', 'Astrology', 'Tarot',
  // Intellectual
  'Reading', 'Books', 'Learning', 'Philosophy', 'History', 'Science', 'Politics', 'Investing', 'Crypto',
  // Social
  'Parties', 'Nightlife', 'Clubbing', 'Networking', 'Volunteering', 'Community Service',
  // Animals & Nature
  'Animals', 'Dogs', 'Cats', 'Nature', 'Gardening', 'Plants', 'Bird Watching', 'Sustainability',
  // Tech & Innovation
  'Technology', 'Startups', 'AI', 'Coding', 'Design',
  // Culture
  'Languages', 'Culture', 'Museums', 'Architecture', 'Vintage', 'Thrifting',
  // Wellness
  'Wellness', 'Mental Health', 'Mindfulness', 'Journaling', 'Early Mornings', 'Late Nights'
];

// Matches the basics chip row exactly - inline height/padding, not Tailwind's
// h-* /px-*, since those have proven unreliable elsewhere in this app.
const chipStyle = { height: 22, minHeight: 22, padding: '0 8px' } as const;

const InterestsEditor = ({ interests, onInterestsChange, disabled = false }: InterestsEditorProps) => {
  const [newInterest, setNewInterest] = useState('');
  const [showAddCustom, setShowAddCustom] = useState(false);

  const addInterest = (interest: string) => {
    if (!interests.includes(interest) && interests.length < 10) {
      onInterestsChange([...interests, interest]);
    }
  };

  const removeInterest = (interest: string) => {
    onInterestsChange(interests.filter(i => i !== interest));
  };

  const addCustomInterest = () => {
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      addInterest(newInterest.trim());
      setNewInterest('');
      setShowAddCustom(false);
    }
  };

  const availableInterests = PREDEFINED_INTERESTS.filter(interest => !interests.includes(interest));

  if (disabled) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {interests.map((interest) => (
          <span
            key={interest}
            style={chipStyle}
            className="flex items-center rounded-full bg-neutral-900 border border-pink-500/40 text-pink-200 text-[11px] leading-none whitespace-nowrap shrink-0"
          >
            {interest}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selected Interests */}
      <div>
        <h4 className="text-sm font-medium mb-2 text-white">Selected Interests ({interests.length}/10):</h4>
        <div className="flex flex-wrap gap-1.5">
          {interests.map((interest) => (
            <button
              key={interest}
              type="button"
              onClick={() => removeInterest(interest)}
              style={{ ...chipStyle, paddingRight: 6 }}
              className="flex items-center gap-1 rounded-full bg-pink-600 border border-pink-500 text-white text-[11px] leading-none whitespace-nowrap shrink-0"
            >
              {interest}
              <X className="w-2.5 h-2.5" />
            </button>
          ))}
        </div>
      </div>

      {/* Available Interests */}
      {interests.length < 10 && (
        <div>
          <h4 className="text-sm font-medium mb-2 text-white">Choose from popular interests:</h4>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {availableInterests.slice(0, 15).map((interest) => (
              <button
                key={interest}
                type="button"
                onClick={() => addInterest(interest)}
                style={chipStyle}
                className="flex items-center rounded-full bg-neutral-900 border border-pink-500/40 text-white text-[11px] leading-none whitespace-nowrap shrink-0 transition-colors hover:bg-neutral-800 hover:text-white"
              >
                {interest}
              </button>
            ))}
          </div>

          {/* Add Custom Interest */}
          <div className="space-y-2">
            {!showAddCustom ? (
              <button
                type="button"
                onClick={() => setShowAddCustom(true)}
                style={chipStyle}
                className="flex items-center gap-1 rounded-full bg-neutral-900 border border-pink-500/40 text-white text-[11px] leading-none whitespace-nowrap shrink-0 transition-colors hover:bg-neutral-800 hover:text-white"
              >
                <Plus className="w-3 h-3" />
                Add Custom Interest
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Enter custom interest..."
                  value={newInterest}
                  onChange={(e) => setNewInterest(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addCustomInterest()}
                  className="flex-1 h-8 bg-neutral-900 border-pink-500/30 text-white text-xs placeholder:text-white/40"
                />
                <button
                  type="button"
                  onClick={addCustomInterest}
                  style={chipStyle}
                  className="flex items-center rounded-full bg-pink-600 border border-pink-500 text-white text-[11px] leading-none whitespace-nowrap shrink-0"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCustom(false);
                    setNewInterest('');
                  }}
                  style={chipStyle}
                  className="flex items-center rounded-full bg-neutral-900 border border-pink-500/40 text-white text-[11px] leading-none whitespace-nowrap shrink-0 transition-colors hover:bg-neutral-800 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InterestsEditor;
