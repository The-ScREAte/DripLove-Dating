import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Gift, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PromoCodeInputProps {
  value: string;
  onChange: (value: string, promoCodeId?: string) => void;
  disabled?: boolean;
  className?: string;
}

const PromoCodeInput = ({ value, onChange, disabled, className }: PromoCodeInputProps) => {
  const { toast } = useToast();
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
        toast({
          title: 'Promo code valid!',
          description: `Referred by ${result.owner_name}`,
        });
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
      <Label htmlFor="promoCode" className="text-sm font-medium flex items-center gap-2">
        <Gift className="w-4 h-4 text-pink-500" />
        Promo Code
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
            placeholder="Enter promo code"
            disabled={disabled || validationResult?.valid}
            className={`pr-10 ${
              validationResult?.valid 
                ? 'border-green-500 bg-green-50' 
                : validationResult?.valid === false 
                  ? 'border-red-500 bg-red-50' 
                  : ''
            }`}
          />
          {validationResult && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {validationResult.valid ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
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
            className="shrink-0"
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
            className="shrink-0 text-gray-500"
          >
            Clear
          </Button>
        )}
      </div>
      {validationResult && (
        <p className={`text-xs ${validationResult.valid ? 'text-green-600' : 'text-red-600'}`}>
          {validationResult.valid 
            ? `✓ Referred by ${validationResult.ownerName}` 
            : validationResult.error}
        </p>
      )}
    </div>
  );
};

export default PromoCodeInput;
