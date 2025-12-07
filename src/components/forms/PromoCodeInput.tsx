import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, Gift } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PromoCodeInputProps {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}

const PromoCodeInput: React.FC<PromoCodeInputProps> = ({ 
  value, 
  onChange,
  className = '' 
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [validating, setValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);

  // Sync external value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const validateCode = async (code: string) => {
    if (!code.trim()) {
      setIsValid(null);
      setOwnerName(null);
      onChange('');
      return;
    }

    try {
      setValidating(true);
      
      const { data, error } = await supabase
        .from('promo_codes')
        .select('code, owner_name, is_active')
        .eq('code', code.toUpperCase().trim())
        .eq('is_active', true)
        .single();

      if (error || !data) {
        setIsValid(false);
        setOwnerName(null);
        onChange('');
      } else {
        setIsValid(true);
        setOwnerName(data.owner_name);
        onChange(data.code);
      }
    } catch (error) {
      console.error('Error validating promo code:', error);
      setIsValid(false);
      setOwnerName(null);
      onChange('');
    } finally {
      setValidating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    setInputValue(newValue);
    // Reset validation state when typing
    if (isValid !== null) {
      setIsValid(null);
      setOwnerName(null);
    }
  };

  const handleApply = () => {
    validateCode(inputValue);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
  };

  const handleClear = () => {
    setInputValue('');
    setIsValid(null);
    setOwnerName(null);
    onChange('');
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Gift className="w-4 h-4 text-purple-500" />
        <label className="text-sm font-medium text-gray-700">
          Promo Code (Optional)
        </label>
      </div>
      
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Enter promo code"
            className={`pr-8 uppercase ${
              isValid === true 
                ? 'border-green-500 focus:border-green-500' 
                : isValid === false 
                  ? 'border-red-500 focus:border-red-500' 
                  : ''
            }`}
            disabled={validating}
          />
          {/* Status icon inside input */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {validating && (
              <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
            )}
            {!validating && isValid === true && (
              <CheckCircle className="w-4 h-4 text-green-500" />
            )}
            {!validating && isValid === false && (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
          </div>
        </div>
        
        {isValid === true ? (
          <Button 
            type="button" 
            variant="outline" 
            size="sm"
            onClick={handleClear}
            className="text-red-600 hover:text-red-700"
          >
            Clear
          </Button>
        ) : (
          <Button 
            type="button" 
            variant="outline" 
            size="sm"
            onClick={handleApply}
            disabled={!inputValue.trim() || validating}
          >
            {validating ? 'Checking...' : 'Apply'}
          </Button>
        )}
      </div>
      
      {/* Status message */}
      {isValid === true && ownerName && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          Valid code from {ownerName}!
        </p>
      )}
      {isValid === false && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          Invalid or expired promo code
        </p>
      )}
    </div>
  );
};

export default PromoCodeInput;
