import React, { useState, useMemo } from 'react';
 
import { AFRICAN_SYMBOL_GROUPS, MAX_CULTURAL_SIGNS } from '@/constants/africanSymbols';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';

interface AdinkraSymbolSelectorProps {
  selectedSymbols: string[];
  onChange: (symbols: string[]) => void;
  userCountry?: string;
}

// Asian countries for Chinese Zodiac
const ASIAN_COUNTRIES = ['china', 'japan', 'korea', 'vietnam', 'thailand', 'singapore', 'malaysia', 'indonesia', 'philippines', 'hong kong', 'taiwan', 'mongolia', 'cambodia', 'laos', 'myanmar', 'brunei'];

const AdinkraSymbolSelector: React.FC<AdinkraSymbolSelectorProps> = ({ selectedSymbols, onChange, userCountry }) => {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [showOtherCountries, setShowOtherCountries] = useState(false);
  const [tooltipSymbol, setTooltipSymbol] = useState<string | null>(null);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [groupTooltip, setGroupTooltip] = useState<string | null>(null);

  // Find user's country group
  const userCountryGroup = useMemo(() => {
    if (!userCountry) return null;
    return AFRICAN_SYMBOL_GROUPS.find(group => 
      group.country.toLowerCase().includes(userCountry.toLowerCase()) ||
      userCountry.toLowerCase().includes(group.country.toLowerCase())
    );
  }, [userCountry]);

  // Determine default groups to show when user's country is not in our list
  const defaultGroups = useMemo(() => {
    if (userCountryGroup || !userCountry) return [];
    
    const isAsian = ASIAN_COUNTRIES.some(asian => 
      userCountry.toLowerCase().includes(asian) || asian.includes(userCountry.toLowerCase())
    );
    
    const westernZodiac = AFRICAN_SYMBOL_GROUPS.find(g => g.id === 'western-zodiac');
    const chineseZodiac = AFRICAN_SYMBOL_GROUPS.find(g => g.id === 'chinese-zodiac');
    
    const defaults = [];
    if (westernZodiac) defaults.push(westernZodiac);
    if (isAsian && chineseZodiac) defaults.push(chineseZodiac);
    
    return defaults;
  }, [userCountry, userCountryGroup]);

  // Get other country groups
  const otherCountryGroups = useMemo(() => {
    const excludeIds = new Set();
    if (userCountryGroup) excludeIds.add(userCountryGroup.id);
    defaultGroups.forEach(g => excludeIds.add(g.id));
    
    return AFRICAN_SYMBOL_GROUPS.filter(group => !excludeIds.has(group.id));
  }, [userCountryGroup, defaultGroups]);

  // Close tooltips when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.info-tooltip-container')) {
        setShowInfoTooltip(false);
        setTooltipSymbol(null);
        setGroupTooltip(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Memoize selected counts to avoid recalculation
  const selectedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    AFRICAN_SYMBOL_GROUPS.forEach(group => {
      counts[group.id] = group.symbols.filter(s => selectedSymbols.includes(s.name)).length;
    });
    return counts;
  }, [selectedSymbols]);

  const toggleSymbol = (symbolName: string) => {
    if (selectedSymbols.includes(symbolName)) {
      onChange(selectedSymbols.filter(s => s !== symbolName));
    } else if (selectedSymbols.length < MAX_CULTURAL_SIGNS) {
      onChange([...selectedSymbols, symbolName]);
    }
  };

  const toggleGroup = (groupId: string) => {
    // Only one group open at a time
    setExpandedGroup(prev => prev === groupId ? null : groupId);
    // Close any open tooltips when switching groups
    setTooltipSymbol(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <Label className="text-[15px] font-semibold tracking-tight text-white">Cultural Signs <span className="text-pink-400">*</span></Label>
            <div className="relative info-tooltip-container">
              <button
                type="button"
                aria-label="About Cultural Signs" className="w-5 h-5 min-w-5 min-h-5 p-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
                onClick={() => setShowInfoTooltip(!showInfoTooltip)}
              >
                <span className="text-white/80 text-[11px] font-bold leading-none">i</span>
              </button>
              {showInfoTooltip && (
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 z-30 w-64">
                  <div className="bg-popover text-popover-foreground p-2.5 rounded-lg shadow-lg border">
                    <p className="text-xs">
                      <span className="font-semibold text-pink-400">Cultural Signs</span>
                      <br />
                      <span className="text-muted-foreground">
                        Pick up to {MAX_CULTURAL_SIGNS} symbols that resonate with you and reflect your personality and values.
                      </span>
                    </p>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 -mb-1">
                      <div className="border-6 border-transparent border-b-popover"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm shrink-0">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${selectedSymbols.length > 0 ? 'bg-emerald-400' : 'bg-white/25'}`} />
              <span className="font-medium text-white/70">{selectedSymbols.length} / {MAX_CULTURAL_SIGNS}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Symbol Groups */}
      <div className="space-y-3">
        {/* Default Groups (Western/Chinese Zodiac) - Show when user's country is not in our list */}
        {!userCountryGroup && defaultGroups.length > 0 && defaultGroups.map((group) => (
          <div key={group.id} className="space-y-1.5">
            <Card className="overflow-visible rounded-xl border border-white/10 bg-transparent text-white">
              <div className="px-2.5 py-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{group.flag}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-white">{group.country}</h3>
                  </div>
                  {(selectedCounts[group.id] || 0) > 0 && (
                    <span className="text-xs text-pink-400 font-medium">
                      {selectedCounts[group.id]} selected
                    </span>
                  )}
                  <div className="relative info-tooltip-container">
                    <button
                      type="button"
                      aria-label="About this group" className="w-5 h-5 min-w-5 min-h-5 p-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
                      onClick={() => setGroupTooltip(groupTooltip === group.id ? null : group.id)}
                    >
                      <span className="text-white/80 text-[11px] font-bold leading-none">i</span>
                    </button>
                    {groupTooltip === group.id && (
                      <div className="absolute bottom-full right-0 mb-3 z-[9999] w-72">
                        <div className="bg-popover text-popover-foreground p-3 rounded-lg shadow-lg border">
                          <p className="text-xs leading-relaxed text-muted-foreground">{group.description}</p>
                          <div className="absolute top-full right-4 -mt-1">
                            <div className="border-6 border-transparent border-t-popover"></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-2">
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-1.5">
                  {group.symbols.map((symbol, index) => {
                    const isSelected = selectedSymbols.includes(symbol.name);
                    const canSelect = selectedSymbols.length < MAX_CULTURAL_SIGNS || isSelected;
                    const showTooltip = tooltipSymbol === symbol.name;
                    const totalCols = 8;
                    const colIndex = index % totalCols;
                    const isLeftEdge = colIndex === 0;
                    const isRightEdge = colIndex === totalCols - 1;
                    let tooltipPositionClass = 'left-1/2 transform -translate-x-1/2';
                    if (isLeftEdge) tooltipPositionClass = 'left-0';
                    else if (isRightEdge) tooltipPositionClass = 'right-0';
                    return (
                      <div key={symbol.name} className="relative info-tooltip-container">
                        <Card
                          className={`bg-white/[0.06] text-white cursor-pointer transition-all p-1 flex flex-col items-center justify-center gap-1 relative h-16 rounded-lg ${
                            isSelected ? 'border-pink-500 border-2 bg-pink-500/15' : canSelect ? 'border-white/10 hover:border-pink-500/50' : 'border-white/10 opacity-40 cursor-not-allowed'
                          }`}
                          onClick={() => canSelect && toggleSymbol(symbol.name)}
                        >
                          <button type="button" aria-label="Symbol meaning" className="absolute top-0.5 right-0.5 w-4 h-4 min-w-4 min-h-4 p-0 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center z-10 transition-colors flex-shrink-0"
                            onClick={(e) => { e.stopPropagation(); setTooltipSymbol(showTooltip ? null : symbol.name); }}>
                            <span className="text-white/85 text-[8px] font-bold leading-none">i</span>
                          </button>
                          <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6" dangerouslySetInnerHTML={{ __html: symbol.svg }} />
                          <p className="text-[9px] font-medium leading-tight text-center px-1 line-clamp-1 text-white/85">{symbol.name}</p>
                          {isSelected && <div className="absolute bottom-0 left-0 right-0 h-1 bg-pink-500" />}
                        </Card>
                        {showTooltip && (
                          <div className={`absolute bottom-full ${tooltipPositionClass} mb-2 z-[9999] w-44 max-w-[calc(100vw-3rem)]`}>
                            <div className="bg-popover text-popover-foreground p-2 rounded-lg shadow-lg border text-xs">
                              <p className="font-medium mb-1">{symbol.name}</p>
                              <p className="text-muted-foreground">{symbol.meaning}</p>
                              <div className={`absolute top-full ${isLeftEdge ? 'left-4' : isRightEdge ? 'right-4' : 'left-1/2 transform -translate-x-1/2'} -mt-1`}>
                                <div className="border-8 border-transparent border-t-popover"></div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>
        ))}

        {/* User's Country Group - Always Visible if exists */}
        {userCountryGroup && (
                          
          <div className="space-y-1.5">
            <Card className="overflow-visible rounded-xl border border-white/10 bg-transparent text-white">
              {/* User's Country Header - Always Expanded */}
              <div className="px-2.5 py-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{userCountryGroup.flag}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-white">{userCountryGroup.country}</h3>
                  </div>
                  {(selectedCounts[userCountryGroup.id] || 0) > 0 && (
                    <span className="text-xs text-pink-400 font-medium">
                      {selectedCounts[userCountryGroup.id]} selected
                    </span>
                  )}
                  <div className="relative info-tooltip-container">
                    <button
                      type="button"
                      aria-label="About this group" className="w-5 h-5 min-w-5 min-h-5 p-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
                      onClick={() => setGroupTooltip(groupTooltip === userCountryGroup.id ? null : userCountryGroup.id)}
                    >
                      <span className="text-white/80 text-[11px] font-bold leading-none">i</span>
                    </button>
                    {groupTooltip === userCountryGroup.id && (
                      <div className="absolute bottom-full right-0 mb-3 z-[9999] w-72">
                        <div className="bg-popover text-popover-foreground p-3 rounded-lg shadow-lg border">
                          <p className="text-xs leading-relaxed text-muted-foreground">{userCountryGroup.description}</p>
                          <div className="absolute top-full right-4 -mt-1">
                            <div className="border-6 border-transparent border-t-popover"></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* User's Country Symbols - Always Visible */}
              <div className="p-2">
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-1.5">
                  {userCountryGroup.symbols.map((symbol, index) => {
                    const isSelected = selectedSymbols.includes(symbol.name);
                    const canSelect = selectedSymbols.length < MAX_CULTURAL_SIGNS || isSelected;
                    const showTooltip = tooltipSymbol === symbol.name;

                    const totalCols = 8;
                    const colIndex = index % totalCols;
                    const isLeftEdge = colIndex === 0;
                    const isRightEdge = colIndex === totalCols - 1;

                    let tooltipPositionClass = 'left-1/2 transform -translate-x-1/2';
                    if (isLeftEdge) {
                      tooltipPositionClass = 'left-0';
                    } else if (isRightEdge) {
                      tooltipPositionClass = 'right-0';
                    }

                    return (
                      <div key={symbol.name} className="relative info-tooltip-container">
                        <Card
                          className={`
                            bg-white/[0.06] text-white cursor-pointer transition-all p-1 flex flex-col items-center justify-center gap-1 relative h-16 rounded-lg
                            ${isSelected
                              ? 'border-pink-500 border-2 bg-pink-500/15'
                              : canSelect
                                ? 'border-white/10 hover:border-pink-500/50'
                                : 'border-white/10 opacity-40 cursor-not-allowed'
                            }
                          `}
                          onClick={() => canSelect && toggleSymbol(symbol.name)}
                        >
                          <button
                            type="button"
                            aria-label="Symbol meaning" className="absolute top-0.5 right-0.5 w-4 h-4 min-w-4 min-h-4 p-0 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center z-10 transition-colors flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTooltipSymbol(showTooltip ? null : symbol.name);
                            }}
                          >
                            <span className="text-white/85 text-[8px] font-bold leading-none">i</span>
                          </button>

                          <div
                            className="w-6 h-6 flex-shrink-0 flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6"
                            dangerouslySetInnerHTML={{ __html: symbol.svg }}
                          />
                          <p className="text-[9px] font-medium leading-tight text-center px-1 line-clamp-1 text-white/85">{symbol.name}</p>
                          {isSelected && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-pink-500" />
                          )}
                        </Card>

                        {showTooltip && (
                          <div className={`absolute bottom-full ${tooltipPositionClass} mb-2 z-[9999] w-44 max-w-[calc(100vw-3rem)]`}>
                            <div className="bg-popover text-popover-foreground p-2 rounded-lg shadow-lg border text-xs">
                              <p className="font-medium mb-1">{symbol.name}</p>
                              <p className="text-muted-foreground">{symbol.meaning}</p>
                              <div className={`absolute top-full ${isLeftEdge ? 'left-4' : isRightEdge ? 'right-4' : 'left-1/2 transform -translate-x-1/2'} -mt-1`}>
                                <div className="border-8 border-transparent border-t-popover"></div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Browse Other Countries Section */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowOtherCountries(!showOtherCountries)}
            className="w-full flex items-center justify-between px-4 h-12 rounded-full border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08] transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">🌍</span>
              <span className="font-medium text-sm">Browse other signs</span>
            </div>
            {showOtherCountries ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>

          {showOtherCountries && (
            <div className="space-y-2 pl-2">
              {otherCountryGroups.map((group) => {
                const isExpanded = expandedGroup === group.id;
                const selectedInGroup = selectedCounts[group.id] || 0;
                
                return (
                  <Card key={group.id} className="overflow-visible rounded-xl border border-white/10 bg-transparent text-white">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className="w-full p-2.5 flex items-center justify-between rounded-xl hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="flex items-center gap-2 text-left flex-1">
                        <span className="text-xl">{group.flag}</span>
                        <div className="flex-1">
                          <h3 className="font-semibold text-sm">{group.country}</h3>
                        </div>
                        {selectedInGroup > 0 && (
                          <span className="text-xs text-pink-400 font-medium mr-2">
                            {selectedInGroup} selected
                          </span>
                        )}
                        <div className="relative info-tooltip-container mr-2">
                          <button
                            type="button"
                            aria-label="About this group" className="w-5 h-5 min-w-5 min-h-5 p-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setGroupTooltip(groupTooltip === group.id ? null : group.id);
                            }}
                          >
                            <span className="text-white/80 text-[11px] font-bold leading-none">i</span>
                          </button>
                          {groupTooltip === group.id && (
                            <div className="absolute bottom-full right-0 mb-3 z-[9999] w-72">
                              <div className="bg-popover text-popover-foreground p-3 rounded-lg shadow-lg border">
                                <p className="text-xs leading-relaxed text-muted-foreground">{group.description}</p>
                                <div className="absolute top-full right-4 -mt-1">
                                  <div className="border-6 border-transparent border-t-popover"></div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-white/50 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-white/50 flex-shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="p-2 border-t border-white/10">
                        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-1.5">
                          {group.symbols.map((symbol, index) => {
                            const isSelected = selectedSymbols.includes(symbol.name);
                            const canSelect = selectedSymbols.length < MAX_CULTURAL_SIGNS || isSelected;
                            const showTooltip = tooltipSymbol === symbol.name;

                            const totalCols = 8;
                            const colIndex = index % totalCols;
                            const isLeftEdge = colIndex === 0;
                            const isRightEdge = colIndex === totalCols - 1;

                            let tooltipPositionClass = 'left-1/2 transform -translate-x-1/2';
                            if (isLeftEdge) {
                              tooltipPositionClass = 'left-0';
                            } else if (isRightEdge) {
                              tooltipPositionClass = 'right-0';
                            }

                            return (
                              <div key={symbol.name} className="relative info-tooltip-container">
                                <Card
                                  className={`
                                    bg-white/[0.06] text-white cursor-pointer transition-all p-1 flex flex-col items-center justify-center gap-1 relative h-16 rounded-lg
                                    ${isSelected
                                      ? 'border-pink-500 border-2 bg-pink-500/15'
                                      : canSelect
                                        ? 'border-white/10 hover:border-pink-500/50'
                                        : 'border-white/10 opacity-40 cursor-not-allowed'
                                    }
                                  `}
                                  onClick={() => canSelect && toggleSymbol(symbol.name)}
                                >

                                  <button
                                    type="button"
                                    aria-label="Symbol meaning" className="absolute top-0.5 right-0.5 w-4 h-4 min-w-4 min-h-4 p-0 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center z-10 transition-colors flex-shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTooltipSymbol(showTooltip ? null : symbol.name);
                                    }}
                                  >
                                    <span className="text-white/85 text-[8px] font-bold leading-none">i</span>
                                  </button>

                                  <div
                                    className="w-6 h-6 flex-shrink-0 flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6"
                                    dangerouslySetInnerHTML={{ __html: symbol.svg }}
                                  />
                                  <p className="text-[9px] font-medium leading-tight text-center px-1 line-clamp-1 text-white/85">{symbol.name}</p>
                                  {isSelected && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-pink-500" />
                                  )}
                                </Card>

                                {showTooltip && (
                                  <div className={`absolute bottom-full ${tooltipPositionClass} mb-2 z-[9999] w-44 max-w-[calc(100vw-3rem)]`}>
                                    <div className="bg-popover text-popover-foreground p-2 rounded-lg shadow-lg border text-xs">
                                      <p className="font-medium mb-1">{symbol.name}</p>
                                      <p className="text-muted-foreground">{symbol.meaning}</p>
                                      <div className={`absolute top-full ${isLeftEdge ? 'left-4' : isRightEdge ? 'right-4' : 'left-1/2 transform -translate-x-1/2'} -mt-1`}>
                                        <div className="border-8 border-transparent border-t-popover"></div>
                                      </div>
                                    </div>
                                  </div>
                                )}
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
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(AdinkraSymbolSelector);
