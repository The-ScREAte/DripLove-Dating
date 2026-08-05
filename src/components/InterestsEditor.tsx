
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
      <div className="flex flex-wrap gap-2">
        {interests.map((interest) => (
          <Badge key={interest} variant="secondary" className="bg-neutral-800 text-gray-100 border-pink-500/20">
            {interest}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selected Interests */}
      <div>
        <h4 className="text-sm font-medium mb-2 text-gray-200">Selected Interests ({interests.length}/10):</h4>
        <div className="flex flex-wrap gap-2">
          {interests.map((interest) => (
            <Badge key={interest} variant="default" className="flex items-center gap-1 bg-pink-600/80 text-white border-transparent">
              {interest}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-transparent text-white"
                onClick={() => removeInterest(interest)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Available Interests */}
      {interests.length < 10 && (
        <div>
          <h4 className="text-sm font-medium mb-2 text-gray-200">Choose from popular interests:</h4>
          <div className="flex flex-wrap gap-2 mb-4">
            {availableInterests.slice(0, 15).map((interest) => (
              <Button
                key={interest}
                variant="outline"
                size="sm"
                onClick={() => addInterest(interest)}
                className="text-xs bg-transparent border-pink-500/40 text-gray-100 hover:bg-neutral-800 hover:text-white"
              >
                {interest}
              </Button>
            ))}
          </div>

          {/* Add Custom Interest */}
          <div className="space-y-2">
            {!showAddCustom ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddCustom(true)}
                className="flex items-center gap-1 bg-transparent border-pink-500/40 text-gray-100 hover:bg-neutral-800 hover:text-white"
              >
                <Plus className="h-4 w-4" />
                Add Custom Interest
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter custom interest..."
                  value={newInterest}
                  onChange={(e) => setNewInterest(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addCustomInterest()}
                  className="flex-1 bg-neutral-900 border-pink-500/30 text-white placeholder:text-gray-500"
                />
                <Button onClick={addCustomInterest} size="sm">
                  Add
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent border-pink-500/40 text-gray-100 hover:bg-neutral-800 hover:text-white"
                  onClick={() => {
                    setShowAddCustom(false);
                    setNewInterest('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InterestsEditor;
