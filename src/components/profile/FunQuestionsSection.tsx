
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        <Label htmlFor={questionType} className="text-gray-200">{label}</Label>
        {isEditing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => toggleSuggestions(questionType)}
            className="text-xs h-7 px-2 border-pink-500/30 text-gray-200 hover:bg-pink-500/10 hover:text-white"
          >
            <Shuffle className="w-3 h-3 mr-1" />
            {t('profile.suggestions')}
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
        className="w-full bg-black/40 border-pink-500/30 text-white placeholder:text-gray-500 disabled:bg-black/30 disabled:border-pink-500/10 disabled:text-gray-400"
        placeholder={placeholder}
      />

      {isEditing && showSuggestions[questionType] && (
        <div className="mt-2 border border-pink-500/20 rounded-lg bg-black max-h-40 overflow-y-auto">
          <div className="p-2 text-xs font-medium text-gray-300 border-b border-pink-500/20 bg-neutral-900">
            {t('profile.selectSuggestion')}
          </div>
          {FUN_QUESTIONS[questionType].map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelectSuggestion(questionType, suggestion)}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-pink-500/10 border-b border-pink-500/10 last:border-b-0 focus:outline-none focus:bg-pink-500/15"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Card className="bg-black border-pink-500/30">
      <CardHeader>
        <CardTitle className="text-white">{t('profile.funQuestions')}</CardTitle>
        <p className="text-sm text-gray-400">
          {t('profile.funQuestionsDescription')}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {renderQuestionField(
            'fun_fact',
            t('profile.funFact'),
            t('profile.funFactPlaceholder')
          )}
          {renderQuestionField(
            'perfect_first_date',
            t('profile.perfectFirstDate'),
            t('profile.perfectFirstDatePlaceholder')
          )}
          {renderQuestionField(
            'last_googled',
            t('profile.lastGoogled'),
            t('profile.lastGoogledPlaceholder')
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FunQuestionsSection;
