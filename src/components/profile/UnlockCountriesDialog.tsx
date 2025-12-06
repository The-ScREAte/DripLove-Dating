import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Globe, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCountriesList } from '@/constants/locationData';

interface UnlockCountriesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentCountry: string;
  currentCountryCode: string;
  unlockedCountries: string[];
  onSave: (countries: string[]) => void;
}

const UnlockCountriesDialog = ({
  isOpen,
  onClose,
  userId,
  currentCountry,
  currentCountryCode,
  unlockedCountries,
  onSave
}: UnlockCountriesDialogProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedCountries, setSelectedCountries] = useState<string[]>(unlockedCountries || []);
  const [isSaving, setIsSaving] = useState(false);
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    // Get all countries from location data
    const allCountries = getCountriesList();
    // Filter out user's current country
    const filteredCountries = allCountries.filter(c => c.code !== currentCountryCode);
    setCountries(filteredCountries);
  }, [currentCountryCode]);

  useEffect(() => {
    setSelectedCountries(unlockedCountries || []);
  }, [unlockedCountries, isOpen]);

  const handleToggleCountry = (countryCode: string) => {
    setSelectedCountries(prev => {
      if (prev.includes(countryCode)) {
        return prev.filter(c => c !== countryCode);
      } else if (prev.length < 3) {
        return [...prev, countryCode];
      }
      return prev;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ unlocked_countries: selectedCountries })
        .eq('id', userId);

      if (error) throw error;

      onSave(selectedCountries);
      toast({
        title: t('profile.countriesUnlocked'),
        description: t('profile.countriesUnlockedDescription'),
      });
      onClose();
    } catch (error) {
      console.error('Error saving unlocked countries:', error);
      toast({
        title: t('common.error'),
        description: t('profile.errorSavingCountries'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getCountryName = (code: string) => {
    const country = countries.find(c => c.code === code);
    return country?.name || code;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            {t('profile.unlockCountries')}
          </DialogTitle>
          <DialogDescription>
            {t('profile.unlockCountriesDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Current country indicator */}
          <div className="mb-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{currentCountry}</span>
              <span className="text-xs text-muted-foreground ml-auto">{t('profile.yourCountry')}</span>
            </div>
          </div>

          {/* Selected countries summary */}
          <div className="mb-4">
            <div className="text-sm text-muted-foreground mb-2">
              {t('profile.selectedCountries')}: {selectedCountries.length}/3
            </div>
            {selectedCountries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCountries.map(code => (
                  <div 
                    key={code}
                    className="flex items-center gap-1 px-2 py-1 bg-secondary rounded-full text-sm"
                  >
                    <span>{getCountryName(code)}</span>
                    <button 
                      onClick={() => handleToggleCountry(code)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Country list */}
          <ScrollArea className="h-[300px] border rounded-lg p-2">
            <div className="space-y-2">
              {countries.map(country => {
                const isSelected = selectedCountries.includes(country.code);
                const isDisabled = !isSelected && selectedCountries.length >= 3;
                
                return (
                  <div 
                    key={country.code}
                    className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-primary/10 border border-primary/30' 
                        : isDisabled
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-muted'
                    }`}
                    onClick={() => !isDisabled && handleToggleCountry(country.code)}
                  >
                    <Checkbox
                      id={country.code}
                      checked={isSelected}
                      disabled={isDisabled}
                      onCheckedChange={() => !isDisabled && handleToggleCountry(country.code)}
                    />
                    <Label 
                      htmlFor={country.code}
                      className={`flex-1 cursor-pointer ${isDisabled ? 'cursor-not-allowed' : ''}`}
                    >
                      {country.name}
                    </Label>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UnlockCountriesDialog;
