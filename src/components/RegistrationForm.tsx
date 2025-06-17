
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Heart, User, Mail, Lock, Calendar, MapPin, Globe, Eye, EyeOff, Briefcase, GraduationCap } from 'lucide-react';

interface RegistrationFormProps {
  onSubmit: (data: any) => void;
  onBackToLogin: () => void;
}

const interests = [
  'Travel', 'Music', 'Movies', 'Sports', 'Reading', 'Cooking', 'Photography',
  'Dancing', 'Gaming', 'Art', 'Fitness', 'Nature', 'Technology', 'Fashion',
  'Food', 'Animals', 'Adventure', 'Comedy', 'Beach', 'Mountains'
];

const countries = [
  'United States', 'Canada', 'United Kingdom', 'Australia', 'Germany',
  'France', 'Spain', 'Italy', 'Netherlands', 'Sweden', 'Norway', 'Denmark',
  'Japan', 'South Korea', 'Singapore', 'Brazil', 'Mexico', 'Argentina'
];

const RegistrationForm = ({ onSubmit, onBackToLogin }: RegistrationFormProps) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
    country: '',
    city: '',
    zipCode: '',
    bio: '',
    preference: '',
    interests: [] as string[],
    gender: '',
    relationshipIntent: '',
    smoking: '',
    drinking: '',
    exerciseLevel: '',
    sleepingSchedule: '',
    occupation: '',
    industry: '',
    educationLevel: '',
    introvertExtrovert: [3],
    spontaneousPlanner: [3],
    messyOrganized: [3],
    funFact: '',
    perfectFirstDate: '',
    lastGoogled: ''
  });

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

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Required field validation
    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    if (!formData.password) newErrors.password = 'Password is required';
    if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
    if (!formData.country) newErrors.country = 'Country is required';
    if (!formData.city.trim()) newErrors.city = 'City is required';
    if (!formData.gender) newErrors.gender = 'Gender is required';
    if (!formData.preference) newErrors.preference = 'Preference is required';
    if (!formData.relationshipIntent) newErrors.relationshipIntent = 'Relationship intent is required';

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.email && !emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Password validation
    if (formData.password && formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters long';
    }

    // Password confirmation
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    // Age validation (must be 18+)
    if (formData.dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(formData.dateOfBirth);
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      
      if (age < 18) {
        newErrors.dateOfBirth = 'You must be at least 18 years old';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    // Transform data for submission
    const submitData = {
      ...formData,
      introvert_extrovert: formData.introvertExtrovert[0],
      spontaneous_planner: formData.spontaneousPlanner[0],
      messy_organized: formData.messyOrganized[0],
      relationship_intent: formData.relationshipIntent,
      exercise_level: formData.exerciseLevel,
      sleeping_schedule: formData.sleepingSchedule,
      education_level: formData.educationLevel,
      zip_code: formData.zipCode,
      fun_fact: formData.funFact,
      perfect_first_date: formData.perfectFirstDate,
      last_googled: formData.lastGoogled
    };

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
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Basic Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sm font-medium">First Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className={`pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.firstName ? 'border-red-500' : ''}`}
                    placeholder="Enter your first name"
                  />
                  {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium">Last Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className={`pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.lastName ? 'border-red-500' : ''}`}
                    placeholder="Enter your last name"
                  />
                  {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.email ? 'border-red-500' : ''}`}
                  placeholder="Enter your email"
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleInputChange}
                    className={`pl-10 pr-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.password ? 'border-red-500' : ''}`}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className={`pl-10 pr-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                    placeholder="Confirm your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth" className="text-sm font-medium">Date of Birth *</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={handleInputChange}
                    className={`pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.dateOfBirth ? 'border-red-500' : ''}`}
                  />
                  {errors.dateOfBirth && <p className="text-red-500 text-xs mt-1">{errors.dateOfBirth}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Gender *</Label>
                <Select onValueChange={(value) => handleSelectChange('gender', value)}>
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
            </div>
          </div>

          {/* Location */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">📍 Location</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Country *</Label>
                <Select onValueChange={(value) => handleSelectChange('country', value)}>
                  <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.country ? 'border-red-500' : ''}`}>
                    <Globe className="h-4 w-4 text-gray-400 mr-2" />
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((country) => (
                      <SelectItem key={country} value={country}>{country}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.country && <p className="text-red-500 text-xs mt-1">{errors.country}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="city" className="text-sm font-medium">City *</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="city"
                    name="city"
                    type="text"
                    value={formData.city}
                    onChange={handleInputChange}
                    className={`pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.city ? 'border-red-500' : ''}`}
                    placeholder="Enter your city"
                  />
                  {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zipCode" className="text-sm font-medium">Zip Code</Label>
                <Input
                  id="zipCode"
                  name="zipCode"
                  type="text"
                  value={formData.zipCode}
                  onChange={handleInputChange}
                  className="border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Enter zip code"
                />
              </div>
            </div>
          </div>

          {/* Relationship Intent */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">❤️ Relationship Intent</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">What Are You Looking For? *</Label>
                <Select onValueChange={(value) => handleSelectChange('relationshipIntent', value)}>
                  <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.relationshipIntent ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select relationship intent" />
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

              <div className="space-y-2">
                <Label className="text-sm font-medium">Interested In *</Label>
                <Select onValueChange={(value) => handleSelectChange('preference', value)}>
                  <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.preference ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="men">Men</SelectItem>
                    <SelectItem value="women">Women</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
                {errors.preference && <p className="text-red-500 text-xs mt-1">{errors.preference}</p>}
              </div>
            </div>
          </div>

          {/* Activity & Lifestyle */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">🕐 Activity & Lifestyle</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Smoking</Label>
                <Select onValueChange={(value) => handleSelectChange('smoking', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <SelectValue placeholder="Select smoking habit" />
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
                <Select onValueChange={(value) => handleSelectChange('drinking', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <SelectValue placeholder="Select drinking habit" />
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
                <Select onValueChange={(value) => handleSelectChange('exerciseLevel', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <SelectValue placeholder="Select exercise level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="sometimes">Sometimes</SelectItem>
                    <SelectItem value="rarely">Rarely</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Sleeping Schedule</Label>
                <Select onValueChange={(value) => handleSelectChange('sleepingSchedule', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <SelectValue placeholder="Select sleeping schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="early-riser">Early riser</SelectItem>
                    <SelectItem value="night-owl">Night owl</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Profession & Education */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">💼 Profession & Education</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="occupation" className="text-sm font-medium">Occupation</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="occupation"
                    name="occupation"
                    type="text"
                    value={formData.occupation}
                    onChange={handleInputChange}
                    className="pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                    placeholder="Your job title"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry" className="text-sm font-medium">Industry</Label>
                <Input
                  id="industry"
                  name="industry"
                  type="text"
                  value={formData.industry}
                  onChange={handleInputChange}
                  className="border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="e.g., Technology, Healthcare"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-medium">Education Level</Label>
                <Select onValueChange={(value) => handleSelectChange('educationLevel', value)}>
                  <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                    <GraduationCap className="h-4 w-4 text-gray-400 mr-2" />
                    <SelectValue placeholder="Select education level" />
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

          {/* Personality Questions */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">🧬 Personality Questions</h3>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Introvert ←→ Extrovert</Label>
                <div className="px-3">
                  <Slider
                    value={formData.introvertExtrovert}
                    onValueChange={(value) => handleSliderChange('introvertExtrovert', value)}
                    max={5}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Introvert</span>
                    <span>Extrovert</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Spontaneous ←→ Planner</Label>
                <div className="px-3">
                  <Slider
                    value={formData.spontaneousPlanner}
                    onValueChange={(value) => handleSliderChange('spontaneousPlanner', value)}
                    max={5}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Spontaneous</span>
                    <span>Planner</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Messy ←→ Organized</Label>
                <div className="px-3">
                  <Slider
                    value={formData.messyOrganized}
                    onValueChange={(value) => handleSliderChange('messyOrganized', value)}
                    max={5}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Messy</span>
                    <span>Organized</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Conversation Starters */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">💬 Conversation Starters</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="funFact" className="text-sm font-medium">A fun fact about me...</Label>
                <Textarea
                  id="funFact"
                  name="funFact"
                  value={formData.funFact}
                  onChange={handleInputChange}
                  className="border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Share something interesting about yourself"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="perfectFirstDate" className="text-sm font-medium">My perfect first date...</Label>
                <Textarea
                  id="perfectFirstDate"
                  name="perfectFirstDate"
                  value={formData.perfectFirstDate}
                  onChange={handleInputChange}
                  className="border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Describe your ideal first date"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastGoogled" className="text-sm font-medium">The last thing I Googled...</Label>
                <Textarea
                  id="lastGoogled"
                  name="lastGoogled"
                  value={formData.lastGoogled}
                  onChange={handleInputChange}
                  className="border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="What was your last Google search?"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio" className="text-sm font-medium">Bio (Optional)</Label>
            <Textarea
              id="bio"
              name="bio"
              value={formData.bio}
              onChange={handleInputChange}
              className="border-gray-200 focus:border-pink-400 focus:ring-pink-400"
              placeholder="Tell us about yourself..."
              rows={3}
            />
          </div>

          {/* Interests */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Interests (Select up to 5)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {interests.map((interest) => (
                <div key={interest} className="flex items-center space-x-2">
                  <Checkbox
                    id={interest}
                    checked={formData.interests.includes(interest)}
                    onCheckedChange={() => handleInterestToggle(interest)}
                    disabled={formData.interests.length >= 5 && !formData.interests.includes(interest)}
                  />
                  <Label htmlFor={interest} className="text-sm">{interest}</Label>
                </div>
              ))}
            </div>
          </div>
          
          <Button 
            type="submit" 
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02]"
          >
            Create Account
          </Button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?
            <button
              onClick={onBackToLogin}
              className="ml-2 text-pink-600 hover:text-pink-700 font-semibold transition-colors"
            >
              Sign In
            </button>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default RegistrationForm;
