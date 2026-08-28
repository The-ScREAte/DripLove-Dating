import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Globe, Check, X, Search } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');

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

  useEffect(() => {
    if (!isOpen) setSearchQuery('');
  }, [isOpen]);

  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(c => c.name.toLowerCase().includes(q));
  }, [countries, searchQuery]);

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
      <DialogContent className="sm:max-w-md bg-black border border-pink-500/30 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Globe className="w-5 h-5 text-pink-400" />
            {t('profile.unlockCountries')}
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            {t('profile.unlockCountriesDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {/* Current country indicator */}
          <div className="mb-3 px-3 py-2 bg-pink-500/10 rounded-lg border border-pink-500/20">
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-pink-400 shrink-0" />
              <span className="text-sm font-medium text-white">{currentCountry}</span>
              <span className="text-xs text-gray-400 ml-auto">{t('profile.yourCountry')}</span>
            </div>
          </div>

          {/* Selected countries summary */}
          <div className="mb-3">
            <div className="text-xs text-gray-400 mb-1.5">
              {t('profile.selectedCountries')}: {selectedCountries.length}/3
            </div>
            {selectedCountries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedCountries.map(code => (
                  <div
                    key={code}
                    className="flex items-center gap-1 px-2 py-0.5 bg-neutral-800 text-white rounded-full text-xs"
                  >
                    <span>{getCountryName(code)}</span>
                    <button
                      onClick={() => handleToggleCountry(code)}
                      className="ml-0.5 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common.search', 'Search countries')}
              className="pl-8 h-9 bg-black border-pink-500/30 text-white placeholder:text-gray-500 text-sm"
            />
          </div>

          {/* Country list */}
          <ScrollArea className="h-[220px] border border-pink-500/20 rounded-lg p-2">
            <div className="space-y-1">
              {filteredCountries.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  {t('common.noResults', 'No countries found')}
                </p>
              )}
              {filteredCountries.map(country => {
                const isSelected = selectedCountries.includes(country.code);
                const isDisabled = !isSelected && selectedCountries.length >= 3;

                return (
                  <div
                    key={country.code}
                    className={`flex items-center space-x-3 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-pink-500/10 border border-pink-500/30'
                        : isDisabled
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-neutral-800'
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
                      className={`flex-1 cursor-pointer text-sm text-gray-200 ${isDisabled ? 'cursor-not-allowed' : ''}`}
                    >
                      {country.name}
                    </Label>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-2 space-x-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="w-auto h-9 px-4 bg-white border-pink-500/30 text-black hover:bg-gray-100"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-auto h-9 px-4 bg-pink-600 hover:bg-pink-700 text-white"
          >
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UnlockCountriesDialog;
