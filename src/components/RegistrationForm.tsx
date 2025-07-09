
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Heart, MapPin, Briefcase, GraduationCap } from 'lucide-react';
import BasicInfoSection from '@/components/forms/BasicInfoSection';
import { validateRegistrationForm, transformFormDataForSubmission } from '@/utils/formValidation';
import { initialFormData } from '@/constants/formData';

interface RegistrationFormProps {
  onSubmit: (data: any) => void;
  onBackToLogin: () => void;
}

const RegistrationForm = ({ onSubmit, onBackToLogin }: RegistrationFormProps) => {
  const [formData, setFormData] = useState(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error when user starts typing
    if (errors[e.target.name]) {
      setErrors(prev => ({ ...prev, [e.target.name]: '' }));
    }
  };

  const handleSelectChange = (field: string, value: string) => {
    setFormData({
      ...formData,
      [field]: value
    });
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSliderChange = (field: string, value: number[]) => {
    setFormData({
      ...formData,
      [field]: value
    });
  };

  const handleInterestToggle = (interest: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateRegistrationForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    // Pass the raw formData so password fields are included
    onSubmit(formData);
  };

  return (
    <Card className="w-full max-w-md mx-auto backdrop-blur-sm bg-white/90 shadow-2xl border-0">
      <CardHeader className="text-center pb-6">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full">
            <Heart className="w-8 h-8 text-white" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
          Create Your Account
        </CardTitle>
        <CardDescription className="text-gray-600">
          Just a few details to get started. You can complete your profile later for better matches!
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-8">
          <BasicInfoSection
            formData={formData}
            errors={errors}
            showPassword={showPassword}
            showConfirmPassword={showConfirmPassword}
            onInputChange={handleInputChange}
            onSelectChange={handleSelectChange}
            onTogglePassword={() => setShowPassword(!showPassword)}
            onToggleConfirmPassword={() => setShowConfirmPassword(!showConfirmPassword)}
          />
          {/* Location */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">City</Label>
              <Input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                placeholder="Enter your city"
                className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.city ? 'border-red-500' : ''}`}
              />
              {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Zip Code</Label>
              <Input
                type="text"
                name="zipCode"
                value={formData.zipCode}
                onChange={handleInputChange}
                placeholder="Enter zip code"
                className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.zipCode ? 'border-red-500' : ''}`}
              />
              {errors.zipCode && <p className="text-red-500 text-xs mt-1">{errors.zipCode}</p>}
            </div>
          </div>

          {/* Gender and Preference */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">I am *</Label>
              <Select value={formData.gender} onValueChange={(value) => handleSelectChange('gender', value)}>
                <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.gender ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Looking for *</Label>
              <Select value={formData.preference} onValueChange={(value) => handleSelectChange('preference', value)}>
                <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.preference ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Select preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="everyone">Everyone</SelectItem>
                </SelectContent>
              </Select>
              {errors.preference && <p className="text-red-500 text-xs mt-1">{errors.preference}</p>}
            </div>
          </div>

          {/* Relationship Intent */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Relationship Intent</Label>
            <Select value={formData.relationshipIntent} onValueChange={(value) => handleSelectChange('relationshipIntent', value)}>
              <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.relationshipIntent ? 'border-red-500' : ''}`}>
                <SelectValue placeholder="What are you looking for?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="serious">Serious</SelectItem>
                <SelectItem value="open_to_anything">Open to Anything</SelectItem>
              </SelectContent>
            </Select>
            {errors.relationshipIntent && <p className="text-red-500 text-xs mt-1">{errors.relationshipIntent}</p>}
          </div>

          {/* Work & Education */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-800">Work & Education</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Occupation</Label>
                <Input
                  type="text"
                  name="occupation"
                  value={formData.occupation}
                  onChange={handleInputChange}
                  placeholder="Your job title"
                  className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.occupation ? 'border-red-500' : ''}`}
                />
                {errors.occupation && <p className="text-red-500 text-xs mt-1">{errors.occupation}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Industry</Label>
                <Input
                  type="text"
                  name="industry"
                  value={formData.industry}
                  onChange={handleInputChange}
                  placeholder="Your industry"
                  className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.industry ? 'border-red-500' : ''}`}
                />
                {errors.industry && <p className="text-red-500 text-xs mt-1">{errors.industry}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Education Level</Label>
              <Select value={formData.educationLevel} onValueChange={(value) => handleSelectChange('educationLevel', value)}>
                <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.educationLevel ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Select your education level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High School">High School</SelectItem>
                  <SelectItem value="Some College">Some College</SelectItem>
                  <SelectItem value="Associate Degree">Associate Degree</SelectItem>
                  <SelectItem value="Bachelor's Degree">Bachelor's Degree</SelectItem>
                  <SelectItem value="Master's Degree">Master's Degree</SelectItem>
                  <SelectItem value="Doctorate">Doctorate</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.educationLevel && <p className="text-red-500 text-xs mt-1">{errors.educationLevel}</p>}
            </div>
          </div>
          <Button 
            type="submit" 
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02]"
          >
            Create Account
          </Button>
          <div className="text-center">
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-pink-600 hover:text-pink-700 font-semibold transition-colors"
            >
              Already have an account? Sign In
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default RegistrationForm;
