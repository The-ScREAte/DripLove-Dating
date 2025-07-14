import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { MapPin, Settings, Target } from 'lucide-react';
import { locationService, type UserLocation } from '@/services/locationService';
import { getCountriesList } from '@/constants/locationData';

interface LocationFilterProps {
  currentUser: {
    id: string;
    country?: string;
    city?: string;
  } | null;
  onLocationUpdate?: () => void;
}

const LocationFilter = ({ currentUser, onLocationUpdate }: LocationFilterProps) => {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [maxDistance, setMaxDistance] = useState<number>(50);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const countries = getCountriesList();

  // Load user's current location settings
  useEffect(() => {
    const loadUserLocation = async () => {
      if (!currentUser?.id) return;

      const location = await locationService.getUserLocation(currentUser.id);
      if (location) {
        setUserLocation(location);
        setMaxDistance(location.maxDistance || 50);
      }
    };

    if (currentUser?.id) {
      loadUserLocation();
    }
  }, [currentUser?.id]);

  const updateUserLocation = async () => {
    if (!currentUser?.id) return;

    const location = await locationService.getUserLocation(currentUser.id);
    if (location) {
      setUserLocation(location);
      setMaxDistance(location.maxDistance || 50);
    }
  };

  const handleDistanceChange = async (newDistance: number[]) => {
    const distance = newDistance[0];
    setMaxDistance(distance);

    if (currentUser?.id && userLocation) {
      setIsLoading(true);
      const success = await locationService.updateUserLocation(currentUser.id, {
        ...userLocation,
        maxDistance: distance
      });

      if (success) {
        setUserLocation(prev => prev ? { ...prev, maxDistance: distance } : null);
        onLocationUpdate?.();
      }
      setIsLoading(false);
    }
  };

  if (!currentUser || !userLocation) {
    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-gray-600">
            <MapPin className="w-4 h-4" />
            <span className="text-sm">Set up your location in profile settings for better matches</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="w-5 h-5 text-pink-600" />
          Location Matching
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="ml-auto"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Current Location Display */}
        <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-lg">
          <MapPin className="w-4 h-4 text-blue-600" />
          <div className="flex-1">
            <div className="font-medium text-blue-800">
              📍 {userLocation.city}, {userLocation.country}
            </div>
            {userLocation.latitude && userLocation.longitude && (
              <div className="text-xs text-blue-600">
                Exact location • Better matching accuracy
              </div>
            )}
          </div>
        </div>

        {/* Distance Settings */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Maximum Distance</label>
              <span className="text-sm text-gray-600">{maxDistance} km</span>
            </div>
            <Slider
              value={[maxDistance]}
              onValueChange={handleDistanceChange}
              max={500}
              min={1}
              step={5}
              className="w-full"
              disabled={isLoading}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 km</span>
              <span>500 km</span>
            </div>
          </div>

          {/* Distance Guide */}
          <div className="text-xs text-gray-600 space-y-1">
            <div className="flex justify-between">
              <span>• Same city:</span>
              <span className="text-green-600">~0-25 km</span>
            </div>
            <div className="flex justify-between">
              <span>• Nearby cities:</span>
              <span className="text-blue-600">~25-100 km</span>
            </div>
            <div className="flex justify-between">
              <span>• Same country:</span>
              <span className="text-orange-600">~100-500 km</span>
            </div>
          </div>
        </div>

        {/* Extended Settings */}
        {showSettings && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <div className="text-sm font-medium">Location Preferences</div>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Button variant="outline" size="sm" className="h-8">
                Same City Only
              </Button>
              <Button variant="outline" size="sm" className="h-8">
                Country Wide
              </Button>
            </div>

            <div className="p-3 bg-yellow-50 rounded-lg">
              <div className="text-xs text-yellow-800">
                💡 <strong>Tip:</strong> Users with exact coordinates (from major cities) 
                get more accurate distance calculations and better matches.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LocationFilter;
