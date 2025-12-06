import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Crown, X, Check, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCountriesList } from '@/constants/locationData';

interface UnlockedCountriesSelectorProps {
  currentUserId: string;
  userCountryCode: string;
  isPremium: boolean;
  unlockedCountries: string[];
  onCountriesChange: (countries: string[]) => void;
}

const UnlockedCountriesSelector = ({
  currentUserId,
  userCountryCode,
  isPremium,
  unlockedCountries,
  onCountriesChange
}: UnlockedCountriesSelectorProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(unlockedCountries || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  const allCountries = getCountriesList();
  const MAX_COUNTRIES = 3;

  // Filter out user's own country and filter by search term
  const availableCountries = allCountries
    .filter(country => country.code !== userCountryCode)
    .filter(country => 
      country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      country.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

  useEffect(() => {
    setSelectedCountries(unlockedCountries || []);
  }, [unlockedCountries]);

  const toggleCountry = (countryCode: string) => {
    setSelectedCountries(prev => {
      if (prev.includes(countryCode)) {
        return prev.filter(c => c !== countryCode);
      } else if (prev.length < MAX_COUNTRIES) {
        return [...prev, countryCode];
      }
      return prev;
    });
  };

  const getCountryName = (code: string) => {
    const country = allCountries.find(c => c.code === code);
    return country?.name || code;
  };

  const handleSave = async () => {
    if (!currentUserId) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ unlocked_countries: selectedCountries })
        .eq('id', currentUserId);

      if (error) throw error;

      onCountriesChange(selectedCountries);
      
      // Clear discover cache to show new countries
      if (typeof window !== 'undefined' && (window as any).discoverCache) {
        (window as any).discoverCache.delete(currentUserId);
      }
      
      toast({
        title: t('profile.countriesUnlocked'),
        description: t('profile.countriesUnlockedDesc'),
        duration: 3000,
      });
      
      setOpen(false);
    } catch (error) {
      console.error('Error saving unlocked countries:', error);
      toast({
        title: t('common.error'),
        description: t('common.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isPremium) {
    return (
      <div className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Crown className="w-5 h-5 text-yellow-600" />
          <span className="font-semibold text-yellow-800">{t('profile.premiumFeature')}</span>
        </div>
        <p className="text-sm text-yellow-700">
          {t('profile.unlockCountriesDescription')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <span className="font-medium">{t('profile.unlockedCountries')}</span>
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            <Crown className="w-3 h-3 mr-1" />
            {t('profile.premium')}
          </Badge>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {t('profile.unlockCountriesExplanation')}
      </p>

      {/* Show currently selected countries */}
      {selectedCountries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCountries.map(code => (
            <Badge key={code} variant="outline" className="bg-primary/10 text-primary border-primary/30">
              <MapPin className="w-3 h-3 mr-1" />
              {getCountryName(code)}
            </Badge>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full">
            <Globe className="w-4 h-4 mr-2" />
            {selectedCountries.length > 0 
              ? t('profile.editUnlockedCountries')
              : t('profile.selectCountries')
            }
            <span className="ml-auto text-muted-foreground">
              {selectedCountries.length}/{MAX_COUNTRIES}
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              {t('profile.selectUnlockedCountries')}
            </DialogTitle>
            <DialogDescription>
              {t('profile.selectUpToCountries', { count: MAX_COUNTRIES })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              placeholder={t('common.searchCountries')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />

            <div className="text-sm text-muted-foreground">
              {t('profile.selectedCount', { current: selectedCountries.length, max: MAX_COUNTRIES })}
            </div>

            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-1">
                {availableCountries.map(country => {
                  const isSelected = selectedCountries.includes(country.code);
                  const isDisabled = !isSelected && selectedCountries.length >= MAX_COUNTRIES;
                  
                  return (
                    <button
                      key={country.code}
                      onClick={() => !isDisabled && toggleCountry(country.code)}
                      disabled={isDisabled}
                      className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                        isSelected 
                          ? 'bg-primary/10 border border-primary/30' 
                          : isDisabled
                            ? 'bg-muted/50 opacity-50 cursor-not-allowed'
                            : 'bg-muted/30 hover:bg-muted/50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-lg">🌍</span>
                        <span className={isSelected ? 'font-medium' : ''}>{country.name}</span>
                      </span>
                      {isSelected && (
                        <Check className="w-5 h-5 text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button 
                className="flex-1"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UnlockedCountriesSelector;
