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
  isPremium = false
}: LocationInputProps) => {
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
  useEffect(() => {
    if (isProfileEdit && profileCountryCode && countries.length > 0 && !outsideCountryStatus.checked) {
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
      setShowCitySuggestions(true);
      
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

  // Auto-detect country on mount if enabled (only for new users, not profile edit)
  useEffect(() => {
    if (autoDetect && !country && countries.length > 0 && !isProfileEdit) {
      handleAutoDetect();
    }
  }, [autoDetect, countries, isProfileEdit]);

  // Auto-detect country function
  const handleAutoDetect = async () => {
    setIsDetecting(true);
    
    try {
      const result = await autoDetectCountry();
      
      if (result.method === 'failed') {
        // Silently fail and let user select manually
        setIsDetecting(false);
        return;
      }

      // Check if detected country is in enabled countries
      const detectedCountry = countries.find(c => c.code === result.countryCode);
      
      if (!detectedCountry) {
        // Silently fail and let user select manually
        setIsDetecting(false);
        return;
      }

      // Set detected country and lock it
      setSelectedCountryCode(result.countryCode);
      setIsCountryLocked(true);
      setDetectionMethod(result.method);
      setShowCitySuggestions(true);
      
      onLocationChange({
        country: result.countryName,
        countryCode: result.countryCode,
        city: '',
        zipCode,
        latitude: result.latitude,
        longitude: result.longitude,
        isCustomCity: false
      });
    } catch (error) {
      console.error('Auto-detection error:', error);
      // Silently fail and let user select manually
    } finally {
      setIsDetecting(false);
    }
  };

  // Unlock country to allow manual selection
  const handleUnlockCountry = () => {
    setIsCountryLocked(false);
    setDetectionMethod(null);
    setSelectedCountryCode('');
    setCityInput('');
    setIsCustomCity(false);
    setCoordinates({});
    
    onLocationChange({
      country: '',
      countryCode: '',
      city: '',
      zipCode,
      latitude: undefined,
      longitude: undefined,
      isCustomCity: false
    });
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
    if (selectedCountryCode) {
      const cities = getCitiesForCountry(selectedCountryCode);
      setSuggestedCities(cities);
    } else if (cityInput.length >= 2) {
      // If no country is selected but user is typing, search across all countries
      const allCities: CityData[] = [];
      const countryCodes = getCountriesList();
      
      // Collect cities from all countries that match the search
      countryCodes.forEach(country => {
        const cities = getCitiesForCountry(country.code);
        cities.forEach(city => {
          if (city.name.toLowerCase().includes(cityInput.toLowerCase())) {
            allCities.push({
              ...city,
              state: `${city.state ? city.state + ', ' : ''}${country.name}` // Add country name to state for context
            });
          }
        });
      });
      
      setSuggestedCities(allCities);
    } else {
      setSuggestedCities([]);
    }
  }, [selectedCountryCode, cityInput]);

  // Update coordinates when city changes
  useEffect(() => {
    if (selectedCountryCode && cityInput) {
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
      setShowCitySuggestions(true); // Show suggestions immediately when country is selected
      
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
    const cityData = selectedCountryCode ? getCityCoordinates(selectedCountryCode, value) : null;
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

  // Determine if country should be locked based on profile edit mode
  const shouldLockCountry = isProfileEdit && isCountryLocked && !outsideCountryStatus.isOutside;

  return (
    <div className="space-y-4">
      {/* Upgrade note for free users */}
      {isProfileEdit && !isPremium && (
        <div className="p-3 bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-lg border border-primary/20">
          <div className="flex items-center gap-2 text-sm text-primary font-medium">
            <Globe className="w-4 h-4" />
            Want to match with people in other countries?
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Upgrade to Premium to unlock up to 3 additional countries and expand your dating pool globally.
          </p>
        </div>
      )}

      {/* Checking location indicator for profile edit */}
      {isProfileEdit && isCheckingOutsideCountry && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm text-blue-700 dark:text-blue-300">
          <Loader2 className="w-4 h-4 animate-spin" />
          Verifying your current location...
        </div>
      )}

      {/* Message when country is locked (user is in their profile country) */}
      {isProfileEdit && shouldLockCountry && outsideCountryStatus.checked && !isCheckingOutsideCountry && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200 font-medium">
            <Lock className="w-4 h-4" />
            Country is locked
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
            You can only change your country when you're physically outside of {country || 'your current country'}. 
            Travel abroad and your country setting will unlock automatically.
          </p>
        </div>
      )}

      {/* Message when country is unlocked (user is outside their profile country) - with Change button */}
      {isProfileEdit && outsideCountryStatus.isOutside && outsideCountryStatus.checked && !isCheckingOutsideCountry && (
        <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-200 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Country change available
              </div>
              <p className="text-xs text-green-600 dark:text-green-300 mt-1">
                You appear to be in {outsideCountryStatus.currentLocation || 'a different country'}. 
                Click the button to update your location.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleAutoChangeCountry}
              disabled={isChangingCountry}
              className="ml-3 bg-green-600 hover:bg-green-700 text-white shrink-0"
            >
              {isChangingCountry ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Change to {outsideCountryStatus.currentLocation}</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Auto-detect Button - only show for new users, not profile edit */}
      {autoDetect && !isProfileEdit && !isCountryLocked && !selectedCountryCode && (
        <Button
          type="button"
          onClick={handleAutoDetect}
          disabled={isDetecting || loadingCountries}
          className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
        >
          {isDetecting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Detecting your location...
            </>
          ) : (
            <>
              <MapPin className="w-4 h-4 mr-2" />
              Auto-detect your country
            </>
          )}
        </Button>
      )}

      {/* Country Selection */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Country
          {!isProfileEdit && isCountryLocked && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Auto-detected {detectionMethod === 'gps' ? '(GPS)' : '(IP)'}
            </span>
          )}
          {isProfileEdit && (
            <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
              <Lock className="w-3 h-3" />
              {shouldLockCountry ? 'Locked (in-country)' : 'Change via button above'}
            </span>
          )}
        </Label>
        <div className="relative">
          <Select 
            value={selectedCountryCode} 
            onValueChange={handleCountryChange} 
            disabled={loadingCountries || isProfileEdit || isCheckingOutsideCountry}
          >
            <SelectTrigger 
              className={`${errors.country ? 'border-red-500' : ''} ${
                isProfileEdit ? 'bg-muted border-muted-foreground/20 cursor-not-allowed opacity-70' : ''
              } ${
                !isProfileEdit && isCountryLocked ? 'bg-green-50 border-green-300 cursor-not-allowed opacity-70 pr-20' : ''
              }`}
            >
              <SelectValue placeholder={loadingCountries ? "Loading countries..." : isCheckingOutsideCountry ? "Checking location..." : "Select your country"} />
            </SelectTrigger>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  <div className="flex items-center justify-between w-full">
                    <span>{country.name}</span>
                    {country.continent === 'Africa' && (
                      <span className="text-xs text-green-600 ml-2">🌍 Africa</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Lock icon and unlock button only for auto-detect mode, not profile edit */}
          {!isProfileEdit && isCountryLocked && (
            <>
              <div className="absolute right-10 top-1/2 -translate-y-1/2">
                <Lock className="w-4 h-4 text-green-600" />
              </div>
              <button
                type="button"
                onClick={handleUnlockCountry}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-red-100 rounded-full transition-colors group"
                title="Wrong location? Click to select manually"
              >
                <X className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
              </button>
            </>
          )}
        </div>
        {errors.country && (
          <p className="text-sm text-red-500">{errors.country}</p>
        )}
      </div>

      {/* City Selection */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Search className="w-4 h-4" />
          City/Town {required && <span className="text-red-500">*</span>}
        </Label>
        
        <div className="relative">
          <Input
            value={cityInput}
            onChange={(e) => handleCityInputChange(e.target.value)}
            onFocus={() => setShowCitySuggestions(cityInput.length >= 2 || selectedCountryCode !== '')}
            placeholder={selectedCountryData?.name 
              ? `Select a city in ${selectedCountryData.name} or type to search` 
              : 'Type your city name (at least 2 characters)'}
            className={errors.city ? 'border-red-500' : ''}
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

          {/* City Status Indicator */}
          {cityInput && (
            <div className="flex items-center gap-2 text-xs">
              {coordinates.lat && coordinates.lng ? (
                <span className="text-green-600 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Exact location found
                </span>
              ) : (
                <span className="text-orange-600 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Custom location (may affect matching accuracy)
                </span>
              )}
            </div>
          )}

          {errors.city && (
            <p className="text-sm text-red-500">{errors.city}</p>
          )}
        </div>

      {/* ZIP/Postal Code */}
      {selectedCountryCode && (
        <div className="space-y-2">
          <Label>
            {selectedCountryData?.code === 'US' ? 'ZIP Code' : 
             selectedCountryData?.code === 'GB' ? 'Postcode' : 
             'Postal Code'}
            {selectedCountryData?.continent === 'Africa' && (
              <span className="text-xs text-gray-500 ml-1">(optional)</span>
            )}
          </Label>
          <Input
            value={zipCode}
            onChange={(e) => handleZipCodeChange(e.target.value)}
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
            className={errors.zipCode ? 'border-red-500' : ''}
          />
          {errors.zipCode && (
            <p className="text-sm text-red-500">{errors.zipCode}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default LocationInput;
