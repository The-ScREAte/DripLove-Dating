
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
import PersonalitySection from '@/components/forms/PersonalitySection';
import ConversationStartersSection from '@/components/forms/ConversationStartersSection';
import { validateRegistrationForm, transformFormDataForSubmission } from '@/utils/formValidation';
import { interests, initialFormData } from '@/constants/formData';
import { occupationOptions, industryOptions } from '@/constants/professionOptions';

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

    const submitData = transformFormDataForSubmission(formData);
    onSubmit(submitData);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto backdrop-blur-sm bg-white/90 shadow-2xl border-0">
      <CardHeader className="text-center pb-6">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full">
            <Heart className="w-8 h-8 text-white" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
          Create Your Profile
        </CardTitle>
        <CardDescription className="text-gray-600">
          Tell us about yourself to find your perfect match
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

          {/* Preferences Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Preferences & Identity</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">I am *</Label>
                <Select value={formData.gender} onValueChange={(value) => handleSelectChange('gender', value)}>
                  <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.gender ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="man">Man</SelectItem>
                    <SelectItem value="woman">Woman</SelectItem>
                    <SelectItem value="non-binary">Non-binary</SelectItem>
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
                    <SelectItem value="men">Men</SelectItem>
                    <SelectItem value="women">Women</SelectItem>
                    <SelectItem value="everyone">Everyone</SelectItem>
                  </SelectContent>
                </Select>
                {errors.preference && <p className="text-red-500 text-xs mt-1">{errors.preference}</p>}
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">❤️ Relationship Intent *</Label>
                <Select value={formData.relationshipIntent} onValueChange={(value) => handleSelectChange('relationshipIntent', value)}>
                  <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.relationshipIntent ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="What are you looking for?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="long-term">Long-term relationship</SelectItem>
                    <SelectItem value="friendship">Friendship</SelectItem>
                    <SelectItem value="casual">Casual dating</SelectItem>
                    <SelectItem value="marriage">Marriage</SelectItem>
                    <SelectItem value="exploring">Just exploring</SelectItem>
                  </SelectContent>
                </Select>
                {errors.relationshipIntent && <p className="text-red-500 text-xs mt-1">{errors.relationshipIntent}</p>}
              </div>
            </div>
          </div>

          {/* Lifestyle Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">🕐 Activity & Lifestyle</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Smoking</Label>
                <Select value={formData.smoking} onValueChange={(value) => handleSelectChange('smoking', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="occasionally">Occasionally</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Drinking</Label>
                <Select value={formData.drinking} onValueChange={(value) => handleSelectChange('drinking', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="socially">Socially</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Exercise Level</Label>
                <Select value={formData.exerciseLevel} onValueChange={(value) => handleSelectChange('exerciseLevel', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="sometimes">Sometimes</SelectItem>
                    <SelectItem value="rarely">Rarely</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Sleep Schedule</Label>
                <Select value={formData.sleepingSchedule} onValueChange={(value) => handleSelectChange('sleepingSchedule', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="early-riser">Early riser</SelectItem>
                    <SelectItem value="night-owl">Night owl</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Professional Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">💼 Profession & Education</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="occupation" className="text-sm font-medium">Occupation</Label>
                <Select value={formData.occupation} onValueChange={(value) => handleSelectChange('occupation', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <Briefcase className="w-4 h-4 mr-2 text-gray-400" />
                    <SelectValue placeholder="Select or type your occupation" />
                  </SelectTrigger>
                  <SelectContent>
                    {occupationOptions.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="occupationCustom"
                  name="occupationCustom"
                  type="text"
                  value={formData.occupationCustom || ''}
                  onChange={e => handleSelectChange('occupation', e.target.value)}
                  className="mt-2 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Or enter your occupation"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry" className="text-sm font-medium">Industry</Label>
                <Select value={formData.industry} onValueChange={(value) => handleSelectChange('industry', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <SelectValue placeholder="Select or type your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {industryOptions.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="industryCustom"
                  name="industryCustom"
                  type="text"
                  value={formData.industryCustom || ''}
                  onChange={e => handleSelectChange('industry', e.target.value)}
                  className="mt-2 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Or enter your industry"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Education Level</Label>
                <Select value={formData.educationLevel} onValueChange={(value) => handleSelectChange('educationLevel', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <GraduationCap className="w-4 h-4 mr-2 text-gray-400" />
                    <SelectValue placeholder="Select education" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high-school">High School</SelectItem>
                    <SelectItem value="some-college">Some College</SelectItem>
                    <SelectItem value="bachelors">Bachelor's Degree</SelectItem>
                    <SelectItem value="masters">Master's Degree</SelectItem>
                    <SelectItem value="phd">PhD</SelectItem>
                    <SelectItem value="trade-school">Trade School</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Location Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">📍 Precise Location</h3>
            <div className="space-y-2">
              <Label htmlFor="zipCode" className="text-sm font-medium">Zip/Postal Code</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="zipCode"
                  name="zipCode"
                  type="text"
                  value={formData.zipCode}
                  onChange={handleInputChange}
                  className="pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Enter your zip/postal code"
                />
              </div>
            </div>
          </div>

          <PersonalitySection
            formData={formData}
            onSliderChange={handleSliderChange}
          />

          {/* Bio and Interests */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">About You</h3>
            
            <div className="space-y-2">
              <Label htmlFor="bio" className="text-sm font-medium">Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                value={formData.bio}
                onChange={handleInputChange}
                placeholder="Tell us about yourself..."
                className="border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Interests (Select all that apply)</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-32 overflow-y-auto">
                {interests.map((interest) => (
                  <div key={interest} className="flex items-center space-x-2">
                    <Checkbox
                      id={interest}
                      checked={formData.interests.includes(interest)}
                      onCheckedChange={() => handleInterestToggle(interest)}
                    />
                    <Label htmlFor={interest} className="text-sm">{interest}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ConversationStartersSection
            formData={formData}
            onInputChange={handleInputChange}
          />
          
          <div className="flex flex-col space-y-4">
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
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default RegistrationForm;
