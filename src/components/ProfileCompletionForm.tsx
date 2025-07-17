import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { initialFormData } from '@/constants/formData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { occupationOptions, industryOptions } from '@/constants/professionOptions';
import LocationInput from '@/components/forms/LocationInput';

interface ProfileCompletionFormProps {
  user: any;
  onComplete: () => void;
  onCancel: () => void;
}

const ProfileCompletionForm = ({ user, onComplete, onCancel }: ProfileCompletionFormProps) => {
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Pre-fill form with user data from OAuth if available
    if (user) {
      setFormData(prev => ({
        ...prev,
        email: user.email || '',
        firstName: user.user_metadata?.first_name || user.user_metadata?.name?.split(' ')[0] || '',
        lastName: user.user_metadata?.last_name || user.user_metadata?.name?.split(' ').slice(1).join(' ') || '',
      }));
    }
  }, [user]);

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

  const handleLocationChange = (location: {
    country: string;
    countryCode: string;
    city: string;
    zipCode: string;
    latitude?: number;
    longitude?: number;
    isCustomCity?: boolean;
  }) => {
    setFormData(prev => ({
      ...prev,
      country: location.country,
      countryCode: location.countryCode,
      city: location.city,
      zipCode: location.zipCode,
      latitude: location.latitude,
      longitude: location.longitude,
      isCustomCity: location.isCustomCity || false
    }));

    // Clear location-related errors
    if (errors.country || errors.city || errors.zipCode) {
      setErrors(prev => ({
        ...prev,
        country: '',
        city: '',
        zipCode: ''
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate required fields (excluding password fields since it's OAuth)
    const validationErrors: Record<string, string> = {};
    
    if (!formData.firstName.trim()) validationErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) validationErrors.lastName = 'Last name is required';
    if (!formData.dateOfBirth) validationErrors.dateOfBirth = 'Date of birth is required';
    if (!formData.country) validationErrors.country = 'Country is required';
    if (!formData.city) validationErrors.city = 'City is required';
    if (!formData.gender) validationErrors.gender = 'Gender is required';
    if (!formData.preference) validationErrors.preference = 'Preference is required';
    if (!formData.relationshipIntent) validationErrors.relationshipIntent = 'Relationship intent is required';
    if (!formData.occupation) validationErrors.occupation = 'Occupation is required';
    if (!formData.industry) validationErrors.industry = 'Industry is required';
    if (!formData.educationLevel) validationErrors.educationLevel = 'Education level is required';

    // Age validation (must be 18+)
    if (formData.dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(formData.dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      
      if (age < 18) {
        validationErrors.dateOfBirth = 'You must be at least 18 years old';
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setLoading(false);
      return;
    }

    try {
      // Create profile for OAuth user
      const profileData = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        date_of_birth: formData.dateOfBirth,
        country: formData.country,
        city: formData.city,
        zip_code: formData.zipCode,
        gender: formData.gender,
        preference: formData.preference,
        relationship_intent: formData.relationshipIntent,
        occupation: formData.occupation,
        industry: formData.industry,
        education_level: formData.educationLevel,
        bio: formData.bio || '',
        interests: formData.interests || [],
        smoking: formData.smoking || '',
        drinking: formData.drinking || '',
        exercise_level: formData.exerciseLevel || '',
        sleeping_schedule: formData.sleepingSchedule || '',
        introvert_extrovert: formData.introvertExtrovert?.[0] || 50,
        spontaneous_planner: formData.spontaneousPlanner?.[0] || 50,
        messy_organized: formData.messyOrganized?.[0] || 50,
        fun_fact: formData.funFact || '',
        perfect_first_date: formData.perfectFirstDate || '',
        last_googled: formData.lastGoogled || '',
        latitude: formData.latitude,
        longitude: formData.longitude,
        is_custom_city: formData.isCustomCity || false,
        max_distance: formData.maxDistance || 50,
        country_code: formData.countryCode || ''
      };

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          ...profileData
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Profile Completed!",
        description: "Your profile has been successfully completed. Welcome to the app!",
      });

      onComplete();
    } catch (error: any) {
      console.error('Profile completion error:', error);
      toast({
        title: "Profile Completion Error",
        description: error.message || "Failed to complete profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto backdrop-blur-sm bg-white/90 shadow-2xl border-0">
      <CardHeader className="text-center pb-6">
        <div className="flex items-center justify-between mb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="flex items-center text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex justify-center">
            <div className="p-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full">
              <Heart className="w-8 h-8 text-white" />
            </div>
          </div>
          <div className="w-16"></div> {/* Spacer for alignment */}
        </div>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
          Complete Your Profile
        </CardTitle>
        <CardDescription className="text-gray-600">
          We need a few more details to complete your profile
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Basic Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">First Name *</label>
                <input
                  name="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Enter your first name"
                  required
                />
                {errors.firstName && <p className="text-sm text-red-500">{errors.firstName}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Last Name *</label>
                <input
                  name="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Enter your last name"
                  required
                />
                {errors.lastName && <p className="text-sm text-red-500">{errors.lastName}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Date of Birth *</label>
              <input
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-pink-400 focus:ring-pink-400"
                required
              />
              {errors.dateOfBirth && <p className="text-sm text-red-500">{errors.dateOfBirth}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Gender *</label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => handleSelectChange('gender', value)}
                >
                  <SelectTrigger className="border-gray-200 focus:border-pink-400">
                    <SelectValue placeholder="Select your gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {errors.gender && <p className="text-sm text-red-500">{errors.gender}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Looking for *</label>
                <Select
                  value={formData.preference}
                  onValueChange={(value) => handleSelectChange('preference', value)}
                >
                  <SelectTrigger className="border-gray-200 focus:border-pink-400">
                    <SelectValue placeholder="Select your preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="everyone">Both</SelectItem>
                  </SelectContent>
                </Select>
                {errors.preference && <p className="text-sm text-red-500">{errors.preference}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Relationship Intent *</label>
              <Select
                value={formData.relationshipIntent}
                onValueChange={(value) => handleSelectChange('relationshipIntent', value)}
              >
                <SelectTrigger className="border-gray-200 focus:border-pink-400">
                  <SelectValue placeholder="What are you looking for?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="serious">Serious</SelectItem>
                  <SelectItem value="open_to_anything">Open to Anything</SelectItem>
                </SelectContent>
              </Select>
              {errors.relationshipIntent && <p className="text-sm text-red-500">{errors.relationshipIntent}</p>}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Location *</h3>
            <LocationInput
              country={formData.country}
              city={formData.city}
              zipCode={formData.zipCode}
              onLocationChange={handleLocationChange}
              errors={errors}
              required={true}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Occupation *</label>
              <Select
                value={formData.occupation}
                onValueChange={(value) => handleSelectChange('occupation', value)}
              >
                <SelectTrigger className="border-gray-200 focus:border-pink-400">
                  <SelectValue placeholder="Select your occupation" />
                </SelectTrigger>
                <SelectContent>
                  {occupationOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.occupation && <p className="text-sm text-red-500">{errors.occupation}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Industry *</label>
              <Select
                value={formData.industry}
                onValueChange={(value) => handleSelectChange('industry', value)}
              >
                <SelectTrigger className="border-gray-200 focus:border-pink-400">
                  <SelectValue placeholder="Select your industry" />
                </SelectTrigger>
                <SelectContent>
                  {industryOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.industry && <p className="text-sm text-red-500">{errors.industry}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Education Level *</label>
            <Select
              value={formData.educationLevel}
              onValueChange={(value) => handleSelectChange('educationLevel', value)}
            >
              <SelectTrigger className="border-gray-200 focus:border-pink-400">
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
            {errors.educationLevel && <p className="text-sm text-red-500">{errors.educationLevel}</p>}
          </div>

          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02]"
            >
              {loading ? 'Completing Profile...' : 'Complete Profile'}
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 rounded-lg transition-all duration-200"
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default ProfileCompletionForm;
