import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { AFRICAN_SYMBOL_GROUPS } from '@/constants/africanSymbols';
import { X, ChevronDown, ChevronUp, Info } from 'lucide-react';

// Flatten all symbols for easy lookup
const ALL_SYMBOLS = AFRICAN_SYMBOL_GROUPS.flatMap(group => group.symbols);

interface AdinkraSectionProps {
  editedProfile: any;
  profile: any;
  isEditing: boolean;
  onAdinkraChange: (symbols: string[]) => void;
}

const AdinkraSection = ({ editedProfile, profile, isEditing, onAdinkraChange }: AdinkraSectionProps) => {
  const { t } = useTranslation();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [showOtherCountries, setShowOtherCountries] = useState(false);
  const [tooltipSymbol, setTooltipSymbol] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  const selectedSymbols = isEditing 
    ? (editedProfile.adinkra_symbols || []) 
    : (profile?.adinkra_symbols || []);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipSymbol && tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setTooltipSymbol(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [tooltipSymbol]);

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
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {selectedSymbols.map((symbolName: string, index: number) => {
                  const symbol = ALL_SYMBOLS.find(s => s.name === symbolName);
                  if (!symbol) return null;
                  
                  const totalCols = 8;
                  const colIndex = index % totalCols;
                  const isLeftEdge = colIndex === 0;
                  const isRightEdge = colIndex === totalCols - 1;
                  
                  return (
                    <div key={symbolName} className="relative">
                      <Card
                        className={`relative border-primary border-2 bg-primary/5 p-2 flex flex-col items-center gap-1 transition-all aspect-square ${
                          isEditing ? 'cursor-pointer hover:scale-105' : ''
                        }`}
                        onClick={() => isEditing && handleRemoveSymbol(symbolName)}
                      >
                        {isEditing && (
                          <button
                            type="button"
                            className="absolute top-0.5 left-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/90 z-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveSymbol(symbolName);
                            }}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                        
                        {/* Info button - always visible */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTooltipSymbol(tooltipSymbol === symbolName ? null : symbolName);
                          }}
                          className="absolute top-0.5 right-0.5 bg-pink-500 text-white rounded-full aspect-square p-0 m-0 min-w-4 min-h-4 w-4 h-4 flex items-center justify-center hover:bg-pink-600 transition-colors z-10"
                        >
                          <Info className="w-2.5 h-2.5" />
                        </button>
                        
                        <div 
                          className="w-8 h-8 flex items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: symbol.svg }}
                        />
                        <p className="text-[10px] font-medium text-center line-clamp-1">{symbol.name}</p>
                        <div className="w-full h-0.5 bg-primary rounded-full" />
                      </Card>

                      {/* Symbol Tooltip */}
                      {tooltipSymbol === symbolName && (
                        <div ref={tooltipRef}>
                          <Card 
                            className={`absolute bottom-full mb-2 z-50 p-3 bg-background border-2 border-primary shadow-lg w-64 ${
                              isLeftEdge ? 'left-0' : isRightEdge ? 'right-0' : 'left-1/2 transform -translate-x-1/2'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className={`absolute -bottom-2 w-4 h-4 bg-background border-r-2 border-b-2 border-primary transform rotate-45 ${
                              isLeftEdge ? 'left-4' : isRightEdge ? 'right-4' : 'left-1/2 -translate-x-1/2'
                            }`} />
                            <p className="text-sm relative z-10">{symbol.meaning}</p>
                          </Card>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available Symbols */}
          {isEditing && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-muted-foreground">{t('profile.availableSymbols')}</p>
              
              {/* Browse Countries Section */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowOtherCountries(!showOtherCountries)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 hover:from-purple-500/20 hover:to-pink-500/20 rounded-lg border border-purple-500/20 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🌍</span>
                    <span className="font-semibold">Browse Countries & Symbols</span>
                    <span className="text-xs text-muted-foreground">({AFRICAN_SYMBOL_GROUPS.length} groups)</span>
                  </div>
                  {showOtherCountries ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>

                {showOtherCountries && (
                  <div className="space-y-3 pl-2">
                    {AFRICAN_SYMBOL_GROUPS.map((group) => (
                      <div key={group.id} className="space-y-2">
                        <div className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                          <span className="text-xl">{group.flag}</span>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{group.country}</p>
                            <p className="text-xs text-muted-foreground">{group.ethnicGroup} • {group.use}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
                            className="p-2 hover:bg-primary/10 rounded-full transition-colors"
                          >
                            {expandedGroup === group.id ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {expandedGroup === group.id && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-2">
                            {group.symbols.filter(symbol => !selectedSymbols.includes(symbol.name)).map((symbol, index) => {
                              const totalCols = 5;
                              const colIndex = index % totalCols;
                              const isLeftEdge = colIndex === 0;
                              const isRightEdge = colIndex === totalCols - 1;
                              
                              return (
                                <div key={symbol.name} className="relative">
                                  <Card
                                    className="cursor-pointer border-border hover:border-primary/50 p-3 flex flex-col items-center gap-2 hover:scale-105 transition-all relative aspect-square"
                                    onClick={() => handleToggleSymbol(symbol.name)}
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTooltipSymbol(tooltipSymbol === symbol.name ? null : symbol.name);
                                      }}
                                      className="absolute top-1 right-1 bg-pink-500 text-white rounded-full aspect-square p-0 m-0 min-w-5 min-h-5 w-5 h-5 flex items-center justify-center hover:bg-pink-600 transition-colors z-10"
                                    >
                                      <Info className="w-3 h-3" />
                                    </button>
                                    <div 
                                      className="w-12 h-12 flex items-center justify-center"
                                      dangerouslySetInnerHTML={{ __html: symbol.svg }}
                                    />
                                    <p className="text-xs font-medium text-center line-clamp-2">{symbol.name}</p>
                                  </Card>

                                  {/* Symbol Tooltip */}
                                  {tooltipSymbol === symbol.name && (
                                    <div ref={tooltipRef}>
                                      <Card 
                                        className={`absolute bottom-full mb-2 z-50 p-3 bg-background border-2 border-primary shadow-lg w-64 ${
                                          isLeftEdge ? 'left-0' : isRightEdge ? 'right-0' : 'left-1/2 transform -translate-x-1/2'
                                        }`}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className={`absolute -bottom-2 w-4 h-4 bg-background border-r-2 border-b-2 border-primary transform rotate-45 ${
                                          isLeftEdge ? 'left-4' : isRightEdge ? 'right-4' : 'left-1/2 -translate-x-1/2'
                                        }`} />
                                        <p className="text-sm relative z-10">{symbol.meaning}</p>
                                      </Card>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
