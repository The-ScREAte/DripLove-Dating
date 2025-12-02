import React, { useState } from 'react';
import { AFRICAN_SYMBOL_GROUPS } from '@/constants/africanSymbols';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AdinkraSymbolSelectorProps {
  selectedSymbols: string[];
  onChange: (symbols: string[]) => void;
}

const AdinkraSymbolSelector: React.FC<AdinkraSymbolSelectorProps> = ({ selectedSymbols, onChange }) => {
  const [expandedGroup, setExpandedGroup] = useState<string | null>('ghana-adinkra');

  const toggleSymbol = (symbolName: string) => {
    if (selectedSymbols.includes(symbolName)) {
      onChange(selectedSymbols.filter(s => s !== symbolName));
    } else if (selectedSymbols.length < 10) {
      onChange([...selectedSymbols, symbolName]);
    }
  };

  const toggleGroup = (groupId: string) => {
    // Only one group open at a time
    setExpandedGroup(prev => prev === groupId ? null : groupId);
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Label className="text-base font-medium">Adinkra Symbols *</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="w-6 h-6 min-w-6 min-h-6 p-0 rounded-full bg-pink-100 hover:bg-pink-200 flex items-center justify-center transition-colors shadow-md flex-shrink-0 border border-pink-200"
                >
                  <span className="text-pink-700 text-sm font-bold leading-none">!</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs z-50">
                <p className="text-xs">
                  <span className="font-semibold text-purple-700">ℹ️ Adinkra Symbols</span>
                  <br />
                  <span className="text-muted-foreground">
                    Select symbols that resonate with you and reflect your personality and values.
                  </span>
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Choose at least 1 symbol that resonates with you (up to 10)</p>
        </div>

      {/* Symbol Groups */}
      <div className="space-y-2">
        {AFRICAN_SYMBOL_GROUPS.map((group) => {
          const isExpanded = expandedGroup === group.id;
          const selectedInGroup = group.symbols.filter(s => selectedSymbols.includes(s.name)).length;
          
          return (
            <Card key={group.id} className="overflow-hidden">
              {/* Group Header */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="w-full p-2.5 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 text-left flex-1">
                  <span className="text-xl">{group.flag}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{group.country}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {group.ethnicGroup} • {group.symbols.length} symbols
                      {selectedInGroup > 0 && (
                        <span className="ml-1 text-primary font-medium">
                          ({selectedInGroup} ✓)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </button>

              {/* Group Content */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t bg-muted/20">
                  <p className="text-[10px] text-muted-foreground mb-2 italic">
                    ℹ️ {group.notes}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {group.symbols.map((symbol) => {
                      const isSelected = selectedSymbols.includes(symbol.name);
                      const canSelect = selectedSymbols.length < 10 || isSelected;
                      
                      return (
                        <div key={symbol.name} className="relative">
                          <Card
                            className={`
                              cursor-pointer transition-all p-3 flex flex-col items-center gap-2 relative
                              ${isSelected 
                                ? 'border-primary border-2 bg-primary/10 shadow-md' 
                                : canSelect 
                                  ? 'border-border hover:border-primary/50 hover:shadow-sm hover:scale-105' 
                                  : 'border-border opacity-50 cursor-not-allowed'
                              }
                            `}
                            onClick={() => canSelect && toggleSymbol(symbol.name)}
                          >
                            {/* Info Icon with Tooltip */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="absolute top-1 right-1 w-5 h-5 min-w-5 min-h-5 p-0 rounded-full bg-pink-100 hover:bg-pink-200 flex items-center justify-center z-10 transition-colors shadow-md flex-shrink-0 border border-pink-200"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                  }}
                                >
                                  <span className="text-pink-700 text-[10px] font-bold leading-none">!</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent 
                                side="top" 
                                align="center"
                                className="max-w-[200px] z-50"
                                sideOffset={5}
                                collisionPadding={10}
                              >
                                <p className="font-medium mb-1 text-xs">{symbol.name}</p>
                                <p className="text-muted-foreground text-xs">{symbol.meaning}</p>
                              </TooltipContent>
                            </Tooltip>

                            <div 
                              className="w-12 h-12 flex-shrink-0"
                              dangerouslySetInnerHTML={{ __html: symbol.svg }}
                            />
                            <div className="text-center flex-1">
                              <p className="text-xs font-medium leading-tight">{symbol.name}</p>
                            </div>
                            {isSelected && (
                              <div className="w-full h-1 bg-primary rounded-full" />
                            )}
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      
      {/* Selection Counter */}
      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${selectedSymbols.length > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
          <p className="text-sm font-medium">
            Selected: {selectedSymbols.length} / 10
          </p>
        </div>
        {selectedSymbols.length === 0 && (
          <span className="text-xs text-red-600 font-medium">Required - select at least 1</span>
        )}
        {selectedSymbols.length === 10 && (
          <span className="text-xs text-blue-600 font-medium">Maximum reached</span>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
};

export default AdinkraSymbolSelector;
