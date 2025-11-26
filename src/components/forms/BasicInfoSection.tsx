
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Mail, Lock, Calendar, MapPin, Globe, Eye, EyeOff } from 'lucide-react';
import { countries } from '@/constants/formData';
import { handleInputFocus, handleInputBlur, getInputStyles } from '@/utils/inputUtils';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  
  return (
    <div className="space-y-4">
      {/* <p className="text-xs text-center text-gray-400 font-normal">{t('registration.step1Description')}</p> */}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName" className="text-sm font-medium">{t('registration.firstName')} *</Label>
          <div className="relative">
            <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              id="firstName"
              name="firstName"
              type="text"
              value={formData.firstName}
              onChange={onInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className={`mobile-input-field pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.firstName ? 'border-red-500' : ''}`}
              style={getInputStyles()}
              placeholder={t('registration.firstName')}
            />
            {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="lastName" className="text-sm font-medium">{t('registration.lastName')} *</Label>
          <div className="relative">
            <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              id="lastName"
              name="lastName"
              type="text"
              value={formData.lastName}
              onChange={onInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className={`mobile-input-field pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.lastName ? 'border-red-500' : ''}`}
              style={getInputStyles()}
              placeholder={t('registration.lastName')}
            />
            {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
          </div>
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium">{t('auth.email')} *</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={onInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            className={`mobile-input-field pl-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.email ? 'border-red-500' : ''}`}
            style={getInputStyles()}
            placeholder={t('auth.email')}
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">{t('auth.password')} *</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={onInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className={`mobile-input-field pl-10 pr-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.password ? 'border-red-500' : ''}`}
              style={getInputStyles()}
              placeholder={t('auth.password')}
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
          <Label htmlFor="confirmPassword" className="text-sm font-medium">{t('auth.confirmPassword')} *</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={formData.confirmPassword}
              onChange={onInputChange}
              className={`pl-10 pr-10 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.confirmPassword ? 'border-red-500' : ''}`}
              placeholder={t('auth.confirmPassword')}
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
      
      <div className="space-y-2">
        <Label htmlFor="dateOfBirth" className="text-sm font-medium">{t('registration.dateOfBirth')} *</Label>
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
    </div>
  );
};

export default BasicInfoSection;
