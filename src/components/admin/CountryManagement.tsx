import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getCountriesList } from '@/constants/locationData';
import { clearEnabledCountriesCache } from '@/utils/enabledCountries';
import { Globe, Save, RefreshCw, Edit3, X, Check, Plus } from 'lucide-react';

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
  const [isEditing, setIsEditing] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
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
      
      // Initialize pending changes
      const changes: Record<string, boolean> = {};
      allCountries.forEach(country => {
        const enabled = data?.find(c => c.country_code === country.code);
        changes[country.code] = enabled ? enabled.is_enabled : false;
      });
      setPendingChanges(changes);
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

  // Update pending changes
  const togglePendingChange = (countryCode: string, isEnabled: boolean) => {
    setPendingChanges(prev => ({
      ...prev,
      [countryCode]: isEnabled
    }));
  };

  // Save all pending changes
  const saveChanges = async () => {
    try {
      setSaving(true);
      
      const operations = [];
      
      for (const [countryCode, isEnabled] of Object.entries(pendingChanges)) {
        const country = allCountries.find(c => c.code === countryCode);
        if (!country) continue;

        const existingCountry = enabledCountries.find(c => c.country_code === countryCode);
        
        if (existingCountry) {
          // Update existing record
          operations.push(
            supabase
              .from('enabled_countries')
              .update({ is_enabled: isEnabled })
              .eq('id', existingCountry.id)
          );
        } else if (isEnabled) {
          // Insert new record only if enabling
          operations.push(
            supabase
              .from('enabled_countries')
              .insert({
                country_code: countryCode,
                country_name: country.name,
                is_enabled: isEnabled
              })
          );
        }
      }

      // Execute all operations
      await Promise.all(operations.map(op => op));

      // Clear the cache so LocationInput components get fresh data
      clearEnabledCountriesCache();

      // Refresh data
      await fetchEnabledCountries();
      
      setIsEditing(false);
      
      const enabledCount = Object.values(pendingChanges).filter(Boolean).length;
      toast({
        title: 'Success',
        description: `Country settings saved! ${enabledCount} countries enabled.`
      });
    } catch (error) {
      console.error('Error saving changes:', error);
      toast({
        title: 'Error',
        description: 'Failed to save changes',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Cancel editing
  const cancelEditing = () => {
    // Reset pending changes to current state
    const changes: Record<string, boolean> = {};
    allCountries.forEach(country => {
      const enabled = enabledCountries.find(c => c.country_code === country.code);
      changes[country.code] = enabled ? enabled.is_enabled : false;
    });
    setPendingChanges(changes);
    setIsEditing(false);
  };

  // Quick actions for bulk operations
  const bulkUpdate = (filter: (country: any) => boolean, enabled: boolean) => {
    const updates: Record<string, boolean> = {};
    allCountries.forEach(country => {
      if (filter(country)) {
        updates[country.code] = enabled;
      }
    });
    setPendingChanges(prev => ({ ...prev, ...updates }));
  };

  // Get current status (either from pending changes or current state)
  const getCountryStatus = (countryCode: string) => {
    return isEditing ? pendingChanges[countryCode] : (
      enabledCountries.find(c => c.country_code === countryCode)?.is_enabled || false
    );
  };

  const enabledCount = isEditing 
    ? Object.values(pendingChanges).filter(Boolean).length
    : enabledCountries.filter(c => c.is_enabled).length;

  if (loading) {
    return (
      <Card className="animate-fade-in">
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
    <Card className="animate-fade-in">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Country Management
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Control which countries users can select during registration and profile completion.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
                size="sm"
                className="hover-scale"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Countries
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  onClick={cancelEditing}
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  className="hover-scale"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={saveChanges}
                  disabled={saving}
                  size="sm"
                  className="hover-scale"
                >
                  {saving ? (
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-6">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="default" className="bg-green-500 hover:bg-green-600">
              <Check className="w-3 h-3 mr-1" />
              {enabledCount} enabled
            </Badge>
            <Badge variant="secondary">
              <X className="w-3 h-3 mr-1" />
              {allCountries.length - enabledCount} disabled
            </Badge>
            <span className="text-muted-foreground">
              Total: {allCountries.length} countries
            </span>
          </div>

          {/* View Mode - Just show enabled countries */}
          {!isEditing && (
            <div className="animate-fade-in">
              <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">
                Enabled Countries
              </h4>
              {enabledCount === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No countries enabled</p>
                  <p className="text-sm">Click "Edit Countries" to enable some countries</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {allCountries
                    .filter(country => getCountryStatus(country.code))
                    .map((country) => (
                      <div
                        key={country.code}
                        className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 animate-scale-in"
                      >
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{country.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {country.code}
                            {country.continent === 'Africa' && (
                              <span className="ml-1 text-green-600">🌍</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Edit Mode - Show all countries with checkboxes */}
          {isEditing && (
            <div className="animate-fade-in space-y-4">
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2 p-4 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium mr-2">Quick actions:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkUpdate(c => c.continent === 'Africa', true)}
                  className="text-xs hover-scale"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Enable Africa
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkUpdate(() => true, true)}
                  className="text-xs hover-scale"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Enable All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkUpdate(() => true, false)}
                  className="text-xs hover-scale"
                >
                  <X className="w-3 h-3 mr-1" />
                  Disable All
                </Button>
              </div>

              {/* All Countries Grid */}
              <div className="max-h-96 overflow-y-auto border rounded-lg p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {allCountries.map((country) => {
                    const isEnabled = pendingChanges[country.code];
                    return (
                      <div
                        key={country.code}
                        className={`flex items-center space-x-3 p-3 rounded-lg border transition-all duration-200 hover:shadow-sm ${
                          isEnabled 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <Checkbox
                          id={country.code}
                          checked={isEnabled}
                          onCheckedChange={(checked) => 
                            togglePendingChange(country.code, checked as boolean)
                          }
                          className="flex-shrink-0"
                        />
                        <label
                          htmlFor={country.code}
                          className="flex-1 cursor-pointer min-w-0"
                        >
                          <div className="font-medium text-sm truncate">{country.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {country.code}
                            {country.continent === 'Africa' && (
                              <span className="ml-1 text-green-600">🌍 Africa</span>
                            )}
                          </div>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CountryManagement;