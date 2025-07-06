
import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const funFactSuggestions = [
  "I can play three instruments.",
  "I've been to 10 countries.",
  "I love spicy food!",
  "I once met a celebrity by accident.",
  "I can solve a Rubik's cube in under a minute."
];
const perfectDateSuggestions = [
  "Picnic in the park.",
  "Beach sunset walk.",
  "Cooking together at home.",
  "Live music night.",
  "Trying a new restaurant."
];
const lastGoogledSuggestions = [
  "How to say 'hello' in Swahili.",
  "Best street food in Lagos.",
  "Latest football scores.",
  "Easy pancake recipe.",
  "Upcoming music festivals."
];

interface ConversationStartersSectionProps {
  formData: any;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
}

const ConversationStartersSection = ({ formData, onInputChange }: ConversationStartersSectionProps) => {
  const [funFactSelect, setFunFactSelect] = useState('');
  const [dateSelect, setDateSelect] = useState('');
  const [googledSelect, setGoogledSelect] = useState('');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">💬 Conversation Starters</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="funFact" className="text-sm font-medium">A fun fact about me...</Label>
          <Select value={funFactSelect} onValueChange={val => { setFunFactSelect(val); onInputChange({ target: { name: 'funFact', value: val } } as any); }}>
            <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
              <SelectValue placeholder="Pick a suggestion or write your own" />
            </SelectTrigger>
            <SelectContent>
              {funFactSuggestions.map((s, i) => <SelectItem key={i} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
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
          <Select value={dateSelect} onValueChange={val => { setDateSelect(val); onInputChange({ target: { name: 'perfectFirstDate', value: val } } as any); }}>
            <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
              <SelectValue placeholder="Pick a suggestion or write your own" />
            </SelectTrigger>
            <SelectContent>
              {perfectDateSuggestions.map((s, i) => <SelectItem key={i} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
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
          <Select value={googledSelect} onValueChange={val => { setGoogledSelect(val); onInputChange({ target: { name: 'lastGoogled', value: val } } as any); }}>
            <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
              <SelectValue placeholder="Pick a suggestion or write your own" />
            </SelectTrigger>
            <SelectContent>
              {lastGoogledSuggestions.map((s, i) => <SelectItem key={i} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
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
