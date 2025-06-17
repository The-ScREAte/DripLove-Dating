
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Mail, Lock, Calendar, MapPin, Globe, Eye, EyeOff } from 'lucide-react';
import { countries } from '@/constants/formData';

interface BasicInfoSectionProps {
  formData: any;
  errors: Record<string, string>;
  showPassword: boolean;
  showConfirmPassword: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectChange: (field: string, value: string) => void;
  onTogglePassword: () => void;
  onToggleConfirmPassword: () => void;
}

const BasicInfoSection = ({
  formData,
  errors,
  showPassword,
  showConfirmPassword,
  onInputChange,
  onSelectChange,
  onTogglePassword,
  onToggleConfirmPassword
}: BasicInfoSectionProps) => {
  return (
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
              onChange={onInputChange}
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
              onChange={onInputChange}
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
            onChange={onInputChange}
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
              onChange={onInputChange}
              className={`pl-10 pr-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.password ? 'border-red-500' : ''}`}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={onTogglePassword}
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
              onChange={onInputChange}
              className={`pl-10 pr-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.confirmPassword ? 'border-red-500' : ''}`}
              placeholder="Confirm your password"
            />
            <button
              type="button"
              onClick={onToggleConfirmPassword}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth" className="text-sm font-medium">Date of Birth *</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={onInputChange}
              className={`pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.dateOfBirth ? 'border-red-500' : ''}`}
            />
            {errors.dateOfBirth && <p className="text-red-500 text-xs mt-1">{errors.dateOfBirth}</p>}
          </div>
        </div>
        
        <div className="space-y-2">
          <Label className="text-sm font-medium">Country *</Label>
          <Select value={formData.country} onValueChange={(value) => onSelectChange('country', value)}>
            <SelectTrigger className={`border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.country ? 'border-red-500' : ''}`}>
              <Globe className="w-4 h-4 mr-2 text-gray-400" />
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem key={country} value={country}>
                  {country}
                </SelectItem>
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
              onChange={onInputChange}
              className={`pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.city ? 'border-red-500' : ''}`}
              placeholder="Enter your city"
            />
            {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BasicInfoSection;
