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
import { Loader2, Plus, Edit, Trash2, Calendar, Clock, Play, Pause, ChevronDown, Bell, Mail, X, Send, Copy } from 'lucide-react';
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
  repeat_type: 'daily' | 'every_2_days' | 'every_n_days' | 'weekends' | 'weekdays' | 'specific_day' | 'interval';
  every_n_days?: number | null;
  specific_days?: string[] | null;
  send_times?: string[] | null; // HH:MM, each person's local time
  interval_minutes?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  audience?: 'all' | 'free' | 'premium';
  recipient_emails?: string[] | null;
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

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEK: Array<[string, string]> = [
  ['monday', 'Mon'], ['tuesday', 'Tue'], ['wednesday', 'Wed'], ['thursday', 'Thu'],
  ['friday', 'Fri'], ['saturday', 'Sat'], ['sunday', 'Sun'],
];
const MAX_SEND_TIMES = 6;
const SUGGESTED_TIMES = ['09:00', '19:00', '13:00', '21:00', '07:00', '16:00'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type AudiencePreview = { matched: number; by_push: number; by_email: number; unreachable: number };

// Admin RPCs that aren't in the generated Supabase types yet.
const callRpc = <T,>(fn: string, args?: Record<string, unknown>) =>
  (supabase.rpc.bind(supabase) as unknown as (
    name: string,
    params?: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { message: string } | null }>)(fn, args);

const parseEmails = (text: string) =>
  Array.from(new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)));

// <input type="datetime-local"> works in the admin's local time.
const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

const scheduleTimes = (b: ScheduledBroadcast): string[] =>
  (b.send_times && b.send_times.length > 0 ? [...b.send_times] : [b.time_to_send]).sort();

const scheduleDays = (b: ScheduledBroadcast): string[] =>
  b.specific_days && b.specific_days.length > 0 ? b.specific_days : b.specific_day ? [b.specific_day] : [];

const weekOrder = (days: string[]) => WEEK.map(([d]) => d).filter((d) => days.includes(d));

const formatInterval = (minutes: number) =>
  minutes >= 60 && minutes % 60 === 0
    ? `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`
    : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;

