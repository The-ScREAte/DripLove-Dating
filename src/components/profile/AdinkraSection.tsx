import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SELECTABLE_ADINKRA_SYMBOLS } from '@/constants/adinkraSymbols';
import { X } from 'lucide-react';

interface AdinkraSectionProps {
  editedProfile: any;
  profile: any;
  isEditing: boolean;
  onAdinkraChange: (symbols: string[]) => void;
}

const AdinkraSection = ({ editedProfile, profile, isEditing, onAdinkraChange }: AdinkraSectionProps) => {
  const { t } = useTranslation();
  const selectedSymbols = isEditing 
    ? (editedProfile.adinkra_symbols || []) 
    : (profile?.adinkra_symbols || []);

  const handleToggleSymbol = (symbolName: string) => {
    if (!isEditing) return;

    const currentSymbols = editedProfile.adinkra_symbols || [];
    let updatedSymbols;

    if (currentSymbols.includes(symbolName)) {
      updatedSymbols = currentSymbols.filter((s: string) => s !== symbolName);
    } else {
      if (currentSymbols.length >= 10) {
        return; // Max 10 symbols
      }
      updatedSymbols = [...currentSymbols, symbolName];
    }

    onAdinkraChange(updatedSymbols);
  };

  const handleRemoveSymbol = (symbolName: string) => {
    if (!isEditing) return;
    const currentSymbols = editedProfile.adinkra_symbols || [];
    const updatedSymbols = currentSymbols.filter((s: string) => s !== symbolName);
    onAdinkraChange(updatedSymbols);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.myAdinkra')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Label>{t('profile.adinkraDescription')}</Label>
          
          {/* Selected Symbols */}
          {selectedSymbols.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t('profile.selected')} ({selectedSymbols.length}/10)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {selectedSymbols.map((symbolName: string) => {
                  const symbol = SELECTABLE_ADINKRA_SYMBOLS.find(s => s.name === symbolName);
                  if (!symbol) return null;
                  
                  return (
                    <Card
                      key={symbolName}
                      className="relative cursor-pointer border-primary border-2 bg-primary/5 p-3 flex flex-col items-center gap-2 hover:scale-105 transition-all"
                      onClick={() => isEditing && handleRemoveSymbol(symbolName)}
                    >
                      {isEditing && (
                        <button
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveSymbol(symbolName);
                          }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      <div 
                        className="w-12 h-12"
                        dangerouslySetInnerHTML={{ __html: symbol.svg }}
                      />
                      <p className="text-xs font-medium text-center">{symbol.name}</p>
                      <div className="w-full h-1 bg-primary rounded-full" />
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available Symbols */}
          {isEditing && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t('profile.availableSymbols')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {SELECTABLE_ADINKRA_SYMBOLS.filter(symbol => !selectedSymbols.includes(symbol.name)).map((symbol) => (
                  <Card
                    key={symbol.name}
                    className="cursor-pointer border-border hover:border-primary/50 p-3 flex flex-col items-center gap-2 hover:scale-105 transition-all"
                    onClick={() => handleToggleSymbol(symbol.name)}
                  >
                    <div 
                      className="w-12 h-12"
                      dangerouslySetInnerHTML={{ __html: symbol.svg }}
                    />
                    <p className="text-xs font-medium text-center">{symbol.name}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {!isEditing && selectedSymbols.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('profile.noAdinkraSelected')}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AdinkraSection;
