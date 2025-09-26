import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const REASONS = [
  'Spam',
  'Nudity',
  'Abuse',
  'Hate',
  'Harassment',
  'Fake Profile',
  'Other',
];

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  reporterId: string;
  reportedUserId: string;
  contentId?: string;
}

const ReportModal: React.FC<ReportModalProps> = ({ open, onClose, reporterId, reportedUserId, contentId }) => {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
    return;
  }, [open]);

  const handleSubmit = async () => {
    if (!reason) return;

    if (!reporterId) {
      toast({ title: 'Error', description: 'Reporter id missing. Please sign in.', variant: 'destructive' });
      return;
    }

    if (!reportedUserId) {
      toast({ title: 'Error', description: 'Reported user id missing.', variant: 'destructive' });
      return;
    }

    if (!contentId) {
      toast({ title: 'Error', description: 'Message id missing. Cannot report.', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from('reported_chats').insert({
        reporter_id: reporterId,
        reported_user_id: reportedUserId,
        chat_id: contentId,
        reason: reason.trim(),
        description: description.trim() ? description.trim() : null,
      });

      if (error) {
        throw error;
      }

      toast({ title: 'Report submitted', description: 'Thank you for helping keep the community safe.' });
      setReason('');
      setDescription('');
      onClose();
    } catch (error: any) {
      console.error('Error submitting report:', error);
      toast({ title: 'Error', description: error.message || 'Failed to submit report', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
        <h3 className="font-semibold mb-2">Report</h3>
        <label className="block mb-2 text-sm">Reason</label>
        <select
          className="w-full border rounded p-2 mb-3"
          value={reason}
          onChange={e => setReason(e.target.value)}
        >
          <option value="">Select reason</option>
          {REASONS.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <label className="block mb-2 text-sm">Details (optional)</label>
        <textarea
          className="w-full border rounded p-2 mb-3"
          rows={4}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Add more info (optional)"
        />
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!reason || loading}>
            {loading ? 'Reporting...' : 'Submit'}
          </Button>
        </div>
      </div>
    </div>, document.body
  );
};

export default ReportModal;
