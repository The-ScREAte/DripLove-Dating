import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reporterId: string;
  reportedUserId: string;
  messageId?: string;
  onReportSuccess?: () => void;
}

const REASONS = [
  'Spam',
  'Nudity',
  'Abuse',
  'Hate',
  'Harassment',
  'Fake Profile',
  'Other',
];

const ReportDialog: React.FC<ReportDialogProps> = ({ isOpen, onClose, reporterId, reportedUserId, messageId, onReportSuccess }) => {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const { toast } = useToast();

  const handleReport = async () => {
    if (!reason) return;
    if (!reporterId) {
      toast({ title: 'Error', description: 'Reporter id missing. Please sign in.', variant: 'destructive' });
      return;
    }
    if (!reportedUserId) {
      toast({ title: 'Error', description: 'Reported user id missing.', variant: 'destructive' });
      return;
    }
    // allow reporting even if there's no specific message id (chat_id will be null)

    setIsReporting(true);
    try {
      const { error } = await supabase.from('reported_chats').insert({
        reporter_id: reporterId,
        reported_user_id: reportedUserId,
        // DB requires a non-null chat_id (schema enforces NOT NULL). Use empty string when messageId is absent.
        chat_id: messageId || '',
        reason: reason.trim(),
        description: description.trim() || null,
      });

      if (error) throw error;

      toast({ title: 'Report submitted', description: 'Thank you for helping keep the community safe.' });
      setReason('');
      setDescription('');
      onReportSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error submitting report:', err);
      toast({ title: 'Error', description: err?.message || 'Failed to submit report', variant: 'destructive' });
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report</DialogTitle>
          <DialogDescription>
            Please select a reason and provide any details to help our moderation team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label>Reason</Label>
            <select
              className="w-full border rounded p-2 mt-1"
              value={reason}
              onChange={e => setReason(e.target.value)}
            >
              <option value="">Select reason</option>
              {REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Details (optional)</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add more info (optional)"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isReporting}>Cancel</Button>
          <Button onClick={handleReport} disabled={!reason || isReporting} className="bg-red-500 hover:bg-red-600">
            {isReporting ? 'Reporting...' : 'Submit Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
