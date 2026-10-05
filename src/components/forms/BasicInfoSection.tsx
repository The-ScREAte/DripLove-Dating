import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { User, Mail, Lock, Eye, EyeOff, Shield, CheckCircle, Camera, Loader2 } from 'lucide-react';
import { handleInputFocus, handleInputBlur, getInputStyles } from '@/utils/inputUtils';
import { useTranslation } from 'react-i18next';
import FaceVerification from '@/components/FaceVerification';
import { formLabel, formRequired, formError, formInput, formFieldIcon } from '@/components/forms/formTheme';
import { getLatestAllowedDateOfBirth } from '@/utils/formValidation';

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
      <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="firstName" className={formLabel}>{t('registration.firstName')} <span className={formRequired}>*</span></Label>
          <div className="relative">
            <User className={formFieldIcon} />
            <Input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              autoCapitalize="words"
              value={formData.firstName}
              onChange={onInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className={`mobile-input-field ${formInput(!!errors.firstName)} pl-10`}
              style={getInputStyles()}
              placeholder="First"
            />
          </div>
          {errors.firstName && <p className={formError}>{errors.firstName}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lastName" className={formLabel}>{t('registration.lastName')} <span className={formRequired}>*</span></Label>
          <div className="relative">
            <User className={formFieldIcon} />
            <Input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              autoCapitalize="words"
              value={formData.lastName}
              onChange={onInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className={`mobile-input-field ${formInput(!!errors.lastName)} pl-10`}
              style={getInputStyles()}
              placeholder="Last"
            />
          </div>
          {errors.lastName && <p className={formError}>{errors.lastName}</p>}
        </div>
      </div>

      {/* Face Verification Section - Right after name fields */}
      {setShowFaceVerification && onFaceVerified && (
        <div className="space-y-1.5">
          <Label className={`${formLabel} flex items-center gap-1.5`}>
            <Shield className="w-4 h-4 text-pink-400" />
            Face Verification <span className={formRequired}>*</span>
          </Label>

          {showFaceVerification ? (
            <div className="space-y-3 rounded-xl border border-white/10 p-3">
              <FaceVerification
                onVerified={onFaceVerified}
                disabled={isVerifying}
              />
            </div>
          ) : faceVerified ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-sm font-medium text-emerald-300">Face verified</p>
            </div>
          ) : (
            <div className={`flex items-center justify-between gap-3 rounded-xl border bg-white/[0.06] px-3.5 py-2.5 ${faceError ? 'border-red-400/80' : 'border-white/15'}`}>
              <p className="text-sm text-white/75 leading-snug">Verify your face to continue</p>
              <Button
                type="button"
                onClick={() => setShowFaceVerification(true)}
                className="h-9 shrink-0 rounded-full bg-gradient-to-r from-[#9d0d52] to-[#e0187a] px-4 text-[13px] font-semibold text-white hover:opacity-95"
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    Verify now
                  </>
                )}
              </Button>
            </div>
          )}
          {faceError && !faceVerified && !showFaceVerification && <p className={formError}>{faceError}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 order-2">
          <Label htmlFor="email" className={formLabel}>{t('auth.email')} <span className={formRequired}>*</span></Label>
          <div className="relative">
            <Mail className={formFieldIcon} />
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={formData.email}
              onChange={onInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className={`mobile-input-field ${formInput(!!errors.email)} pl-10`}
              style={getInputStyles()}
              placeholder="Email"
            />
          </div>
          {errors.email && <p className={formError}>{errors.email}</p>}
        </div>
        <div className="space-y-1.5 order-1">
          <Label htmlFor="dateOfBirth" className={formLabel}>{t('registration.dateOfBirth')} <span className={formRequired}>*</span></Label>
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            autoComplete="bday"
            max={getLatestAllowedDateOfBirth()}
            value={formData.dateOfBirth}
            onChange={onInputChange}
            className={`[color-scheme:dark] ${formInput(!!errors.dateOfBirth)}`}
            // Dim the "mm/dd/yyyy" mask until a date is picked, so an empty
            // field doesn't read as already filled in.
            style={formData.dateOfBirth ? undefined : { color: 'rgba(255,255,255,0.4)' }}
          />
          {errors.dateOfBirth && <p className={formError}>{errors.dateOfBirth}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="password" className={formLabel}>{t('auth.password')} <span className={formRequired}>*</span></Label>
          <div className="relative">
            <Lock className={formFieldIcon} />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={formData.password}
              onChange={onInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className={`mobile-input-field ${formInput(!!errors.password)} pl-10 pr-11`}
              style={getInputStyles()}
              placeholder="Password"
            />
            <button
              type="button"
              onClick={onTogglePassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-lg text-white/50 hover:text-white/80"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className={formError}>{errors.password}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className={formLabel}>{t('auth.confirmPassword')} <span className={formRequired}>*</span></Label>
          <div className="relative">
            <Lock className={formFieldIcon} />
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={onInputChange}
              className={`mobile-input-field ${formInput(!!errors.confirmPassword)} pl-10 pr-11`}
              style={getInputStyles()}
              placeholder="Confirm"
            />
            <button
              type="button"
              onClick={onToggleConfirmPassword}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-lg text-white/50 hover:text-white/80"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && <p className={formError}>{errors.confirmPassword}</p>}
        </div>
      </div>
    </div>
  );
};

export default BasicInfoSection;
