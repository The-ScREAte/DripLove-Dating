
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FunQuestionsSectionProps {
  editedProfile: any;
  isEditing: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

const FunQuestionsSection = ({ editedProfile, isEditing, onInputChange }: FunQuestionsSectionProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fun Questions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="fun_fact">Fun Fact</Label>
            <Input
              type="text"
              id="fun_fact"
              name="fun_fact"
              value={editedProfile.fun_fact}
              onChange={onInputChange}
              disabled={!isEditing}
              className="w-full"
              placeholder="Share something interesting about yourself..."
            />
          </div>
          <div>
            <Label htmlFor="perfect_first_date">Perfect First Date</Label>
            <Input
              type="text"
              id="perfect_first_date"
              name="perfect_first_date"
              value={editedProfile.perfect_first_date}
              onChange={onInputChange}
              disabled={!isEditing}
              className="w-full"
              placeholder="Describe your ideal first date..."
            />
          </div>
          <div>
            <Label htmlFor="last_googled">Last Googled</Label>
            <Input
              type="text"
              id="last_googled"
              name="last_googled"
              value={editedProfile.last_googled}
              onChange={onInputChange}
              disabled={!isEditing}
              className="w-full"
              placeholder="What did you last search for?"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FunQuestionsSection;
