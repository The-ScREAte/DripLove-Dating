import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getCountriesList } from '@/constants/locationData';
import { Globe, Save, RefreshCw } from 'lucide-react';

interface EnabledCountry {
  id: string;
  country_code: string;
  country_name: string;
  is_enabled: boolean;
}

const CountryManagement = () => {
  const [enabledCountries, setEnabledCountries] = useState<EnabledCountry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const allCountries = getCountriesList();

  // Fetch enabled countries from database
  const fetchEnabledCountries = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('enabled_countries')
        .select('*')
        .order('country_name');

      if (error) throw error;

      setEnabledCountries(data || []);
    } catch (error) {
      console.error('Error fetching enabled countries:', error);
      toast({
        title: 'Error',
        description: 'Failed to load enabled countries',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnabledCountries();
  }, []);

  // Toggle country enabled status
  const toggleCountry = async (countryCode: string, isEnabled: boolean) => {
    const country = allCountries.find(c => c.code === countryCode);
    if (!country) return;

    try {
      // Check if country exists in enabled_countries table
      const existingCountry = enabledCountries.find(c => c.country_code === countryCode);

      if (existingCountry) {
        // Update existing record
        const { error } = await supabase
          .from('enabled_countries')
          .update({ is_enabled: isEnabled })
          .eq('id', existingCountry.id);

        if (error) throw error;

        setEnabledCountries(prev => 
          prev.map(c => 
            c.country_code === countryCode 
              ? { ...c, is_enabled: isEnabled }
              : c
          )
        );
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from('enabled_countries')
          .insert({
            country_code: countryCode,
            country_name: country.name,
            is_enabled: isEnabled
          })
          .select()
          .single();

        if (error) throw error;

        setEnabledCountries(prev => [...prev, data]);
      }

      toast({
        title: 'Success',
        description: `${country.name} ${isEnabled ? 'enabled' : 'disabled'} successfully`
      });
    } catch (error) {
      console.error('Error toggling country:', error);
      toast({
        title: 'Error',
        description: 'Failed to update country status',
        variant: 'destructive'
      });
    }
  };

  // Sync all countries from location data to database
  const syncAllCountries = async () => {
    try {
      setSaving(true);
      
      const countriesToInsert = allCountries
        .filter(country => !enabledCountries.some(ec => ec.country_code === country.code))
        .map(country => ({
          country_code: country.code,
          country_name: country.name,
          is_enabled: false // Default to disabled for new countries
        }));

      if (countriesToInsert.length > 0) {
        const { error } = await supabase
          .from('enabled_countries')
          .insert(countriesToInsert);

        if (error) throw error;

        await fetchEnabledCountries();
        
        toast({
          title: 'Success',
          description: `Added ${countriesToInsert.length} new countries to the list`
        });
      } else {
        toast({
          title: 'Info',
          description: 'All countries are already in sync'
        });
      }
    } catch (error) {
      console.error('Error syncing countries:', error);
      toast({
        title: 'Error',
        description: 'Failed to sync countries',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Get status for a country
  const getCountryStatus = (countryCode: string) => {
    const enabled = enabledCountries.find(c => c.country_code === countryCode);
    return enabled ? enabled.is_enabled : false;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Country Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span className="ml-2">Loading countries...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Country Management
          </CardTitle>
          <Button
            onClick={syncAllCountries}
            disabled={saving}
            variant="outline"
            size="sm"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Sync All Countries
          </Button>
        </div>
        <p className="text-sm text-gray-600">
          Select which countries users can choose from during registration and profile completion.
          Only enabled countries will be shown in dropdowns.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-green-600">
              ✓ {enabledCountries.filter(c => c.is_enabled).length} enabled
            </span>
            <span className="text-red-600">
              ✗ {enabledCountries.filter(c => !c.is_enabled).length} disabled
            </span>
            <span className="text-gray-500">
              Total: {allCountries.length} countries available
            </span>
          </div>

          {/* Countries Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto border rounded-lg p-4">
            {allCountries.map((country) => {
              const isEnabled = getCountryStatus(country.code);
              return (
                <div
                  key={country.code}
                  className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                    isEnabled 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <Checkbox
                    id={country.code}
                    checked={isEnabled}
                    onCheckedChange={(checked) => 
                      toggleCountry(country.code, checked as boolean)
                    }
                  />
                  <label
                    htmlFor={country.code}
                    className="flex-1 cursor-pointer"
                  >
                    <div className="font-medium text-sm">{country.name}</div>
                    <div className="text-xs text-gray-500">
                      {country.code}
                      {country.continent === 'Africa' && (
                        <span className="ml-2 text-green-600">🌍 Africa</span>
                      )}
                    </div>
                  </label>
                </div>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                allCountries
                  .filter(c => c.continent === 'Africa')
                  .forEach(c => toggleCountry(c.code, true));
              }}
            >
              Enable All African Countries
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                allCountries.forEach(c => toggleCountry(c.code, true));
              }}
            >
              Enable All Countries
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                enabledCountries
                  .filter(c => c.is_enabled)
                  .forEach(c => toggleCountry(c.country_code, false));
              }}
            >
              Disable All Countries
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CountryManagement;