import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { User, Mail, Lock, Calendar, MapPin, Globe, Eye, EyeOff, Shield, CheckCircle, Camera, Loader2 } from 'lucide-react';
import { countries } from '@/constants/formData';
import { handleInputFocus, handleInputBlur, getInputStyles } from '@/utils/inputUtils';
import { useTranslation } from 'react-i18next';
import FaceVerification from '@/components/FaceVerification';

interface BasicInfoSectionProps {
  formData: any;
  errors: Record<string, string>;
  showPassword: boolean;
  showConfirmPassword: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectChange: (field: string, value: string) => void;
  onTogglePassword: () => void;
  onToggleConfirmPassword: () => void;
  // Face verification props
  showFaceVerification?: boolean;
  setShowFaceVerification?: (show: boolean) => void;
  faceVerified?: boolean;
  isVerifying?: boolean;
  onFaceVerified?: (faceImageBase64: string) => void;
  faceError?: string;
}

const BasicInfoSection = ({
  formData,
  errors,
  showPassword,
  showConfirmPassword,
  onInputChange,
  onSelectChange,
  onTogglePassword,
  onToggleConfirmPassword,
  showFaceVerification = false,
  setShowFaceVerification,
  faceVerified = false,
  isVerifying = false,
  onFaceVerified,
  faceError
}: BasicInfoSectionProps) => {
  const { t } = useTranslation();
  
  return (
    <div className="space-y-4">
      {/* <p className="text-xs text-center text-gray-400 font-normal">{t('registration.step1Description')}</p> */}
      
      <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName" className="text-sm font-medium">{t('registration.firstName')} *</Label>
          <div className="relative">
            <User className="absolute left-2.5 top-3 h-4 w-4 text-gray-400 z-10" />
            <Input
              id="firstName"
              name="firstName"
              type="text"
              value={formData.firstName}
              onChange={onInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className={`mobile-input-field pl-8 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.firstName ? 'border-red-500' : ''}`}
              style={getInputStyles()}
              placeholder={t('registration.firstName')}
            />
            {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="lastName" className="text-sm font-medium">{t('registration.lastName')} *</Label>
          <div className="relative">
            <User className="absolute left-2.5 top-3 h-4 w-4 text-gray-400 z-10" />
            <Input
              id="lastName"
              name="lastName"
              type="text"
              value={formData.lastName}
              onChange={onInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className={`mobile-input-field pl-8 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.lastName ? 'border-red-500' : ''}`}
              style={getInputStyles()}
              placeholder={t('registration.lastName')}
            />
            {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
          </div>
        </div>
      </div>

      {/* Face Verification Section - Right after name fields */}
      {setShowFaceVerification && onFaceVerified && (
        <div className="space-y-3 mt-2">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600" />
            <Label className="text-sm font-medium">Face Verification *</Label>
          </div>

          {showFaceVerification ? (
            <div className="space-y-3 bg-gray-50 rounded-lg p-4">
              <FaceVerification 
                onVerified={onFaceVerified}
                disabled={isVerifying}
              />
            </div>
          ) : faceVerified ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="font-medium text-green-800 text-sm">Verified</p>
              </div>
            </div>
          ) : (
            <div className={`bg-purple-50 border rounded-lg px-3 py-2.5 ${faceError ? 'border-red-300' : 'border-purple-200'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm text-purple-800 leading-tight">Verify your face to continue</p>
                <Button
                  type="button"
                  onClick={() => setShowFaceVerification(true)}
                  className="h-5 px-1.5 shrink-0 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-[9px]"
                  size="sm"
                  disabled={isVerifying}
                  style={{ minHeight: 0 }}
                >
                  {isVerifying ? (
                    <Loader2 className="w-1.5 h-1.5 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-1.5 h-1.5 mr-1" />
                      Verify now
                    </>
                  )}
                </Button>
              </div>
              {faceError && <p className="text-red-500 text-xs mt-2">{faceError}</p>}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2 min-[390px]:order-2">
        <Label htmlFor="email" className="text-sm font-medium">{t('auth.email')} *</Label>
        <div className="relative">
          <Mail className="absolute left-2.5 top-3 h-4 w-4 text-gray-400 z-10" />
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={onInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            className={`mobile-input-field pl-8 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.email ? 'border-red-500' : ''}`}
            style={getInputStyles()}
            placeholder={t('auth.email')}
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
        </div>
      </div>
        <div className="space-y-2 min-[390px]:order-1">
          <Label htmlFor="dateOfBirth" className="text-sm font-medium">{t('registration.dateOfBirth')} *</Label>
          <div className="relative">
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={onInputChange}
              className={`compact-date-input text-sm pl-2.5 pr-7 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.dateOfBirth ? 'border-red-500' : ''}`}
            />
            {errors.dateOfBirth && <p className="text-red-500 text-xs mt-1">{errors.dateOfBirth}</p>}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">{t('auth.password')} *</Label>
          <div className="relative">
            <Lock className="absolute left-2.5 top-3 h-4 w-4 text-gray-400 z-10" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={onInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className={`mobile-input-field pl-8 pr-8 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.password ? 'border-red-500' : ''}`}
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
            <Lock className="absolute left-2.5 top-3 h-4 w-4 text-gray-400 z-10" />
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={formData.confirmPassword}
              onChange={onInputChange}
              className={`pl-8 pr-8 border-gray-200 focus:border-pink-400 focus:ring-pink-400 ${errors.confirmPassword ? 'border-red-500' : ''}`}
              placeholder={t('auth.password')}
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
      
    </div>
  );
};

export default BasicInfoSection;
