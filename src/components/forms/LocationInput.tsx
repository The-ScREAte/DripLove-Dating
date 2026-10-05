import React, { useState, useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Search, Check, Loader2, CheckCircle2, Lock, X, Globe, LocateFixed, Navigation } from 'lucide-react';
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
import { getCurrentLocation, describeLocationError, CurrentLocationFailure } from '@/utils/currentLocation';
import { formLabel, formRequired, formError, formInput, formSelectTrigger, formSelectContent } from '@/components/forms/formTheme';

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
  // 'dark' renders for the solid-dark Sign Up / Complete Profile pages; the
  // default 'light' keeps the original look used by the profile editor.
  tone?: 'light' | 'dark';
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
  disabled = false,
  tone = 'light'
}: LocationInputProps) => {
  const isDark = tone === 'dark';
  const ui = isDark
    ? {
        label: `${formLabel} flex items-center gap-2`,
        field: (hasError?: boolean) => formInput(hasError),
        trigger: (hasError?: boolean) => formSelectTrigger(hasError),
        selectContent: formSelectContent,
        readOnlyBox: 'flex h-12 items-center justify-between rounded-xl border border-white/15 bg-white/[0.06] px-3.5 text-[15px] text-white',
        muted: 'text-white/55',
        error: formError,
        suggestions: 'absolute top-full left-0 right-0 z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#17171D] text-white shadow-xl',
        suggestionItem: 'w-full justify-start text-left h-auto p-2.5 rounded-lg text-white hover:bg-white/10 hover:text-white',
        detecting: 'flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs',
        detectingText: 'text-white/75',
        warn: 'text-xs text-amber-300/90 mt-1.5',
        prompt: 'absolute top-full left-0 right-0 z-50 mt-1.5 rounded-2xl border border-white/10 bg-[#17171D] p-4 text-white shadow-xl',
        promptMuted: 'text-white/60',
        promptPrimary: 'h-11 w-full rounded-full bg-gradient-to-r from-[#9d0d52] to-[#e0187a] text-[14px] font-semibold text-white hover:opacity-95',
        promptSecondary: 'h-11 w-full rounded-full border border-white/20 bg-transparent text-[14px] font-medium text-white hover:bg-white/[0.06] hover:text-white',
        link: 'text-pink-400 hover:text-pink-300',
        success: 'text-emerald-400',
      }
    : {
        label: 'flex items-center gap-2',
        field: (hasError?: boolean) => `px-2.5 bg-white text-black placeholder:text-black border-black ${hasError ? 'border-red-500' : ''}`,
        trigger: (hasError?: boolean) => `pl-2.5 pr-2.5 bg-white text-black border-black ${hasError ? 'border-red-500' : ''}`,
        selectContent: 'bg-white text-black',
        readOnlyBox: 'flex items-center justify-between py-1.5 px-3 bg-white text-black rounded-lg border border-gray-200',
        muted: 'text-black',
        error: 'text-sm text-red-500',
        suggestions: 'absolute top-full left-0 right-0 z-50 mt-1.5 max-h-64 overflow-y-auto bg-white text-black border border-gray-200 shadow-lg rounded-xl',
        suggestionItem: 'w-full justify-start text-left h-auto p-2.5 rounded-lg hover:bg-pink-50',
        detecting: 'flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 text-xs',
        detectingText: 'text-blue-800 dark:text-blue-200',
        warn: 'text-xs text-amber-600 mt-1',
        prompt: 'absolute top-full left-0 right-0 z-50 mt-1.5 rounded-2xl border border-gray-200 bg-white p-4 text-black shadow-lg',
        promptMuted: 'text-gray-600',
        promptPrimary: 'h-11 w-full rounded-full bg-gradient-to-r from-[#9d0d52] to-[#e0187a] text-[14px] font-semibold text-white hover:opacity-95',
        promptSecondary: 'h-11 w-full rounded-full border border-gray-300 bg-white text-[14px] font-medium text-black hover:bg-gray-50',
        link: 'text-pink-600 hover:text-pink-700',
        success: 'text-green-600',
      };
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

  // "Use my current location" - offered as a small pop-up the first time the
  // city field is tapped, and as a link next to the City label after that.
  const [locationPrompt, setLocationPrompt] = useState<'closed' | 'open' | 'locating'>('closed');
  const [locationPromptAnswered, setLocationPromptAnswered] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  // Exact device coordinates while the city came from "current location".
  // Those coordinates (not the city centre) are what distances to other
  // people are measured from. Cleared as soon as the user picks or types a
  // different city themselves.
  const gpsCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  // Set when GPS found the user but couldn't name the city: they type the
  // name themselves and the exact coordinates are kept.
  const gpsNeedsCityNameRef = useRef(false);
  const [isUsingGps, setIsUsingGps] = useState(false);
  const cityFieldRef = useRef<HTMLDivElement>(null);
  const cityInputElRef = useRef<HTMLInputElement>(null);
  // Latest values for async callbacks (blur geocoding) that resolve later.
  const latestRef = useRef({ cityInput: city, hasCoords: false });

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
    // GPS coordinates are more precise than any city-centre lookup - keep them.
    if (gpsCoordsRef.current) return;
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
    gpsCoordsRef.current = null;
    gpsNeedsCityNameRef.current = false;
    setIsUsingGps(false);
    setLocationError(null);
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
    // Typing means the user is choosing their own city - drop the GPS fix and
    // the pop-up. (Unless GPS located them but couldn't name the place: then
    // they're just naming it, and the exact coordinates stay.)
    const keepGps = gpsNeedsCityNameRef.current ? gpsCoordsRef.current : null;
    if (!keepGps) {
      gpsCoordsRef.current = null;
      setIsUsingGps(false);
    }
    setLocationError(null);
    if (locationPrompt === 'open') {
      setLocationPrompt('closed');
      setLocationPromptAnswered(true);
    }
    setCityInput(value);
    // Show suggestions when typing (with or without country selected)
    setShowCitySuggestions(value.length >= 2 || selectedCountryCode !== '');

    // Check if it matches a major city
    const cityData = selectedCountryCode && !isRemoteCitySearchCountry(selectedCountryCode)
      ? getCityCoordinates(selectedCountryCode, value)
      : null;
    const selectedCountry = countries.find(c => c.code === selectedCountryCode);

    // Keep local coordinates in step with what's sent up - previously a typed
    // city kept the last picked city's coordinates here (US/CA/GB), so a later
    // postcode edit re-sent the wrong place.
    setCoordinates(keepGps ? { lat: keepGps.lat, lng: keepGps.lng } : cityData ? { lat: cityData.latitude, lng: cityData.longitude } : {});
    setIsCustomCity(!keepGps && !cityData);
    
    onLocationChange({
      country: selectedCountry?.name || '',
      countryCode: selectedCountryCode,
      city: value,
      zipCode,
      latitude: keepGps ? keepGps.lat : cityData?.latitude,
      longitude: keepGps ? keepGps.lng : cityData?.longitude,
      isCustomCity: keepGps ? false : !cityData
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

  const handleUseCurrentLocation = async () => {
    if (disabled) return;
    setLocationPromptAnswered(true);
    setShowCitySuggestions(false);
    setLocationError(null);
    setLocationPrompt('locating');
    try {
      const here = await getCurrentLocation();
      const detectedCode = here.countryCode || '';
      const detectedCountry = detectedCode ? countries.find(c => c.code === detectedCode) : undefined;
      let countryCode = selectedCountryCode;
      let countryName = countries.find(c => c.code === selectedCountryCode)?.name || country || '';

      if (detectedCode && detectedCode !== selectedCountryCode) {
        if (!detectedCountry) {
          setLocationError(`DripLove isn't available in ${here.countryName || 'your current country'} yet. Please choose your city below.`);
          setLocationPrompt('open');
          return;
        }
        // GPS is the most trustworthy signal we have: it corrects a wrong
        // country (an IP-based guess at sign-up, someone on a VPN, or a
        // profile whose owner has since moved). The country stays locked
        // afterwards - only a real device location can change it this way.
        countryCode = detectedCountry.code;
        countryName = detectedCountry.name;
        setSelectedCountryCode(countryCode);
        setIsCountryLocked(true);
        setDetectionMethod('gps');
        if (isProfileEdit) {
          // Same end state as the "You're in X - Change" button above.
          setOutsideCountryStatus({ checked: true, isOutside: false, currentLocation: countryName, currentCountryCode: countryCode });
          toast({ title: 'Country updated', description: `Your country is now ${countryName}, based on your current location.` });
        }
      } else if (!countryCode && detectedCountry) {
        countryCode = detectedCountry.code;
        countryName = detectedCountry.name;
        setSelectedCountryCode(countryCode);
        setIsCountryLocked(true);
        setDetectionMethod('gps');
      }

      gpsCoordsRef.current = { lat: here.latitude, lng: here.longitude };
      gpsNeedsCityNameRef.current = !here.city;
      setIsUsingGps(true);
      setCoordinates({ lat: here.latitude, lng: here.longitude });
      setIsCustomCity(false);
      const cityName = here.city || '';
      setCityInput(cityName);
      onLocationChange({
        country: countryName,
        countryCode,
        city: cityName,
        zipCode,
        latitude: here.latitude,
        longitude: here.longitude,
        isCustomCity: false
      });
      setLocationPrompt('closed');
      if (!cityName) {
        // Exact coordinates are saved; we just couldn't name the place.
        setLocationError("We found your location but couldn't name the city - please type it in.");
        cityInputElRef.current?.focus();
      }
    } catch (error) {
      const reason = error instanceof CurrentLocationFailure ? error.reason : 'unavailable';
      setLocationError(describeLocationError(reason));
      setLocationPrompt('open');
    }
  };

  const handleChooseCityMyself = () => {
    setLocationPrompt('closed');
    setLocationPromptAnswered(true);
    setLocationError(null);
    cityInputElRef.current?.focus();
    setShowCitySuggestions(selectedCountryCode !== '');
  };

  const handleCityFocus = () => {
    if (disabled) return;
    if (!locationPromptAnswered && !isUsingGps && locationPrompt === 'closed') {
      setLocationPrompt('open');
      setShowCitySuggestions(false);
      return;
    }
    if (locationPrompt === 'closed') {
      setShowCitySuggestions(cityInput.length >= 2 || selectedCountryCode !== '');
    }
  };

  // A typed city that isn't in our suggestion list has no coordinates, which
  // left that person with no real distance to anyone. When the field loses
  // focus, look the typed name up once and attach its coordinates.
  const handleCityBlur = async () => {
    const typed = cityInput.trim();
    if (disabled || gpsCoordsRef.current || typed.length < 2 || !selectedCountryCode || latestRef.current.hasCoords) return;
    try {
      const matches = await searchCitiesForCountry(selectedCountryCode, typed, { limit: 5 });
      const best = matches.find(m => m.name.toLowerCase() === typed.toLowerCase()) || matches[0];
      // Ignore if the user has since picked/typed something else.
      if (!best || latestRef.current.cityInput.trim() !== typed || latestRef.current.hasCoords || gpsCoordsRef.current) return;
      setCoordinates({ lat: best.latitude, lng: best.longitude });
      setIsCustomCity(false);
      const selectedCountry = countries.find(c => c.code === selectedCountryCode);
      onLocationChange({
        country: selectedCountry?.name || '',
        countryCode: selectedCountryCode,
        city: cityInput,
        zipCode,
        latitude: best.latitude,
        longitude: best.longitude,
        isCustomCity: false
      });
    } catch {
      // Offline / rate-limited: the save step still falls back to the
      // country's capital, as before.
    }
  };

  // Close the pop-up when tapping anywhere outside the city field.
  useEffect(() => {
    if (locationPrompt !== 'open') return;
    const onPointerDown = (e: PointerEvent) => {
      if (cityFieldRef.current && !cityFieldRef.current.contains(e.target as Node)) {
        setLocationPrompt('closed');
        setLocationPromptAnswered(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [locationPrompt]);

  latestRef.current = { cityInput, hasCoords: coordinates.lat != null && coordinates.lng != null };

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
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-800 dark:text-green-200">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            You're in {outsideCountryStatus.currentLocation || 'a different country'}
          </span>
          {/* Only show Change button when in edit mode (not disabled) */}
          {!disabled && (
            <Button
              type="button"
              size="sm"
              onClick={handleAutoChangeCountry}
              disabled={isChangingCountry}
              className="h-7 min-h-0 text-xs px-1.5 py-0 bg-green-600 hover:bg-green-700 text-white shrink-0"
            >
              {isChangingCountry ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Change'}
            </Button>
          )}
        </div>
      )}

      {/* Detecting location indicator for new users */}
      {!isProfileEdit && isDetecting && (
        <div className={ui.detecting}>
          <Loader2 className={`w-4 h-4 animate-spin ${isDark ? 'text-pink-400' : 'text-blue-600'}`} />
          <span className={ui.detectingText}>Detecting your location...</span>
        </div>
      )}

      {/* Country Display/Selection */}
      <div className="space-y-2">
        <Label className={ui.label}>
          <MapPin className="w-4 h-4" />
          Country
          {!isProfileEdit && isCountryLocked && detectionMethod && (
            <span className={`flex items-center gap-1 text-xs font-medium ${isDark ? 'text-emerald-400' : 'text-green-600'}`}>
              <CheckCircle2 className="w-3 h-3" />
              Auto-detected {detectionMethod === 'gps' ? '(GPS)' : '(IP)'}
            </span>
          )}
          {!isProfileEdit && isCountryLocked && !detectionMethod && selectedCountryCode && (
            <span className={`flex items-center gap-1 text-xs font-medium ${isDark ? 'text-amber-300' : 'text-amber-600'}`}>
              <Lock className="w-3 h-3" />
              Manually set (locked)
            </span>
          )}
          {isProfileEdit && (
            <span className="flex items-center gap-1 text-xs text-black" aria-label="Location locked">
              <Lock className="w-3 h-3" />
              <span className="text-[10px]">Auto-detect only</span>
            </span>
          )}
        </Label>
        
        {/* Show read-only display when country is locked */}
        {isCountryLocked && selectedCountryCode ? (
          <div className={ui.readOnlyBox}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{country || 'Detecting...'}</span>
              {selectedCountryData?.continent === 'Africa' && (
                <span className={`text-xs ${isDark ? 'text-emerald-400' : 'text-green-600'}`}>🌍 Africa</span>
              )}
            </div>
            <Lock className={`w-4 h-4 ${isDark ? 'text-white/45' : 'text-muted-foreground'}`} />
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
                className={ui.trigger(!!errors.country)}
              >
                <SelectValue placeholder={loadingCountries ? "Loading..." : isDark ? "Select" : "Select your country (cannot be changed later)"} />
              </SelectTrigger>
              <SelectContent className={ui.selectContent}>
                {countries.map((countryItem) => (
                  <SelectItem key={countryItem.code} value={countryItem.code}>
                    <div className="flex items-center justify-between w-full">
                      <span>{countryItem.name}</span>
                      {countryItem.continent === 'Africa' && (
                        <span className={`text-xs ml-2 ${isDark ? 'text-emerald-400' : 'text-green-600'}`}>🌍 Africa</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!selectedCountryCode && (
              <p className={ui.warn}>
                ⚠️ Once selected, your country cannot be changed to prevent fake locations
              </p>
            )}
          </div>
        ) : (
          /* Show loading state when detecting */
          <div className={ui.readOnlyBox}>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                Detecting your location...
              </span>
            </div>
            <Loader2 className={`w-4 h-4 animate-spin ${isDark ? 'text-white/45' : 'text-muted-foreground'}`} />
          </div>
        )}
        
        {errors.country && (
          <p className={ui.error}>{errors.country}</p>
        )}
      </div>

      {/* City + ZIP/Postal layout - both wait for a country to be chosen first, same
          reasoning the city suggestions logic above already uses ("User MUST select a
          country first before seeing cities"): without a country, city.name lookups/
          suggestions/coordinates have nothing to match against, so the field just sat
          there typable but functionally directionless until a country appeared. */}
      {selectedCountryCode && (
      <div className={`grid grid-cols-1 ${isDark ? 'sm:grid-cols-2 gap-4' : 'min-[390px]:grid-cols-2 gap-3 sm:gap-4'}`}>
      {/* City Selection */}
      <div className="space-y-2">
        <div className="flex h-5 items-center justify-between gap-2">
          <Label className={`${ui.label} h-5`}>
            <Search className="w-4 h-4" />
            City/Town {required && <span className={isDark ? formRequired : 'text-red-500'}>*</span>}
          </Label>
          {!disabled && locationPromptAnswered && locationPrompt === 'closed' && (
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className={`flex items-center gap-1 text-xs font-medium ${ui.link}`}
            >
              <LocateFixed className="h-3.5 w-3.5" />
              Use current location
            </button>
          )}
        </div>
        
        <div className="relative" ref={cityFieldRef}>
          <Input
            ref={cityInputElRef}
            value={cityInput}
            onChange={(e) => !disabled && handleCityInputChange(e.target.value)}
            onFocus={handleCityFocus}
            onBlur={() => { void handleCityBlur(); }}
            placeholder={isDark
              ? 'City'
              : selectedCountryData?.name
                ? `Select a city in ${selectedCountryData.name} or type to search`
                : 'Type your city name (at least 2 characters)'}
            autoComplete="address-level2"
            className={ui.field(!!errors.city)}
            disabled={disabled}
          />

            {/* "Use my current location?" pop-up */}
            {locationPrompt !== 'closed' && (
              <div className={`${ui.prompt} dl-fade-in`} role="dialog" aria-label="Set your location">
                {locationPrompt === 'locating' ? (
                  <div className="flex items-center gap-3 py-2">
                    <Loader2 className="h-5 w-5 animate-spin text-pink-500" />
                    <div>
                      <p className="text-sm font-semibold">Finding your location…</p>
                      <p className={`text-xs ${ui.promptMuted}`}>If your phone asks, tap Allow.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-500/15">
                        <Navigation className="h-4 w-4 text-pink-500" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">Use your current location?</p>
                        <p className={`mt-0.5 text-xs leading-relaxed ${ui.promptMuted}`}>
                          We'll fill in your city and show accurate distances to people near you.
                        </p>
                      </div>
                    </div>
                    {locationError && (
                      <p className={`mb-3 text-xs leading-relaxed ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{locationError}</p>
                    )}
                    <div className="space-y-2">
                      <Button type="button" onClick={handleUseCurrentLocation} className={ui.promptPrimary}>
                        <LocateFixed className="h-4 w-4" />
                        Use my current location
                      </Button>
                      <Button type="button" variant="outline" onClick={handleChooseCityMyself} className={ui.promptSecondary}>
                        I'll choose my city
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* City Suggestions Dropdown */}
            {locationPrompt === 'closed' && showCitySuggestions && filteredCities.length > 0 && (
              <Card className={ui.suggestions}>
                <CardContent className="p-2">
                  <div className={`text-xs mb-2 px-2 ${ui.muted}`}>
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
                      type="button"
                      variant="ghost"
                      className={ui.suggestionItem}
                      onClick={() => handleCitySelect(city)}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div>
                          <div className="font-medium">{city.name}</div>
                          {city.state && (
                            <div className={`text-xs ${ui.muted}`}>{city.state}</div>
                          )}
                          <div className={`flex items-center gap-2 text-xs ${ui.muted}`}>
                            {city.population && (
                              <span>~{(city.population / 1000000).toFixed(1)}M people</span>
                            )}
                            {city.zipCode && (
                              <span className={`px-1 py-0.5 rounded text-xs ${isDark ? 'bg-white/10 text-white/80' : 'bg-blue-100 text-blue-600'}`}>
                                {city.zipCode}
                              </span>
                            )}
                          </div>
                        </div>
                        <Check className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-green-600'}`} />
                      </div>
                    </Button>
                  ))}
                  
                  {cityInput && !filteredCities.some(c => 
                    c.name.toLowerCase() === cityInput.toLowerCase()
                  ) && (
                    <div className={`border-t pt-2 mt-2 ${isDark ? 'border-white/10' : ''}`}>
                      <div className={`text-xs px-2 mb-1 ${isDark ? 'text-amber-300/90' : 'text-orange-600'}`}>
                        Don't see your city? You can still continue:
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className={`w-full justify-start text-left h-auto p-2 ${isDark ? 'text-amber-300 hover:bg-white/10 hover:text-amber-200' : 'text-orange-600'}`}
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
            <p className={ui.error}>{errors.city}</p>
          )}
        </div>

      {/* ZIP/Postal Code */}
      {selectedCountryCode && (
        <div className="space-y-2">
          <Label className={isDark ? `${formLabel} flex h-5 items-center` : 'flex h-5 items-center'}>
            {selectedCountryData?.code === 'US' ? 'ZIP Code' : 
             selectedCountryData?.code === 'GB' ? 'Postcode' : 
             'Postal Code'}
            {selectedCountryData?.continent === 'Africa' && (
              <span className={`text-xs ml-1 ${ui.muted}`}>(optional)</span>
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
            autoComplete="postal-code"
            className={ui.field(!!errors.zipCode)}
            disabled={disabled}
          />
          {errors.zipCode && (
            <p className={ui.error}>{errors.zipCode}</p>
          )}
        </div>
      )}
      </div>
      )}

      {/* City status shown below the row to keep City/ZIP aligned */}
      {locationPrompt === 'closed' && locationError && (
        <p className={`mt-1 text-xs ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{locationError}</p>
      )}
      {selectedCountryCode && cityInput && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {isUsingGps ? (
            <span className={`flex items-center gap-1 ${ui.success}`}>
              <LocateFixed className="w-3 h-3" />
              Using your current location
            </span>
          ) : coordinates.lat && coordinates.lng ? (
            <span className={`flex items-center gap-1 ${isDark ? 'text-emerald-400' : 'text-green-600'}`}>
              <Check className="w-3 h-3" />
              Exact location found
            </span>
          ) : isCustomCity ? (
            <span className={`flex items-center gap-1 ${isDark ? 'text-amber-300/90' : 'text-orange-600'}`}>
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
