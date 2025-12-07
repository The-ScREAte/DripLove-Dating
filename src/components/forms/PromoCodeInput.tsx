import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Tag, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PromoCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const PromoCodeInput = ({ value, onChange, className = '' }: PromoCodeInputProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [validating, setValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);

  const validatePromoCode = async (code: string) => {
    if (!code.trim()) {
      setIsValid(null);
      setOwnerName(null);
      return;
    }

    setValidating(true);
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('code, owner_name, is_active')
        .eq('code', code.toUpperCase().trim())
        .eq('is_active', true)
        .single();

      if (error || !data) {
        setIsValid(false);
        setOwnerName(null);
      } else {
        setIsValid(true);
        setOwnerName(data.owner_name);
        onChange(data.code); // Use exact code from DB
      }
    } catch (error) {
      console.error('Error validating promo code:', error);
      setIsValid(false);
      setOwnerName(null);
    } finally {
      setValidating(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    onChange(newValue);
    setIsValid(null);
    setOwnerName(null);
  };

  const handleBlur = () => {
    if (value.trim()) {
      validatePromoCode(value);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor="promoCode" className="text-sm font-medium text-gray-700 flex items-center gap-2">
        <Tag className="w-4 h-4 text-pink-500" />
        {t('registration.promoCode', 'Promo Code')} ({t('registration.optional', 'optional')})
      </Label>
      <div className="relative">
        <Input
          id="promoCode"
          type="text"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={t('registration.enterPromoCode', 'Enter promo code if you have one')}
          className={`pr-10 uppercase ${
            isValid === true 
              ? 'border-green-400 focus:border-green-500 bg-green-50' 
              : isValid === false 
                ? 'border-red-400 focus:border-red-500 bg-red-50' 
                : 'border-gray-200 focus:border-pink-400'
          }`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {validating && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
          {!validating && isValid === true && <CheckCircle className="w-4 h-4 text-green-500" />}
          {!validating && isValid === false && <XCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>
      {isValid === true && ownerName && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          {t('registration.promoCodeValid', 'Valid code from')} {ownerName}
        </p>
      )}
      {isValid === false && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          {t('registration.promoCodeInvalid', 'Invalid or expired promo code')}
        </p>
      )}
    </div>
  );
};

export default PromoCodeInput;