// Next local date and time a schedule runs - the same rule the server uses
// (schedule_runs_on). Each person gets it at that time in their own time zone.
// "Every N days" counts from the day the schedule was created (UTC).
const nextLocalSend = (
  repeatType: string,
  days: string[],
  everyNDays: number,
  times: string[],
  createdAt?: string,
  startsAt?: string | null,
): Date | null => {
  const start = startsAt ? new Date(startsAt) : null;
  const now = start && start > new Date() ? start : new Date();
  const anchor = createdAt ? new Date(createdAt) : now;
  const anchorDay = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
  const runsOn = (d: Date) => {
    const diff = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - anchorDay) / 86_400_000);
    switch (repeatType) {
      case 'daily': return true;
      case 'every_2_days': return diff >= 0 && diff % 2 === 0;
      case 'every_n_days': return diff >= 0 && diff % Math.max(everyNDays, 1) === 0;
      case 'weekdays': return d.getDay() >= 1 && d.getDay() <= 5;
      case 'weekends': return d.getDay() === 0 || d.getDay() === 6;
      case 'specific_day': return days.includes(DAY_NAMES[d.getDay()]);
      default: return false;
    }
  };
  const sorted = times.filter((t) => TIME_RE.test(t)).sort();
  for (let i = 0; i < 62; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (!runsOn(day)) continue;
    for (const t of sorted) {
      const [h, m] = t.split(':').map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (at > now) return at;
    }
  }
  return null;
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
  const [everyNDays, setEveryNDays] = useState('2');
  const [specificDays, setSpecificDays] = useState<string[]>(['monday']);
  const [sendTimes, setSendTimes] = useState<string[]>(['09:00']);
  const [isActive, setIsActive] = useState(true);
  const [intervalValue, setIntervalValue] = useState('4');
  const [intervalUnit, setIntervalUnit] = useState<'minutes' | 'hours'>('hours');
  const [audience, setAudience] = useState<'all' | 'free' | 'premium'>('all');
  const [recipientEmails, setRecipientEmails] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  // undefined = counting, null = couldn't count
  const [preview, setPreview] = useState<AudiencePreview | null | undefined>(undefined);
  const [sendingNowId, setSendingNowId] = useState<string | null>(null);

  useEffect(() => {
    loadScheduledBroadcasts();
    loadCountries();
  }, []);

  const loadCountries = async () => {
    setIsLoadingCountries(true);
    try {
      // Counted on the server - this used to download every profile.
      const { data, error } = await callRpc<Array<{ country: string; users: number }>>('admin_country_counts');
      if (error) throw error;
      setCountries((data || []).map(({ country, users }) => ({
        code: country,
        name: getCountryName(country),
        userCount: users,
      })));
    } catch (error) {
      console.error('Error loading countries:', error);
    } finally {
      setIsLoadingCountries(false);
    }
  };

  // Live "who gets this" count while the form is open.
  useEffect(() => {
    if (!showDialog) return;
    let cancelled = false;
    setPreview(undefined);
    const timer = setTimeout(async () => {
      const { data, error } = await callRpc<AudiencePreview[]>('preview_schedule_audience', {
        p_channel: channel,
        p_audience: audience,
        p_recipient_emails: parseEmails(recipientEmails),
        p_target_countries: selectedCountries,
      });
      if (!cancelled) setPreview(error || !data?.[0] ? null : data[0]);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showDialog, channel, audience, recipientEmails, selectedCountries]);

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
    setEveryNDays('2');
    setSpecificDays(['monday']);
    setSendTimes(['09:00']);
    setIsActive(true);
    setIntervalValue('4');
    setIntervalUnit('hours');
    setAudience('all');
    setRecipientEmails('');
    setStartsAt('');
    setEndsAt('');
    setShowDialog(true);
  };

  const openEditDialog = (broadcast: ScheduledBroadcast) => {
    setEditingBroadcast(broadcast);
    setChannel(broadcast.channel || 'push');
    setTitle(broadcast.title);
    setMessage(broadcast.message);
    setSelectedCountries(broadcast.target_countries || []);
    setRepeatType(broadcast.repeat_type === 'every_2_days' ? 'every_n_days' : broadcast.repeat_type);
    setEveryNDays(String(broadcast.every_n_days || 2));
    setSpecificDays(scheduleDays(broadcast).length > 0 ? scheduleDays(broadcast) : ['monday']);
    setSendTimes(broadcast.repeat_type === 'interval' ? ['09:00'] : scheduleTimes(broadcast));
    setIsActive(broadcast.is_active);
    const minutes = broadcast.interval_minutes || 240;
    const inHours = minutes >= 60 && minutes % 60 === 0;
    setIntervalUnit(inHours ? 'hours' : 'minutes');
    setIntervalValue(String(inHours ? minutes / 60 : minutes));
    setAudience(broadcast.audience || 'all');
    setRecipientEmails((broadcast.recipient_emails || []).join('\n'));
    setStartsAt(toLocalInput(broadcast.starts_at));
    setEndsAt(toLocalInput(broadcast.ends_at));
    setShowDialog(true);
  };

  // Same settings as a new, paused schedule.
  const duplicateBroadcast = (broadcast: ScheduledBroadcast) => {
    openEditDialog(broadcast);
    setEditingBroadcast(null);
    setTitle(`${broadcast.title} (copy)`);
    setIsActive(false);
    setStartsAt('');
    setEndsAt('');
  };

  const sendNow = async (broadcast: ScheduledBroadcast) => {
    if (!confirm(`Send "${broadcast.title}" now to everyone this schedule targets?`)) return;
    setSendingNowId(broadcast.id);
    try {
      const { data, error } = await callRpc<number>('send_schedule_now', { p_schedule_id: broadcast.id });
      if (error) throw error;
      toast({
        title: 'Sent',
        description: data
          ? `On its way to ${data} ${data === 1 ? 'person' : 'people'}.`
          : 'Nobody matches this schedule right now.',
      });
      loadScheduledBroadcasts();
    } catch (error) {
      console.error('Error sending schedule now:', error);
      toast({ title: 'Error', description: 'Failed to send now', variant: 'destructive' });
    } finally {
      setSendingNowId(null);
    }
  };

  const updateSendTime = (index: number, value: string) =>
    setSendTimes((prev) => prev.map((t, i) => (i === index ? value : t)));

  const addSendTime = () =>
    setSendTimes((prev) => [...prev, SUGGESTED_TIMES.find((t) => !prev.includes(t)) || '12:00']);

  const removeSendTime = (index: number) => setSendTimes((prev) => prev.filter((_, i) => i !== index));

  const toggleDay = (day: string) =>
    setSpecificDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));

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

    const fail = (description: string) => toast({ title: 'Error', description, variant: 'destructive' });
    const emails = parseEmails(recipientEmails);
    const startsIso = fromLocalInput(startsAt);
    const endsIso = fromLocalInput(endsAt);
    if (endsIso && new Date(endsIso) <= new Date()) return fail('The end time has already passed.');
    if (startsIso && endsIso && new Date(endsIso) <= new Date(startsIso)) return fail('The end must be after the start.');
    const isInterval = repeatType === 'interval';
    const intervalMinutes = Number(intervalValue) * (intervalUnit === 'hours' ? 60 : 1);
    const times = Array.from(new Set(sendTimes.filter((t) => TIME_RE.test(t)))).sort();
    const days = weekOrder(specificDays);
    const nDays = Number(everyNDays);

    if (isInterval) {
      if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
        return fail('Choose an interval between 1 minute and 24 hours.');
      }
      // Server rule: minute intervals only go to a hand-picked list of accounts.
      if (intervalMinutes < 60 && (emails.length < 1 || emails.length > 50)) {
        return fail('Minute intervals need 1 to 50 account emails under "Only these accounts".');
      }
    } else {
      if (times.length === 0) return fail('Add at least one send time.');
      if (repeatType === 'every_n_days' && (!Number.isInteger(nDays) || nDays < 2 || nDays > 30)) {
        return fail('Every how many days? Enter 2 to 30.');
      }
      if (repeatType === 'specific_day' && days.length === 0) return fail('Pick at least one day.');
    }

    const nextSendAt = isInterval
      ? new Date(Math.max(Date.now(), startsIso ? Date.parse(startsIso) : 0))
      : nextLocalSend(repeatType, days, nDays, times, editingBroadcast?.created_at, startsIso) || new Date();

    const broadcastData = {
      channel,
      title: title.trim(),
      message: channel === 'email' ? message : message.trim(),
      target_countries: selectedCountries.length > 0 ? selectedCountries : null,
      repeat_type: repeatType,
      every_n_days: repeatType === 'every_n_days' ? nDays : null,
      specific_days: repeatType === 'specific_day' ? days : null,
      specific_day: repeatType === 'specific_day' ? days[0] : null,
      send_times: isInterval ? null : times,
      time_to_send: isInterval ? editingBroadcast?.time_to_send || '00:00' : times[0],
      is_active: isActive,
      interval_minutes: isInterval ? intervalMinutes : null,
      starts_at: startsIso,
      ends_at: endsIso,
      audience,
      recipient_emails: emails.length > 0 ? emails : null,
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
      const detail = String((error as { message?: string } | null)?.message || '');
      toast({
        title: 'Error',
        // Temporary guard (20261008000100_one_send_time_until_scheduler_deployed.sql).
        description: detail.includes('one_send_time_tmp')
          ? 'Several send times a day turn on once the scheduler update is deployed - use one time for now.'
          : 'Failed to save scheduled broadcast',
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
        return 'Every day';
      case 'every_2_days':
        return 'Every 2 days';
      case 'every_n_days':
        return `Every ${broadcast.every_n_days} days`;
      case 'weekends':
        return 'Weekends';
      case 'weekdays':
        return 'Weekdays';
      case 'specific_day':
        return `Every ${weekOrder(scheduleDays(broadcast)).map((d) => WEEK.find(([w]) => w === d)?.[1]).join(', ')}`;
      case 'interval':
        return `Every ${formatInterval(broadcast.interval_minutes || 0)}`;
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
                Recurring push notifications and emails, sent at each person's local time
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
                      {broadcast.repeat_type !== 'interval' ? (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{scheduleTimes(broadcast).join(' & ')} their local time</span>
                        </div>
                      ) : !(broadcast.recipient_emails && broadcast.recipient_emails.length > 0) && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Skips 10pm-8am their local time</span>
                        </div>
                      )}
                      {broadcast.audience && broadcast.audience !== 'all' && (
                        <Badge variant="outline" className="text-xs bg-amber-50">
                          {broadcast.audience === 'free' ? 'Free users only' : 'Premium users only'}
                        </Badge>
                      )}
                      {broadcast.recipient_emails && broadcast.recipient_emails.length > 0 && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-blue-50"
                          title={broadcast.recipient_emails.join(', ')}
                        >
                          Only {broadcast.recipient_emails.length} accounts
                        </Badge>
                      )}
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
                      {broadcast.is_active && broadcast.repeat_type === 'interval' && (
                        <p>
                          Next send:{' '}
                          {broadcast.next_send_at ? new Date(broadcast.next_send_at).toLocaleTimeString() : 'within a minute'}
                        </p>
                      )}
                      {broadcast.is_active && broadcast.repeat_type !== 'interval' && (() => {
                        const next = nextLocalSend(
                          broadcast.repeat_type,
                          scheduleDays(broadcast),
                          broadcast.every_n_days || 2,
                          scheduleTimes(broadcast),
                          broadcast.created_at,
                          broadcast.starts_at,
                        );
                        return next ? (
                          <p>
                            Next send:{' '}
                            {next.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} at{' '}
                            {next.toTimeString().slice(0, 5)} (each person's local time)
                          </p>
                        ) : null;
                      })()}
                      <p>
                        Last sent: {broadcast.last_sent_at ? new Date(broadcast.last_sent_at).toLocaleString() : 'Never'}
                      </p>
                      {broadcast.starts_at && new Date(broadcast.starts_at) > new Date() && (
                        <p>Starts: {new Date(broadcast.starts_at).toLocaleString()}</p>
                      )}
                      {broadcast.ends_at && (
                        <p>
                          {new Date(broadcast.ends_at) > new Date() ? 'Ends' : 'Ended'}:{' '}
                          {new Date(broadcast.ends_at).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => toggleActive(broadcast)}
                        className="h-7 w-7"
                        title={broadcast.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {broadcast.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openEditDialog(broadcast)}
                        className="h-7 w-7"
                        title="Edit"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => sendNow(broadcast)}
                        disabled={sendingNowId === broadcast.id}
                        className="h-7 w-7"
                        title="Send now"
                      >
                        {sendingNowId === broadcast.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => duplicateBroadcast(broadcast)}
                        className="h-7 w-7"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => deleteBroadcast(broadcast.id)}
                        className="h-7 w-7 text-red-600 hover:text-red-700"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="every_n_days">Every few days</SelectItem>
                  <SelectItem value="weekdays">Weekdays (Mon-Fri)</SelectItem>
                  <SelectItem value="weekends">Weekends (Sat-Sun)</SelectItem>
                  <SelectItem value="specific_day">Specific days of the week</SelectItem>
                  <SelectItem value="interval">Every few minutes or hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {repeatType === 'every_n_days' && (
              <div className="space-y-2">
                <Label htmlFor="every-n-days">Every how many days? *</Label>
                <Input
                  id="every-n-days"
                  type="number"
                  min={2}
                  max={30}
                  value={everyNDays}
                  onChange={(e) => setEveryNDays(e.target.value)}
                  className="w-28"
                />
              </div>
            )}

            {repeatType === 'specific_day' && (
              <div className="space-y-2">
                <Label>Days of the week *</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEK.map(([day, label]) => {
                    const selected = specificDays.includes(day);
                    return (
                      <Button
                        key={day}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleDay(day)}
                        className={`h-8 px-3 text-xs ${
                          selected ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700 hover:text-white' : ''
                        }`}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {repeatType === 'interval' ? (
              <div className="space-y-2">
                <Label htmlFor="interval">Send every *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="interval"
                    type="number"
                    min={1}
                    max={intervalUnit === 'hours' ? 24 : 1440}
                    value={intervalValue}
                    onChange={(e) => setIntervalValue(e.target.value)}
                    className="w-28"
                  />
                  <Select value={intervalUnit} onValueChange={(v) => setIntervalUnit(v as 'minutes' | 'hours')}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-gray-500">
                  {intervalUnit === 'minutes'
                    ? 'Minute intervals are for testing: they only go to the accounts listed below (up to 50).'
                    : "Repeats around the clock from when the schedule starts, skipping anyone whose local time is 10pm-8am. Listed accounts get every send."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Send times (each person's local time) *</Label>
                <div className="space-y-2">
                  {sendTimes.map((time, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={time}
                        onChange={(e) => updateSendTime(index, e.target.value)}
                        className="w-36"
                      />
                      {sendTimes.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSendTime(index)}
                          className="h-8 w-8"
                          title="Remove this time"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {sendTimes.length < MAX_SEND_TIMES && (
                  <Button type="button" variant="outline" size="sm" onClick={addSendTime} className="h-7 text-xs">
                    <Plus className="w-3 h-3 mr-1" />
                    Add another time
                  </Button>
                )}
                <p className="text-xs text-gray-500">
                  Spread the day's messages out - for example 09:00 in the morning and 19:00 in the evening. Everyone
                  gets them at these times in their own time zone.
                </p>
                {channel === 'email' && (
                  <p className="text-xs text-amber-600">
                    Our Gmail sending accounts can send about 450 emails a day each. Anyone we can't reach within
                    4 hours of their time is skipped for that send rather than emailed late.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as 'all' | 'free' | 'premium')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  <SelectItem value="free">Free users only</SelectItem>
                  <SelectItem value="premium">Premium users only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipients">
                Only these accounts {repeatType === 'interval' && intervalUnit === 'minutes' ? '*' : '(optional)'}
              </Label>
              <Textarea
                id="recipients"
                value={recipientEmails}
                onChange={(e) => setRecipientEmails(e.target.value)}
                placeholder="One email per line. Leave empty to send to everyone who matches."
                rows={4}
              />
              <p className="text-xs text-gray-500">
                {recipientEmails.trim()
                  ? 'Only these accounts get it (still filtered by audience and countries).'
                  : 'Empty: everyone who matches the audience and countries.'}
              </p>
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

            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="starts-at">Start (optional)</Label>
                  <Input
                    id="starts-at"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ends-at">End (optional)</Label>
                  <Input
                    id="ends-at"
                    type="datetime-local"
                    value={endsAt}
                    min={startsAt || undefined}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Nothing goes out before the start, and the schedule turns itself off at the end. These are in your
                time zone.
              </p>
            </div>

            {preview !== null && (
              <div className="p-3 rounded-md border bg-gray-50 text-xs text-gray-700">
                <p className="font-medium mb-0.5">Who gets this</p>
                {preview === undefined ? (
                  <p className="text-gray-500">Counting...</p>
                ) : preview.matched === 0 ? (
                  <p>Nobody matches these settings right now.</p>
                ) : (
                  <p>
                    {preview.matched} {preview.matched === 1 ? 'person matches' : 'people match'} right now:{' '}
                    {channel === 'email'
                      ? `${preview.by_email} by email`
                      : `${preview.by_push} by push, ${preview.by_email} by email instead`}
                    {preview.unreachable > 0 &&
                      `, ${preview.unreachable} can't be reached${
                        channel === 'push' && recipientEmails.trim() ? ' (in-app inbox only)' : ''
                      }`}
                    .
                  </p>
                )}
              </div>
            )}

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
            <Button size="sm" variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} className="bg-purple-600 hover:bg-purple-700">
              {editingBroadcast ? 'Update Schedule' : 'Create Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
