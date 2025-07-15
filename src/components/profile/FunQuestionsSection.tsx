
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FUN_QUESTIONS, QuestionType } from '@/constants/funQuestions';
import { Shuffle } from 'lucide-react';

interface FunQuestionsSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

const FunQuestionsSection = ({ editedProfile, isEditing, onInputChange }: FunQuestionsSectionProps) => {
  const [showSuggestions, setShowSuggestions] = useState<{ [key: string]: boolean }>({});

  const handleSelectSuggestion = (questionType: QuestionType, suggestion: string) => {
    // Create a synthetic event to match the onInputChange signature
    const syntheticEvent = {
      target: {
        name: questionType,
        value: suggestion
      }
    } as React.ChangeEvent<HTMLInputElement>;
    
    onInputChange(syntheticEvent);
    setShowSuggestions(prev => ({ ...prev, [questionType]: false }));
  };

  const toggleSuggestions = (questionType: QuestionType) => {
    setShowSuggestions(prev => ({ 
      ...prev, 
      [questionType]: !prev[questionType] 
    }));
  };

  const renderQuestionField = (
    questionType: QuestionType, 
    label: string, 
    placeholder: string
  ) => (
    <div key={questionType}>
      <div className="flex items-center justify-between mb-2">
        <Label htmlFor={questionType}>{label}</Label>
        {isEditing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => toggleSuggestions(questionType)}
            className="text-xs h-7 px-2"
          >
            <Shuffle className="w-3 h-3 mr-1" />
            Suggestions
          </Button>
        )}
      </div>
      
      <Input
        type="text"
        id={questionType}
        name={questionType}
        value={editedProfile[questionType] || ''}
        onChange={onInputChange}
        disabled={!isEditing}
        className="w-full"
        placeholder={placeholder}
      />
      
      {isEditing && showSuggestions[questionType] && (
        <div className="mt-2 border rounded-lg bg-gray-50 max-h-40 overflow-y-auto">
          <div className="p-2 text-xs font-medium text-gray-700 border-b bg-gray-100">
            Select a suggestion or type your own:
          </div>
          {FUN_QUESTIONS[questionType].map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelectSuggestion(questionType, suggestion)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 border-b border-gray-200 last:border-b-0 focus:outline-none focus:bg-blue-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fun Questions</CardTitle>
        <p className="text-sm text-gray-600">
          Share something interesting about yourself. You can use our suggestions or write your own!
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {renderQuestionField(
            'fun_fact',
            'Fun Fact',
            'Share something interesting about yourself...'
          )}
          {renderQuestionField(
            'perfect_first_date',
            'Perfect First Date',
            'Describe your ideal first date...'
          )}
          {renderQuestionField(
            'last_googled',
            'Last Googled',
            'What did you last search for?'
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FunQuestionsSection;
