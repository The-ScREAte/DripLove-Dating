
import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

interface PersonalitySectionProps {
  formData: any;
  onSliderChange: (field: string, value: number[]) => void;
}

const PersonalitySection = ({ formData, onSliderChange }: PersonalitySectionProps) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">🧬 Personality Questions</h3>
      
      <div className="space-y-6">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Introvert ← → Extrovert</Label>
          <Slider
            value={formData.introvertExtrovert}
            onValueChange={(value) => onSliderChange('introvertExtrovert', value)}
            max={100}
            min={0}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Introvert</span>
            <span>Extrovert</span>
          </div>
        </div>
        
        <div className="space-y-2">
          <Label className="text-sm font-medium">Spontaneous ← → Planner</Label>
          <Slider
            value={formData.spontaneousPlanner}
            onValueChange={(value) => onSliderChange('spontaneousPlanner', value)}
            max={100}
            min={0}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Spontaneous</span>
            <span>Planner</span>
          </div>
        </div>
        
        <div className="space-y-2">
          <Label className="text-sm font-medium">Messy ← → Organized</Label>
          <Slider
            value={formData.messyOrganized}
            onValueChange={(value) => onSliderChange('messyOrganized', value)}
            max={100}
            min={0}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Messy</span>
            <span>Organized</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonalitySection;
