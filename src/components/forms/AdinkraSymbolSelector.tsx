import React from 'react';
import { SELECTABLE_ADINKRA_SYMBOLS } from '@/constants/adinkraSymbols';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

interface AdinkraSymbolSelectorProps {
  selectedSymbols: string[];
  onChange: (symbols: string[]) => void;
}

const AdinkraSymbolSelector: React.FC<AdinkraSymbolSelectorProps> = ({ selectedSymbols, onChange }) => {
  const toggleSymbol = (symbolName: string) => {
    if (selectedSymbols.includes(symbolName)) {
      onChange(selectedSymbols.filter(s => s !== symbolName));
    } else {
      onChange([...selectedSymbols, symbolName]);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-base font-medium">Favorite Adinkra Symbols (Optional)</Label>
        <p className="text-sm text-muted-foreground mt-1">Select up to 10 symbols that resonate with you</p>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {SELECTABLE_ADINKRA_SYMBOLS.map((symbol) => {
          const isSelected = selectedSymbols.includes(symbol.name);
          
          return (
            <Card
              key={symbol.name}
              className={`
                cursor-pointer transition-all p-4 flex flex-col items-center gap-2 hover:scale-105
                ${isSelected ? 'border-primary border-2 bg-primary/5' : 'border-border hover:border-primary/50'}
              `}
              onClick={() => toggleSymbol(symbol.name)}
            >
              <div 
                className="w-12 h-12"
                dangerouslySetInnerHTML={{ __html: symbol.svg }}
              />
              <p className="text-xs font-medium text-center">{symbol.name}</p>
              {isSelected && (
                <div className="w-full h-1 bg-primary rounded-full" />
              )}
            </Card>
          );
        })}
      </div>
      
      {selectedSymbols.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Selected: {selectedSymbols.length} / 10
        </p>
      )}
    </div>
  );
};

export default AdinkraSymbolSelector;
