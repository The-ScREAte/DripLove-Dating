
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Heart, User, Mail, Lock, Calendar, MapPin, Globe } from 'lucide-react';

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
    bio: '',
    preference: '',
    interests: [] as string[]
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSelectChange = (field: string, value: string) => {
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
    onSubmit(formData);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto backdrop-blur-sm bg-white/90 shadow-2xl border-0">
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
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-medium">First Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className="pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Enter your first name"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-medium">Last Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className="pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Enter your last name"
                  required
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                className="pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                placeholder="Enter your email"
                required
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Confirm your password"
                  required
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth" className="text-sm font-medium">Date of Birth</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={handleInputChange}
                className="pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                required
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Country</Label>
              <Select onValueChange={(value) => handleSelectChange('country', value)} required>
                <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                  <Globe className="h-4 w-4 text-gray-400 mr-2" />
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((country) => (
                    <SelectItem key={country} value={country}>{country}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="city" className="text-sm font-medium">City</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="city"
                  name="city"
                  type="text"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400"
                  placeholder="Enter your city"
                  required
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm font-medium">Looking for</Label>
            <Select onValueChange={(value) => handleSelectChange('preference', value)} required>
              <SelectTrigger className="border-gray-200 focus:border-pink-400 focus:ring-pink-400">
                <SelectValue placeholder="Select preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="men">Men</SelectItem>
                <SelectItem value="women">Women</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
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
