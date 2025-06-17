
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';

interface InterestsEditorProps {
  interests: string[];
  onInterestsChange: (interests: string[]) => void;
  disabled?: boolean;
}

const InterestsEditor = ({ interests, onInterestsChange, disabled }: InterestsEditorProps) => {
  const [newInterest, setNewInterest] = useState('');

  const addInterest = () => {
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      onInterestsChange([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const removeInterest = (interest: string) => {
    onInterestsChange(interests.filter(i => i !== interest));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {interests.map((interest, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-sm"
          >
            {interest}
            {!disabled && (
              <button
                onClick={() => removeInterest(interest)}
                className="ml-1 hover:text-pink-900"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      
      {!disabled && (
        <div className="flex gap-2">
          <Input
            placeholder="Add new interest"
            value={newInterest}
            onChange={(e) => setNewInterest(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addInterest()}
            className="flex-1"
          />
          <Button
            onClick={addInterest}
            variant="outline"
            size="sm"
            disabled={!newInterest.trim()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default InterestsEditor;
