import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Search, Check, Loader2, CheckCircle2, Lock, X, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  getCountriesList, 
  getCitiesForCountry, 
  getCityCoordinates, 
  getCountryByCode,
  type CityData 
} from '@/constants/locationData';
import { getEnabledCountries } from '@/utils/enabledCountries';
import { autoDetectCountry, checkIfUserIsOutsideCountry, getCountryName as getCountryNameFromCode } from '@/utils/countryDetection';
import { searchCitiesForCountry } from '@/utils/citySearch';

interface LocationInputProps {
  country: string;
  city: string;
  zipCode: string;
  countryCode?: string; // Current profile country code for lock check
  onLocationChange: (location: {
    country: string;
    countryCode: string;
    city: string;
    zipCode: string;
    latitude?: number;
    longitude?: number;
    isCustomCity?: boolean;
  }) => void;
  errors?: {
    country?: string;
    city?: string;
    zipCode?: string;
  };
  required?: boolean;
  autoDetect?: boolean; // Enable auto-detection on mount
  isProfileEdit?: boolean; // If true, check if user is outside their country
  isPremium?: boolean; // Show upgrade note for free users
  disabled?: boolean; // Disable all inputs (read-only mode)
}

const LocationInput = ({
  country,
  city,
  zipCode,
  countryCode: profileCountryCode,
  onLocationChange,
  errors = {},
  required = false,
  autoDetect = false,
  isProfileEdit = false,
  isPremium = false,
  disabled = false
}: LocationInputProps) => {
  const isRemoteCitySearchCountry = (code: string) => ['US', 'CA', 'GB'].includes(code);

  const [selectedCountryCode, setSelectedCountryCode] = useState<string>('');
  const [cityInput, setCityInput] = useState<string>(city);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [isCustomCity, setIsCustomCity] = useState(false);
  const [suggestedCities, setSuggestedCities] = useState<CityData[]>([]);
  const [coordinates, setCoordinates] = useState<{lat?: number, lng?: number}>({});
  const [countries, setCountries] = useState<any[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isCountryLocked, setIsCountryLocked] = useState(false);
  const [isCheckingOutsideCountry, setIsCheckingOutsideCountry] = useState(false);
  const [outsideCountryStatus, setOutsideCountryStatus] = useState<{
    checked: boolean;
    isOutside: boolean;
    currentLocation: string | null;
    currentCountryCode: string | null;
  }>({ checked: false, isOutside: false, currentLocation: null, currentCountryCode: null });
  const [detectionMethod, setDetectionMethod] = useState<'gps' | 'ip' | null>(null);
  const [isChangingCountry, setIsChangingCountry] = useState(false);
  const { toast } = useToast();

  // Load enabled countries on mount
  useEffect(() => {
    const loadCountries = async () => {
      try {
        setLoadingCountries(true);
        const enabledCountries = await getEnabledCountries();
        setCountries(enabledCountries);
      } catch (error) {
        console.error('Error loading countries:', error);
        // Fallback to all countries
        setCountries(getCountriesList());
      } finally {
        setLoadingCountries(false);
      }
    };
    
    loadCountries();
  }, []);

  // Check if user is outside their profile country when editing profile
  // For profile edit mode, country is ALWAYS locked unless user is detected outside their country
  useEffect(() => {
    if (isProfileEdit && profileCountryCode && countries.length > 0 && !outsideCountryStatus.checked) {
      // Lock country immediately for profile edit mode
      setIsCountryLocked(true);
      checkUserLocation();
    }
  }, [isProfileEdit, profileCountryCode, countries]);

  const checkUserLocation = async () => {
    setIsCheckingOutsideCountry(true);
    try {
      const result = await checkIfUserIsOutsideCountry(profileCountryCode || '');
      setOutsideCountryStatus({
        checked: true,
        isOutside: result.isOutside,
        currentLocation: result.currentCountryName,
        currentCountryCode: result.currentCountryCode
      });
      
      // If user is NOT outside their country, lock the country field
      if (!result.isOutside && result.method !== 'failed') {
        setIsCountryLocked(true);
        setDetectionMethod(result.method);
      }
    } catch (error) {
      console.error('Error checking user location:', error);
      // If check fails, lock country for safety
      setOutsideCountryStatus({ checked: true, isOutside: false, currentLocation: null, currentCountryCode: null });
      setIsCountryLocked(true);
    } finally {
      setIsCheckingOutsideCountry(false);
    }
  };

  // Handle auto-change country when user clicks the button (for profile edit)
  const handleAutoChangeCountry = async () => {
    if (!outsideCountryStatus.currentCountryCode || !outsideCountryStatus.currentLocation) return;
    
    setIsChangingCountry(true);
    
    try {
      const newCountryCode = outsideCountryStatus.currentCountryCode;
      const newCountryName = outsideCountryStatus.currentLocation;
      
      // Check if country is in enabled list
      const countryInList = countries.find(c => c.code === newCountryCode);
      if (!countryInList) {
        toast({
          title: "Country not available",
          description: `${newCountryName} is not currently available. Please contact support.`,
          variant: "destructive"
        });
        return;
      }
      
      // Update the country and clear city
      setSelectedCountryCode(newCountryCode);
      setCityInput('');
      setIsCustomCity(false);
      setCoordinates({});
      // Never auto-open the city list - it only opens when the user taps the field.
      setShowCitySuggestions(false);
      
      // Update parent
      onLocationChange({
        country: newCountryName,
        countryCode: newCountryCode,
        city: '', // Clear city so user must select new one
        zipCode: '',
        latitude: undefined,
        longitude: undefined,
        isCustomCity: false
      });
      
      // Reset outside status since we've now changed
      setOutsideCountryStatus({
        checked: true,
        isOutside: false,
        currentLocation: newCountryName,
        currentCountryCode: newCountryCode
      });
      setIsCountryLocked(true);
      
      toast({
        title: "Country updated",
        description: `Your country has been changed to ${newCountryName}. Please select your city.`,
      });
    } finally {
      setIsChangingCountry(false);
    }
  };

  // Auto-detect country on mount if enabled (for new users/registration)
  useEffect(() => {
    if (autoDetect && !country && countries.length > 0 && !isProfileEdit && !isDetecting) {
      handleAutoDetectSilent();
    }
  }, [autoDetect, countries, isProfileEdit, country]);

  // Silent auto-detect country function (no button needed - runs automatically)
  const handleAutoDetectSilent = async () => {
    setIsDetecting(true);
    
    try {
      const result = await autoDetectCountry();
      
      if (result.method === 'failed') {
        // Detection failed - allow manual selection as fallback, but once selected it will be locked
        setIsCountryLocked(false);
        setIsDetecting(false);
        toast({
          title: "Auto-detection unavailable",
          description: "Please select your country manually. Once selected, it cannot be changed to prevent fake locations.",
          variant: "default"
        });
        return;
      }

      // Check if detected country is in enabled countries
      const detectedCountry = countries.find(c => c.code === result.countryCode);
      
      if (!detectedCountry) {
        // Country not in enabled list - allow manual selection from available countries
        setIsCountryLocked(false);
        setIsDetecting(false);
        toast({
          title: "Country not available",
          description: `${result.countryName} is not currently available. Please select an available country manually.`,
          variant: "default"
        });
        return;
      }

      // Set detected country and lock it permanently (no manual selection allowed)
      setSelectedCountryCode(result.countryCode);
      setIsCountryLocked(true);
      setDetectionMethod(result.method);
      
      // If city was detected, auto-populate it (user can change it later)
      if (result.city) {
        setCityInput(result.city);
        setIsCustomCity(false);
        setShowCitySuggestions(false);
        
        onLocationChange({
          country: result.countryName,
          countryCode: result.countryCode,
          city: result.city,
          zipCode,
          latitude: result.latitude,
          longitude: result.longitude,
          isCustomCity: false
        });
        
        toast({
          title: "Location detected",
          description: `${result.countryName}, ${result.city}. You can change the city if needed.`,
          variant: "default"
        });
      } else {
        // No city detected - leave the list closed; it opens when the user taps the field.
        setShowCitySuggestions(false);
        
        onLocationChange({
          country: result.countryName,
          countryCode: result.countryCode,
          city: '',
          zipCode,
          latitude: result.latitude,
          longitude: result.longitude,
          isCustomCity: false
        });
        
        toast({
          title: "Country detected",
          description: `${result.countryName}. Please select your city.`,
          variant: "default"
        });
      }
    } catch (error) {
      console.error('Auto-detection error:', error);
      // Detection failed - allow manual selection as fallback
      setIsCountryLocked(false);
      toast({
        title: "Location detection failed",
        description: "Please select your country manually. Once selected, it cannot be changed.",
        variant: "default"
      });
    } finally {
      setIsDetecting(false);
    }
  };

  // Initialize selected country
  useEffect(() => {
    if (country) {
      const foundCountry = countries.find(c => c.name === country);
      if (foundCountry) {
        setSelectedCountryCode(foundCountry.code);
      }
    }
  }, [country, countries]);

  // Update suggested cities when country changes OR when searching without a country
  useEffect(() => {
    let isDisposed = false;
    const abortController = new AbortController();

    const loadCities = async () => {
      if (selectedCountryCode) {
        // For US/CA/GB, use live lookup when user is typing to support ALL towns/cities.
        if (isRemoteCitySearchCountry(selectedCountryCode) && cityInput.trim().length >= 2) {
          try {
            const results = await searchCitiesForCountry(selectedCountryCode, cityInput, {
              limit: 10,
              signal: abortController.signal
            });
            if (!isDisposed) setSuggestedCities(results);
          } catch (e) {
            // If lookup fails (offline/rate limited), fall back to bundled major cities.
            if (!isDisposed) {
              const fallback = getCitiesForCountry(selectedCountryCode)
                .filter(c => c.name.toLowerCase().includes(cityInput.toLowerCase()))
                .slice(0, 10);
              setSuggestedCities(fallback);
            }
          }
          return;
        }

        const cities = getCitiesForCountry(selectedCountryCode);
        if (!isDisposed) setSuggestedCities(cities);
        return;
      }

      // No country selected - don't show any city suggestions
      // User MUST select a country first before seeing cities
      if (!isDisposed) setSuggestedCities([]);
    };

    // Debounce the live search a bit to avoid hammering the endpoint.
    const shouldDebounce = selectedCountryCode && isRemoteCitySearchCountry(selectedCountryCode) && cityInput.trim().length >= 2;
    const timer = window.setTimeout(() => {
      void loadCities();
    }, shouldDebounce ? 300 : 0);

    return () => {
      isDisposed = true;
      abortController.abort();
      window.clearTimeout(timer);
    };
  }, [selectedCountryCode, cityInput]);

  // Update coordinates when city changes
  useEffect(() => {
    // For US/CA/GB we use live city search, so bundled coordinate lookup may be incomplete.
    if (selectedCountryCode && cityInput && !isRemoteCitySearchCountry(selectedCountryCode)) {
      const cityData = getCityCoordinates(selectedCountryCode, cityInput);
      if (cityData) {
        setCoordinates({ lat: cityData.latitude, lng: cityData.longitude });
        setIsCustomCity(false);
      } else {
        setCoordinates({});
        setIsCustomCity(true);
      }
    }
  }, [selectedCountryCode, cityInput]);

  const handleCountryChange = (countryCode: string) => {
    const selectedCountry = countries.find(c => c.code === countryCode);
    if (selectedCountry) {
      setSelectedCountryCode(countryCode);
      setCityInput('');
      setIsCustomCity(false);
      setCoordinates({});
      setShowCitySuggestions(false); // Stay closed until the user taps the city field
      
      // Lock country immediately after manual selection (can't be changed)
      if (!isProfileEdit) {
        setIsCountryLocked(true);
        toast({
          title: "Country set",
          description: `Your country has been set to ${selectedCountry.name}. This cannot be changed to prevent fake locations.`,
        });
      }
      
      onLocationChange({
        country: selectedCountry.name,
        countryCode: countryCode,
        city: '',
        zipCode,
        latitude: undefined,
        longitude: undefined,
        isCustomCity: false
      });
    }
  };

  const handleCitySelect = (selectedCity: CityData) => {
    setCityInput(selectedCity.name);
    setShowCitySuggestions(false);
    setIsCustomCity(false);
    setCoordinates({ lat: selectedCity.latitude, lng: selectedCity.longitude });

    // If no country was selected, try to infer it from the city's state field
    let inferredCountry = selectedCountryCode;
    let inferredCountryName = '';
    
    if (!selectedCountryCode && selectedCity.state) {
      // Extract country name from state field (format: "State, Country" when searching all countries)
      const parts = selectedCity.state.split(', ');
      if (parts.length > 1) {
        const countryName = parts[parts.length - 1];
        const country = countries.find(c => c.name === countryName);
        if (country) {
          inferredCountry = country.code;
          inferredCountryName = country.name;
          setSelectedCountryCode(country.code);
        }
      }
    }

    const selectedCountry = countries.find(c => c.code === inferredCountry || c.code === selectedCountryCode);
    onLocationChange({
      country: selectedCountry?.name || inferredCountryName || '',
      countryCode: inferredCountry || selectedCountryCode,
      city: selectedCity.name,
      zipCode,
      latitude: selectedCity.latitude,
      longitude: selectedCity.longitude,
      isCustomCity: false
    });
  };

  const handleCityInputChange = (value: string) => {
    setCityInput(value);
    // Show suggestions when typing (with or without country selected)
    setShowCitySuggestions(value.length >= 2 || selectedCountryCode !== '');

    // Check if it matches a major city
    const cityData = selectedCountryCode && !isRemoteCitySearchCountry(selectedCountryCode)
      ? getCityCoordinates(selectedCountryCode, value)
      : null;
    const selectedCountry = countries.find(c => c.code === selectedCountryCode);
    
    onLocationChange({
      country: selectedCountry?.name || '',
      countryCode: selectedCountryCode,
      city: value,
      zipCode,
      latitude: cityData?.latitude,
      longitude: cityData?.longitude,
      isCustomCity: !cityData
    });
  };

  const handleZipCodeChange = (value: string) => {
    const selectedCountry = countries.find(c => c.code === selectedCountryCode);
    onLocationChange({
      country: selectedCountry?.name || '',
      countryCode: selectedCountryCode,
      city: cityInput,
      zipCode: value,
      latitude: coordinates.lat,
      longitude: coordinates.lng,
      isCustomCity
    });
  };

  const filteredCities = suggestedCities.filter(city =>
    cityInput === '' || city.name.toLowerCase().includes(cityInput.toLowerCase())
  ).slice(0, 10); // Show max 10 suggestions, all cities when input is empty

  const selectedCountryData = getCountryByCode(selectedCountryCode);

  return (
    <div className="space-y-4">
      {/* Upgrade note for free users */}
      {/* Checking location indicator for profile edit */}
      {/* Message when country is unlocked (user is outside their profile country) */}
      {isProfileEdit && outsideCountryStatus.isOutside && outsideCountryStatus.checked && !isCheckingOutsideCountry && (
        <div className="flex items-center justify-between gap-3 p-2 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-sm font-medium text-green-800 dark:text-green-200">
              <CheckCircle2 className="w-4 h-4" />
              Country change available
            </span>
            <span className="text-green-600 dark:text-green-300 text-[11px]">
              You appear to be in {outsideCountryStatus.currentLocation || 'a different country'}.
              {disabled && ' Go to Edit mode to apply the change.'}
            </span>
          </div>
          {/* Only show Change button when in edit mode (not disabled) */}
          {!disabled && (
            <Button
              type="button"
              size="sm"
              onClick={handleAutoChangeCountry}
              disabled={isChangingCountry}
              className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {isChangingCountry ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Change to {outsideCountryStatus.currentLocation}</>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Detecting location indicator for new users */}
      {!isProfileEdit && isDetecting && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span className="text-blue-800 dark:text-blue-200">Detecting your location...</span>
        </div>
      )}

      {/* Country Display/Selection */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Country
          {!isProfileEdit && isCountryLocked && detectionMethod && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Auto-detected {detectionMethod === 'gps' ? '(GPS)' : '(IP)'}
            </span>
          )}
          {!isProfileEdit && isCountryLocked && !detectionMethod && selectedCountryCode && (
            <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
              <Lock className="w-3 h-3" />
              Manually set (locked)
            </span>
          )}
          {isProfileEdit && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Location locked">
              <Lock className="w-3 h-3" />
              <span className="text-[10px]">Auto-detect only</span>
            </span>
          )}
        </Label>
        
        {/* Show read-only display when country is locked */}
        {isCountryLocked && selectedCountryCode ? (
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <span className="font-medium">{country || 'Detecting...'}</span>
              {selectedCountryData?.continent === 'Africa' && (
                <span className="text-xs text-green-600">🌍 Africa</span>
              )}
            </div>
            <Lock className="w-4 h-4 text-muted-foreground" />
          </div>
        ) : !isCountryLocked && !isDetecting ? (
          /* Show manual selection dropdown when detection failed or not locked yet */
          <div className="relative">
            <Select 
              value={selectedCountryCode} 
              onValueChange={handleCountryChange} 
              disabled={loadingCountries}
            >
              <SelectTrigger 
                className={`pl-2.5 pr-2.5 ${errors.country ? 'border-red-500' : ''}`}
              >
                <SelectValue placeholder={loadingCountries ? "Loading countries..." : "Select your country (cannot be changed later)"} />
              </SelectTrigger>
              <SelectContent>
                {countries.map((countryItem) => (
                  <SelectItem key={countryItem.code} value={countryItem.code}>
                    <div className="flex items-center justify-between w-full">
                      <span>{countryItem.name}</span>
                      {countryItem.continent === 'Africa' && (
                        <span className="text-xs text-green-600 ml-2">🌍 Africa</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!selectedCountryCode && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ Once selected, your country cannot be changed to prevent fake locations
              </p>
            )}
          </div>
        ) : (
          /* Show loading state when detecting */
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <span className="font-medium text-muted-foreground">
                Detecting your location...
              </span>
            </div>
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        
        {errors.country && (
          <p className="text-sm text-red-500">{errors.country}</p>
        )}
      </div>

      {/* City + ZIP/Postal layout - both wait for a country to be chosen first, same
          reasoning the city suggestions logic above already uses ("User MUST select a
          country first before seeing cities"): without a country, city.name lookups/
          suggestions/coordinates have nothing to match against, so the field just sat
          there typable but functionally directionless until a country appeared. */}
      {selectedCountryCode && (
      <div className={`grid grid-cols-1 min-[390px]:grid-cols-2 gap-3 sm:gap-4`}>
      {/* City Selection */}
      <div className="space-y-2">
        <Label className="flex h-5 items-center gap-2">
          <Search className="w-4 h-4" />
          City/Town {required && <span className="text-red-500">*</span>}
        </Label>
        
        <div className="relative">
          <Input
            value={cityInput}
            onChange={(e) => !disabled && handleCityInputChange(e.target.value)}
            onFocus={() => !disabled && setShowCitySuggestions(cityInput.length >= 2 || selectedCountryCode !== '')}
            placeholder={selectedCountryData?.name 
              ? `Select a city in ${selectedCountryData.name} or type to search` 
              : 'Type your city name (at least 2 characters)'}
            className={`px-2.5 ${errors.city ? 'border-red-500' : ''}`}
            disabled={disabled}
          />

            {/* City Suggestions Dropdown */}
            {showCitySuggestions && filteredCities.length > 0 && (
              <Card className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto">
                <CardContent className="p-2">
                  <div className="text-xs text-gray-600 mb-2 px-2">
                    {cityInput === '' && selectedCountryData
                      ? `📍 Available cities in ${selectedCountryData.name} (click to select):`
                      : selectedCountryData
                      ? `🔍 Matching cities in ${selectedCountryData.name}:`
                      : `🔍 Matching cities (select one):`
                    }
                  </div>
                  {filteredCities.map((city, index) => (
                    <Button
                      key={index}
                      variant="ghost"
                      className="w-full justify-start text-left h-auto p-2"
                      onClick={() => handleCitySelect(city)}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div>
                          <div className="font-medium">{city.name}</div>
                          {city.state && (
                            <div className="text-xs text-gray-500">{city.state}</div>
                          )}
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            {city.population && (
                              <span>~{(city.population / 1000000).toFixed(1)}M people</span>
                            )}
                            {city.zipCode && (
                              <span className="px-1 py-0.5 bg-blue-100 text-blue-600 rounded text-xs">
                                {city.zipCode}
                              </span>
                            )}
                          </div>
                        </div>
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                    </Button>
                  ))}
                  
                  {cityInput && !filteredCities.some(c => 
                    c.name.toLowerCase() === cityInput.toLowerCase()
                  ) && (
                    <div className="border-t pt-2 mt-2">
                      <div className="text-xs text-orange-600 px-2 mb-1">
                        Don't see your city? You can still continue:
                      </div>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-left h-auto p-2 text-orange-600"
                        onClick={() => setShowCitySuggestions(false)}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          Use "{cityInput}" (custom location)
                        </div>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {errors.city && (
            <p className="text-sm text-red-500">{errors.city}</p>
          )}
        </div>

      {/* ZIP/Postal Code */}
      {selectedCountryCode && (
        <div className="space-y-2">
          <Label className="flex h-5 items-center">
            {selectedCountryData?.code === 'US' ? 'ZIP Code' : 
             selectedCountryData?.code === 'GB' ? 'Postcode' : 
             'Postal Code'}
            {selectedCountryData?.continent === 'Africa' && (
              <span className="text-xs text-gray-500 ml-1">(optional)</span>
            )}
          </Label>
          <Input
            value={zipCode}
            onChange={(e) => !disabled && handleZipCodeChange(e.target.value)}
            placeholder={
              selectedCountryData?.code === 'US' ? '12345' :
              selectedCountryData?.code === 'GB' ? 'SW1A 1AA' :
              selectedCountryData?.code === 'NG' ? '101001' :
              selectedCountryData?.code === 'GH' ? 'GA-123-4567' :
              selectedCountryData?.code === 'DE' ? '10115' :
              selectedCountryData?.code === 'FR' ? '75001' :
              selectedCountryData?.code === 'ES' ? '28001' :
              selectedCountryData?.code === 'IT' ? '00118' :
              selectedCountryData?.code === 'NL' ? '1012' :
              'Enter postal code'
            }
            className={`px-2.5 ${errors.zipCode ? 'border-red-500' : ''}`}
            disabled={disabled}
          />
          {errors.zipCode && (
            <p className="text-sm text-red-500">{errors.zipCode}</p>
          )}
        </div>
      )}
      </div>
      )}

      {/* City status shown below the row to keep City/ZIP aligned */}
      {selectedCountryCode && cityInput && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {coordinates.lat && coordinates.lng ? (
            <span className="text-green-600 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Exact location found
            </span>
          ) : isCustomCity ? (
            <span className="text-orange-600 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              Custom location (may affect matching accuracy)
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default LocationInput;
