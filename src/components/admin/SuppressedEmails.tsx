import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldOff, RotateCw, Trash2, Search } from 'lucide-react';

interface SuppressedEmail {
  email: string;
  reason: string;
  last_error: string | null;
  created_at: string;
  failure_count: number;
  next_check_at: string | null;
}

const REASON_LABELS: Record<string, string> = {
  hard_bounce: 'Address not found',
  mailbox_unavailable: 'Mailbox unavailable',
  rejected: 'Refused by their mail server',
  undeliverable: 'Could not be delivered',
  unsubscribed: 'Unsubscribed',
};

const nextCheckLabel = (entry: SuppressedEmail): string => {
  if (entry.reason === 'unsubscribed') return 'never emailed again';
  if (!entry.next_check_at) return 'check pending';
  const when = new Date(entry.next_check_at);
  return when.getTime() <= Date.now() ? 'checking now' : `next check ${when.toLocaleString()}`;
};

// View onto email_suppression_list. Addresses land here automatically when an
// email to them fails or bounces back (process-email-queue,
// process-email-bounces); their emails wait on hold, the address is checked
// again on its own (email-sender-health-check) and released once it works -
// see 20261006100000_email_send_now_hold_and_release.sql. "Retry" releases
// one straight away. Unsubscribes stay until someone releases them here.
export default function SuppressedEmails() {
  const [entries, setEntries] = useState<SuppressedEmail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const { toast } = useToast();

  const loadEntries = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_suppression_list')
        .select('email, reason, last_error, created_at, failure_count, next_check_at')
        // Released entries are kept for the record but no longer block anyone.
        .is('released_at', null)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error loading suppressed emails:', error);
      toast({ title: 'Error', description: 'Failed to load suppressed emails', variant: 'destructive' });
    } finally {
      if (!opts?.silent) setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleRetry = async (email: string) => {
    setRemovingEmail(email);
    try {
      const { error } = await supabase.rpc('remove_email_suppression', { target_email: email });
      if (error) throw error;
      setEntries((prev) => prev.filter((e) => e.email !== email));
      toast({ title: 'Released', description: `${email} is back in the queue - its waiting emails are going out now.` });
    } catch (error) {
      console.error('Error removing suppression:', error);
      toast({ title: 'Error', description: 'Failed to remove from suppression list', variant: 'destructive' });
    } finally {
      setRemovingEmail(null);
    }
  };

  const filtered = entries.filter((e) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return e.email.toLowerCase().includes(q) || (e.last_error || '').toLowerCase().includes(q);
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <ShieldOff className="w-3.5 h-3.5" />
            {entries.length} on hold
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadEntries()}
            disabled={isLoading}
            className="h-6 text-[11px] px-2"
          >
            <RotateCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <p className="text-[10px] text-gray-500 mt-1">
          Addresses whose emails failed or bounced back. Their emails wait here and each address is checked
          again automatically - once it works, it's released and everything waiting goes out. Retry releases
          one now. Unsubscribed addresses are never emailed unless released here.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by email or error..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-xs h-7 pl-7"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <ShieldOff className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500 text-xs">{entries.length === 0 ? 'No addresses on hold' : 'No matches'}</p>
          </div>
        ) : (
          <ScrollArea className="h-[420px]">
            <div className="space-y-1 pr-3">
              {filtered.map((entry) => (
                <div
                  key={entry.email}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-gray-200 hover:border-gray-300"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[11px] truncate">{entry.email}</div>
                    <div className="text-[9px] text-gray-500 truncate">
                      {REASON_LABELS[entry.reason] || entry.reason}
                      {entry.failure_count > 1 ? ` · failed ${entry.failure_count}x` : ''} · {nextCheckLabel(entry)}
                    </div>
                    <div className="text-[9px] text-gray-400 truncate" title={entry.last_error || ''}>
                      {entry.last_error || '-'} · since {new Date(entry.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRetry(entry.email)}
                    disabled={removingEmail === entry.email}
                    className="h-6 text-[10px] px-2 text-purple-600 hover:bg-purple-50 shrink-0"
                    title="Release now - its waiting emails go back in the queue"
                  >
                    {removingEmail === entry.email ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-3 h-3 mr-1" />
                        Retry
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
