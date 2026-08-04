import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, Edit, Trash2, Calendar, Clock, Play, Pause, ChevronDown, Bell, Mail } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import RichTextEditor from './RichTextEditor';
import { Checkbox } from '@/components/ui/checkbox';

interface Country {
  code: string;
  name: string;
  userCount: number;
}

interface ScheduledBroadcast {
  id: string;
  channel: 'push' | 'email';
  title: string;
  message: string;
  target_countries: string[];
  repeat_type: 'daily' | 'every_2_days' | 'weekends' | 'weekdays' | 'specific_day';
  specific_day?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  time_to_send: string; // HH:MM format
  is_active: boolean;
  last_sent_at: string | null;
  next_send_at: string | null;
  total_sends: number;
  created_at: string;
  admin_id: string;
}

const htmlToPlainText = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
};

const getCountryName = (code: string): string => {
  const countryNames: { [key: string]: string } = {
    US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
    DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', NL: 'Netherlands',
    BE: 'Belgium', CH: 'Switzerland', AT: 'Austria', SE: 'Sweden', NO: 'Norway',
    DK: 'Denmark', FI: 'Finland', PL: 'Poland', CZ: 'Czech Republic',
    IE: 'Ireland', PT: 'Portugal', GR: 'Greece', NZ: 'New Zealand',
    SG: 'Singapore', HK: 'Hong Kong', JP: 'Japan', KR: 'South Korea',
    IN: 'India', BR: 'Brazil', MX: 'Mexico', AR: 'Argentina', CL: 'Chile',
    ZA: 'South Africa', NG: 'Nigeria', KE: 'Kenya', EG: 'Egypt',
    AE: 'UAE', SA: 'Saudi Arabia', IL: 'Israel', TR: 'Turkey', RU: 'Russia',
  };
  return countryNames[code] || code;
};

