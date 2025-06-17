
import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ConversationStartersSectionProps {
  formData: any;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

const ConversationStartersSection = ({ formData, onInputChange }: ConversationStartersSectionProps) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">💬 Conversation Starters</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="funFact" className="text-sm font-medium">A fun fact about me...</Label>
          <Textarea
            id="funFact"
            name="funFact"
            value={formData.funFact}
            onChange={onInputChange}
            placeholder="Share something interesting about yourself"
            className="border-gray-200 focus:border-pink-400 focus:ring-pink-400"
            rows={3}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="perfectFirstDate" className="text-sm font-medium">My perfect first date...</Label>
          <Textarea
            id="perfectFirstDate"
            name="perfectFirstDate"
            value={formData.perfectFirstDate}
            onChange={onInputChange}
            placeholder="Describe your ideal first date"
            className="border-gray-200 focus:border-pink-400 focus:ring-pink-400"
            rows={3}
          />
        </div>
        
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="lastGoogled" className="text-sm font-medium">The last thing I Googled...</Label>
          <Textarea
            id="lastGoogled"
            name="lastGoogled"
            value={formData.lastGoogled}
            onChange={onInputChange}
            placeholder="What did you search for recently?"
            className="border-gray-200 focus:border-pink-400 focus:ring-pink-400"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
};

export default ConversationStartersSection;
