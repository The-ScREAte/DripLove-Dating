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
}

// Read-only view onto email_suppression_list (populated automatically by
// send-broadcast-email-smtp / process-email-queue whenever an address hard-
// bounces - see 20260825111113_email_suppression_list.sql) plus a manual
// "Retry" action for the rare case an address was fixed or wrongly
// suppressed. Every future broadcast already skips these addresses on its
// own; this is purely visibility + a manual override, not what enforces it.
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
        .select('email, reason, last_error, created_at')
        // Released entries (wrongly blocked by our own sending limit) are
        // kept for the record but no longer block anyone.
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
      toast({ title: 'Removed', description: `${email} will be included in future broadcasts again.` });
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
            {entries.length} excluded
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
          Addresses that permanently failed (invalid or non-existent mailbox) on a past broadcast. These are
          skipped automatically on every future send - this list is just visibility, plus a manual retry if one
          was fixed or wrongly excluded.
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
            <p className="text-gray-500 text-xs">{entries.length === 0 ? 'No excluded addresses' : 'No matches'}</p>
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
                      {entry.last_error || entry.reason} · {new Date(entry.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRetry(entry.email)}
                    disabled={removingEmail === entry.email}
                    className="h-6 text-[10px] px-2 text-purple-600 hover:bg-purple-50 shrink-0"
                    title="Remove from suppression list so future broadcasts try it again"
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
