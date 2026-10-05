import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Gift, Loader2 } from 'lucide-react';
import { formLabel, formInput, formError } from '@/components/forms/formTheme';

interface PromoCodeInputProps {
  value: string;
  onChange: (value: string, promoCodeId?: string) => void;
  disabled?: boolean;
  className?: string;
}

const PromoCodeInput = ({ value, onChange, disabled, className }: PromoCodeInputProps) => {
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    promoCodeId?: string;
    ownerName?: string;
    error?: string;
  } | null>(null);

  const validatePromoCode = async () => {
    if (!value.trim()) {
      setValidationResult(null);
      return;
    }

    setValidating(true);
    try {
      const { data, error } = await supabase.rpc('validate_promo_code', {
        code_input: value.trim()
      });

      if (error) throw error;

      const result = data as any;
      
      if (result.valid) {
        setValidationResult({
          valid: true,
          promoCodeId: result.promo_code_id,
          ownerName: result.owner_name
        });
        onChange(value.toUpperCase(), result.promo_code_id);
      } else {
        setValidationResult({
          valid: false,
          error: result.error || 'Invalid promo code'
        });
        onChange(value);
      }
    } catch (error) {
      console.error('Error validating promo code:', error);
      setValidationResult({
        valid: false,
        error: 'Could not validate code'
      });
      onChange(value);
    } finally {
      setValidating(false);
    }
  };

  const handleClear = () => {
    onChange('');
    setValidationResult(null);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor="promoCode" className={`${formLabel} flex items-center gap-2`}>
        <Gift className="w-4 h-4 text-pink-400" />
        Promo Code
        <span className="text-xs font-normal text-white/50">(optional)</span>
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="promoCode"
            value={value}
            onChange={(e) => {
              onChange(e.target.value.toUpperCase());
              setValidationResult(null);
            }}
            placeholder="Code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={disabled || validationResult?.valid}
            className={`${formInput(validationResult?.valid === false)} pr-10 uppercase tracking-wide ${
              validationResult?.valid ? '!border-emerald-400/70 disabled:opacity-100' : ''
            }`}
          />
          {validationResult && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {validationResult.valid ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
            </div>
          )}
        </div>
        {!validationResult?.valid && value && (
          <Button 
            type="button" 
            variant="outline" 
            onClick={validatePromoCode}
            disabled={validating || !value.trim()}
            className="shrink-0 h-12 rounded-full border-white/20 bg-transparent px-5 text-white hover:bg-white/[0.06] hover:text-white"
          >
            {validating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Apply'
            )}
          </Button>
        )}
        {validationResult?.valid && (
          <Button 
            type="button" 
            variant="ghost" 
            onClick={handleClear}
            className="shrink-0 h-12 rounded-full px-4 text-white/80 hover:bg-white/[0.06] hover:text-white"
          >
            Clear
          </Button>
        )}
      </div>
      {validationResult && !validationResult.valid && (
        <p className={formError}>{validationResult.error}</p>
      )}
    </div>
  );
};

export default PromoCodeInput;
