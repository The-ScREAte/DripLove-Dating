import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Search, Check, Loader2, MapPinned } from 'lucide-react';
import { 
  getCountriesList, 
  getCitiesForCountry, 
  getCityCoordinates, 
  getCountryByCode,
  type CityData 
} from '@/constants/locationData';
import { getEnabledCountries } from '@/utils/enabledCountries';
import { detectUserLocation } from '@/utils/locationDetection';
import { useToast } from '@/hooks/use-toast';

interface LocationInputProps {
  country: string;
  city: string;
  zipCode: string;
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
  autoDetect?: boolean; // New prop to enable auto-detection
}

const LocationInput = ({
  country,
  city,
  zipCode,
  onLocationChange,
  errors = {},
  required = false,
  autoDetect = true // Enable by default
}: LocationInputProps) => {
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>('');
  const [cityInput, setCityInput] = useState<string>(city);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [isCustomCity, setIsCustomCity] = useState(false);
  const [suggestedCities, setSuggestedCities] = useState<CityData[]>([]);
  const [coordinates, setCoordinates] = useState<{lat?: number, lng?: number}>({});
  const [countries, setCountries] = useState<any[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locationDetected, setLocationDetected] = useState(false);
  const { toast } = useToast();

  // Auto-detect location on mount
  useEffect(() => {
    if (autoDetect && !country && !locationDetected) {
      handleDetectLocation();
    }
  }, [autoDetect, country, locationDetected]);

  // Detect user's actual location
  const handleDetectLocation = async () => {
    setDetectingLocation(true);
    
    try {
      const detectedLocation = await detectUserLocation();
      
      if (detectedLocation) {
        const { country: detectedCountry, countryCode, city: detectedCity, latitude, longitude } = detectedLocation;
        
        // Find if detected country is in our enabled list
        const enabledCountries = await getEnabledCountries();
        const matchedCountry = enabledCountries.find(
          c => c.code.toUpperCase() === countryCode.toUpperCase()
        );
        
        if (matchedCountry) {
          setSelectedCountryCode(matchedCountry.code);
          setCityInput(detectedCity);
          setCoordinates({ lat: latitude, lng: longitude });
          setLocationDetected(true);
          
          onLocationChange({
            country: matchedCountry.name,
            countryCode: matchedCountry.code,
            city: detectedCity,
            zipCode,
            latitude,
            longitude,
            isCustomCity: true
          });
          
          toast({
            title: 'Location Detected',
            description: `Set to ${detectedCity}, ${matchedCountry.name}`,
          });
        } else {
          toast({
            title: 'Country Not Available',
            description: `${detectedCountry} is not yet available in our service. Please select manually.`,
            variant: 'destructive'
          });
        }
      } else {
        toast({
          title: 'Location Detection Failed',
          description: 'Please select your location manually',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Location detection error:', error);
      toast({
        title: 'Location Detection Error',
        description: 'Please select your location manually',
        variant: 'destructive'
      });
    } finally {
      setDetectingLocation(false);
    }
  };

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

  // Initialize selected country
  useEffect(() => {
    if (country) {
      const foundCountry = countries.find(c => c.name === country);
      if (foundCountry) {
        setSelectedCountryCode(foundCountry.code);
      }
    }
  }, [country, countries]);

  // Update suggested cities when country changes
  useEffect(() => {
    if (selectedCountryCode) {
      const cities = getCitiesForCountry(selectedCountryCode);
      setSuggestedCities(cities);
    } else {
      setSuggestedCities([]);
    }
  }, [selectedCountryCode]);

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

    const selectedCountry = countries.find(c => c.code === selectedCountryCode);
    onLocationChange({
      country: selectedCountry?.name || '',
      countryCode: selectedCountryCode,
      city: selectedCity.name,
      zipCode,
      latitude: selectedCity.latitude,
      longitude: selectedCity.longitude,
      isCustomCity: false
    });
  };

  const handleCityInputChange = (value: string) => {
    setCityInput(value);
    // Always show suggestions when there's a selected country, regardless of input
    setShowCitySuggestions(selectedCountryCode !== '');

    // Check if it matches a major city
    const cityData = getCityCoordinates(selectedCountryCode, value);
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
      {/* Auto Location Detection Button */}
      {!locationDetected && (
        <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="font-medium text-sm text-blue-900 mb-1">
                Auto-detect your location
              </div>
              <div className="text-xs text-blue-600">
                We'll use your device location for accurate matching
              </div>
            </div>
            <Button
              onClick={handleDetectLocation}
              disabled={detectingLocation}
              className="bg-blue-600 hover:bg-blue-700"
              size="sm"
            >
              {detectingLocation ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Detecting...
                </>
              ) : (
                <>
                  <MapPinned className="w-4 h-4 mr-2" />
                  Detect Location
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {locationDetected && (
        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2 text-green-800">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">Location detected and verified</span>
          </div>
        </div>
      )}

      {/* Country Selection */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Country {required && <span className="text-red-500">*</span>}
        </Label>
        <Select value={selectedCountryCode} onValueChange={handleCountryChange} disabled={loadingCountries || detectingLocation}>
          <SelectTrigger className={errors.country ? 'border-red-500' : ''}>
            <SelectValue placeholder={loadingCountries ? "Loading countries..." : "Select your country"} />
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
        {errors.country && (
          <p className="text-sm text-red-500">{errors.country}</p>
        )}
      </div>

      {/* City Selection */}
      {selectedCountryCode && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            City/Town {required && <span className="text-red-500">*</span>}
          </Label>
          
          <div className="relative">
            <Input
              value={cityInput}
              onChange={(e) => handleCityInputChange(e.target.value)}
              onFocus={() => setShowCitySuggestions(selectedCountryCode !== '')}
              placeholder={`${selectedCountryData?.name ? `Select a city in ${selectedCountryData.name} or type to search` : 'Select a country first'}`}
              className={errors.city ? 'border-red-500' : ''}
            />

            {/* City Suggestions Dropdown */}
            {showCitySuggestions && filteredCities.length > 0 && (
              <Card className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto">
                <CardContent className="p-2">
                  <div className="text-xs text-gray-600 mb-2 px-2">
                    {cityInput === '' 
                      ? `📍 Available cities in ${selectedCountryData?.name} (click to select):`
                      : `🔍 Matching cities in ${selectedCountryData?.name}:`
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
      )}

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

      {/* Location Summary */}
      {selectedCountryCode && cityInput && (
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="text-sm font-medium text-blue-800 mb-1">Your Location</div>
          <div className="text-sm text-blue-600">
            📍 {cityInput}, {selectedCountryData?.name}
            {coordinates.lat && coordinates.lng && (
              <div className="text-xs text-blue-500 mt-1">
                Coordinates: {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationInput;