export default function ScheduledBroadcasts() {
  const [scheduledBroadcasts, setScheduledBroadcasts] = useState<ScheduledBroadcast[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingBroadcast, setEditingBroadcast] = useState<ScheduledBroadcast | null>(null);
  const { toast } = useToast();

  // Form state
  const [channel, setChannel] = useState<'push' | 'email'>('push');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [repeatType, setRepeatType] = useState<string>('daily');
  const [specificDay, setSpecificDay] = useState<string>('monday');
  const [timeToSend, setTimeToSend] = useState('09:00');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    loadScheduledBroadcasts();
    loadCountries();
  }, []);

  const loadCountries = async () => {
    setIsLoadingCountries(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('country, id')
        .not('country', 'is', null)
        .eq('account_status', 'active')
        .eq('is_admin', false);

      if (error) throw error;

      const countryMap = new Map<string, number>();
      data?.forEach((profile) => {
        const count = countryMap.get(profile.country) || 0;
        countryMap.set(profile.country, count + 1);
      });

      const countryList: Country[] = Array.from(countryMap.entries())
        .map(([code, userCount]) => ({
          code,
          name: getCountryName(code),
          userCount,
        }))
        .sort((a, b) => b.userCount - a.userCount);

      setCountries(countryList);
    } catch (error) {
      console.error('Error loading countries:', error);
    } finally {
      setIsLoadingCountries(false);
    }
  };

  const loadScheduledBroadcasts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('scheduled_broadcasts' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setScheduledBroadcasts((data || []) as unknown as ScheduledBroadcast[]);
    } catch (error) {
      console.error('Error loading scheduled broadcasts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load scheduled broadcasts',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingBroadcast(null);
    setChannel('push');
    setTitle('');
    setMessage('');
    setSelectedCountries([]);
    setRepeatType('daily');
    setSpecificDay('monday');
    setTimeToSend('09:00');
    setIsActive(true);
    setShowDialog(true);
  };

  const openEditDialog = (broadcast: ScheduledBroadcast) => {
    setEditingBroadcast(broadcast);
    setChannel(broadcast.channel || 'push');
    setTitle(broadcast.title);
    setMessage(broadcast.message);
    setSelectedCountries(broadcast.target_countries || []);
    setRepeatType(broadcast.repeat_type);
    setSpecificDay(broadcast.specific_day || 'monday');
    setTimeToSend(broadcast.time_to_send);
    setIsActive(broadcast.is_active);
    setShowDialog(true);
  };

  const calculateNextSendTime = (repeatType: string, specificDay: string, timeToSend: string): Date => {
    const now = new Date();
    const [hours, minutes] = timeToSend.split(':').map(Number);
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);

    // If time has passed today, start from tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    switch (repeatType) {
      case 'daily':
        // Already set to tomorrow if needed
        break;
      
      case 'every_2_days':
        // Set to 2 days from now
        next.setDate(next.getDate() + 1);
        break;
      
      case 'weekends':
        // Find next Saturday or Sunday
        while (next.getDay() !== 0 && next.getDay() !== 6) {
          next.setDate(next.getDate() + 1);
        }
        break;
      
      case 'weekdays':
        // Find next Monday-Friday
        while (next.getDay() === 0 || next.getDay() === 6) {
          next.setDate(next.getDate() + 1);
        }
        break;
      
      case 'specific_day':
        const dayMap: { [key: string]: number } = {
          sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
          thursday: 4, friday: 5, saturday: 6
        };
        const targetDay = dayMap[specificDay];
        while (next.getDay() !== targetDay) {
          next.setDate(next.getDate() + 1);
        }
        break;
    }

    return next;
  };

  const handleSave = async () => {
    const bodyIsEmpty = channel === 'email' ? !htmlToPlainText(message) : !message.trim();
    if (!title.trim() || bodyIsEmpty) {
      toast({
        title: 'Error',
        description: `Please fill in ${channel === 'email' ? 'subject and message' : 'title and message'}`,
        variant: 'destructive',
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const nextSendAt = calculateNextSendTime(repeatType, specificDay, timeToSend);

    const broadcastData = {
      channel,
      title: title.trim(),
      message: channel === 'email' ? message : message.trim(),
      target_countries: selectedCountries.length > 0 ? selectedCountries : null,
      repeat_type: repeatType,
      specific_day: repeatType === 'specific_day' ? specificDay : null,
      time_to_send: timeToSend,
      is_active: isActive,
      next_send_at: nextSendAt.toISOString(),
      admin_id: user.id,
    };

    try {
      if (editingBroadcast) {
        const { error } = await supabase
          .from('scheduled_broadcasts' as any)
          .update(broadcastData)
          .eq('id', editingBroadcast.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Scheduled broadcast updated successfully',
        });
      } else {
        const { error } = await supabase
          .from('scheduled_broadcasts' as any)
          .insert(broadcastData);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Scheduled broadcast created successfully',
        });
      }

      setShowDialog(false);
      loadScheduledBroadcasts();
    } catch (error) {
      console.error('Error saving scheduled broadcast:', error);
      toast({
        title: 'Error',
        description: 'Failed to save scheduled broadcast',
        variant: 'destructive',
      });
    }
  };

  const toggleActive = async (broadcast: ScheduledBroadcast) => {
    try {
      const { error } = await supabase
        .from('scheduled_broadcasts' as any)
        .update({ is_active: !broadcast.is_active })
        .eq('id', broadcast.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Broadcast ${!broadcast.is_active ? 'activated' : 'deactivated'}`,
      });

      loadScheduledBroadcasts();
    } catch (error) {
      console.error('Error toggling broadcast:', error);
      toast({
        title: 'Error',
        description: 'Failed to update broadcast status',
        variant: 'destructive',
      });
    }
  };

  const deleteBroadcast = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled broadcast?')) return;

    try {
      const { error } = await supabase
        .from('scheduled_broadcasts' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Scheduled broadcast deleted',
      });

      loadScheduledBroadcasts();
    } catch (error) {
      console.error('Error deleting broadcast:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete broadcast',
        variant: 'destructive',
      });
    }
  };

  const getRepeatLabel = (broadcast: ScheduledBroadcast) => {
    switch (broadcast.repeat_type) {
      case 'daily':
        return 'Daily';
      case 'every_2_days':
        return 'Every 2 days';
      case 'weekends':
        return 'Weekends';
      case 'weekdays':
        return 'Weekdays';
      case 'specific_day':
        return `Every ${broadcast.specific_day?.charAt(0).toUpperCase()}${broadcast.specific_day?.slice(1)}`;
      default:
        return broadcast.repeat_type;
    }
  };

  const toggleCountry = (countryCode: string) => {
    setSelectedCountries(prev =>
      prev.includes(countryCode)
        ? prev.filter(c => c !== countryCode)
        : [...prev, countryCode]
    );
  };

  const toggleAllCountries = () => {
    setSelectedCountries(prev => (prev.length === countries.length ? [] : countries.map(c => c.code)));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Scheduled Broadcasts</CardTitle>
              <CardDescription>
                Create and manage recurring push notifications
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 mr-2" />
              New Schedule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : scheduledBroadcasts.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No scheduled broadcasts yet</p>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-3">
                {scheduledBroadcasts.map((broadcast) => (
                  <div
                    key={broadcast.id}
                    className={`p-4 border rounded-lg ${
                      broadcast.is_active ? 'border-purple-200 bg-purple-50/30' : 'border-gray-200 bg-gray-50/30'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className={`text-[9px] h-4 px-1.5 ${
                              broadcast.channel === 'email' ? 'border-purple-400 text-purple-600' : 'border-blue-400 text-blue-600'
                            }`}
                          >
                            {broadcast.channel === 'email' ? (
                              <Mail className="w-2 h-2 mr-0.5" />
                            ) : (
                              <Bell className="w-2 h-2 mr-0.5" />
                            )}
                            {broadcast.channel === 'email' ? 'Email' : 'Push'}
                          </Badge>
                          <h4 className="font-semibold text-sm">{broadcast.title}</h4>
                          {broadcast.is_active ? (
                            <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                          {broadcast.channel === 'email' ? htmlToPlainText(broadcast.message) : broadcast.message}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-3 flex-wrap text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{getRepeatLabel(broadcast)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{broadcast.time_to_send}</span>
                      </div>
                      {broadcast.target_countries && broadcast.target_countries.length > 0 ? (
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs">
                            <Badge variant="outline" className="bg-purple-50 hover:bg-purple-100 transition-colors">
                              {broadcast.target_countries.length} {broadcast.target_countries.length === 1 ? 'country' : 'countries'}
                              <ChevronDown className="w-3 h-3 ml-1" />
                            </Badge>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-1">
                            <div className="flex flex-wrap gap-1 p-2 bg-purple-50 rounded border border-purple-100">
                              {broadcast.target_countries.map((code) => (
                                <Badge key={code} variant="outline" className="text-xs bg-white">
                                  {getCountryName(code)}
                                </Badge>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-green-50">All countries</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {broadcast.total_sends} sends
                      </Badge>
                    </div>

                    <div className="text-xs text-gray-500 mb-3 space-y-0.5">
                      {broadcast.next_send_at && (
                        <p>Next send: {new Date(broadcast.next_send_at).toLocaleString()}</p>
                      )}
                      <p>
                        Last sent: {broadcast.last_sent_at ? new Date(broadcast.last_sent_at).toLocaleString() : 'Never'}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(broadcast)}
                        className="h-7 text-xs"
                      >
                        {broadcast.is_active ? (
                          <>
                            <Pause className="w-3 h-3 mr-1" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 mr-1" />
                            Activate
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(broadcast)}
                        className="h-7 text-xs"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteBroadcast(broadcast.id)}
                        className="h-7 text-xs text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBroadcast ? 'Edit Schedule' : 'Create Schedule'}
            </DialogTitle>
            <DialogDescription>
              Set up a recurring push notification or email to be sent automatically
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Send As *</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as 'push' | 'email')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="push">
                    <span className="flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Push Notification</span>
                  </SelectItem>
                  <SelectItem value="email">
                    <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">{channel === 'email' ? 'Subject *' : 'Title *'}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={channel === 'email' ? 'Email subject' : 'Notification title'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message *</Label>
              {channel === 'email' ? (
                <RichTextEditor
                  value={message}
                  onChange={setMessage}
                  placeholder="Write your email message..."
                />
              ) : (
                <>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Notification message"
                    rows={5}
                    maxLength={3000}
                  />
                  <p className="text-xs text-gray-500">{message.length}/3000 characters</p>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label>Repeat Schedule *</Label>
              <Select value={repeatType} onValueChange={setRepeatType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Every Day</SelectItem>
                  <SelectItem value="every_2_days">Every 2 Days</SelectItem>
                  <SelectItem value="weekdays">Weekdays (Mon-Fri)</SelectItem>
                  <SelectItem value="weekends">Weekends (Sat-Sun)</SelectItem>
                  <SelectItem value="specific_day">Specific Day of Week</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {repeatType === 'specific_day' && (
              <div className="space-y-2">
                <Label>Day of Week *</Label>
                <Select value={specificDay} onValueChange={setSpecificDay}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monday">Monday</SelectItem>
                    <SelectItem value="tuesday">Tuesday</SelectItem>
                    <SelectItem value="wednesday">Wednesday</SelectItem>
                    <SelectItem value="thursday">Thursday</SelectItem>
                    <SelectItem value="friday">Friday</SelectItem>
                    <SelectItem value="saturday">Saturday</SelectItem>
                    <SelectItem value="sunday">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="time">Time to Send *</Label>
              <Input
                id="time"
                type="time"
                value={timeToSend}
                onChange={(e) => setTimeToSend(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Target Countries ({selectedCountries.length} selected)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleAllCountries}
                  disabled={isLoadingCountries || countries.length === 0}
                  className="h-6 text-[11px] px-2"
                >
                  {selectedCountries.length === countries.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              {isLoadingCountries ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <ScrollArea className="h-[200px] border rounded-md p-3">
                  <div className="space-y-2">
                    {countries.map((country) => (
                      <div
                        key={country.code}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                          selectedCountries.includes(country.code)
                            ? 'bg-purple-50 border border-purple-200'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => toggleCountry(country.code)}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedCountries.includes(country.code)}
                            onCheckedChange={() => toggleCountry(country.code)}
                            className="data-[state=checked]:bg-purple-600"
                          />
                          <span className={`text-sm ${
                            selectedCountries.includes(country.code) ? 'font-medium' : ''
                          }`}>{country.name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {country.userCount} users
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {selectedCountries.length === 0
                  ? 'No countries selected — this will send to all countries.'
                  : "New users who sign up in these countries after this schedule is created are automatically included on every future send."}
              </p>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-md">
              <div>
                <Label htmlFor="active" className="text-sm font-medium">
                  Active
                </Label>
                <p className="text-xs text-gray-500">
                  Enable this schedule to start sending automatically
                </p>
              </div>
              <Switch
                id="active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700">
              {editingBroadcast ? 'Update Schedule' : 'Create Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
