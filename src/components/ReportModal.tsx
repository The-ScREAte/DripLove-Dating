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
  contentType: 'profile' | 'message' | 'image';
  contentId?: string;
}

const ReportModal: React.FC<ReportModalProps> = ({ open, onClose, reporterId, reportedUserId, contentType, contentId }) => {
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
    setLoading(true);
    let error: any = null;
    if (contentType === 'message') {
      // Basic validation to avoid bad inserts
      if (!contentId) {
        setLoading(false);
        toast({ title: 'Error', description: 'Message id missing. Cannot report.', variant: 'destructive' });
        return;
      }
      if (!reporterId) {
        setLoading(false);
        toast({ title: 'Error', description: 'Reporter id missing. Please sign in.', variant: 'destructive' });
        return;
      }
      // Save chat reports to the new reported_chats table
      const insertRes = await supabase.from('reported_chats').insert({
        reporter_id: reporterId,
        reported_user_id: reportedUserId,
        chat_id: contentId,
        reason,
        description
      });
      console.debug('reported_chats insert response:', insertRes);
      error = insertRes.error;

      // Immediately verify the row exists (helpful for debugging RLS/type issues)
      if (!error) {
        try {
          const { data: verifyRows, error: verifyErr } = await supabase
            .from('reported_chats')
            .select('*')
            .eq('reporter_id', reporterId)
            .eq('chat_id', contentId)
            .order('created_at', { ascending: false })
            .limit(1);

          console.debug('reported_chats verify response:', { verifyRows, verifyErr });
          if (verifyErr) {
            console.error('Error verifying reported_chats row:', verifyErr);
            toast({ title: 'Warning', description: 'Report may not have been saved: verification query failed.', variant: 'destructive' });
            alert('Report submitted but verification query failed. Check console for details.');
          } else if (!verifyRows || verifyRows.length === 0) {
            console.error('Insert returned OK but no row found for reported_chats');
            toast({ title: 'Warning', description: 'Report submitted but not found in DB. Check policies/IDs.', variant: 'destructive' });
            alert('Report submitted, but no row found in reported_chats. Please check DB policies or console logs.');
          } else {
            // Successful insert + verify
            const saved = verifyRows[0];
            alert('Report saved successfully. Report id: ' + (saved.id || '(no id)'));
          }
        } catch (vErr) {
          console.error('Verification query threw error:', vErr);
          alert('Report submitted but verification threw an error. Check console.');
        }
      }
    } else {
      // Fallback for profile/image reports — keep existing behavior
      const res = await supabase.from('admin_actions').insert({
        action_type: 'report',
        target_user_id: reportedUserId,
        details: {
          reporter_id: reporterId,
          content_type: contentType,
          content_id: contentId,
          reason,
          description,
        }
      });
      console.debug('admin_actions insert response:', res);
      error = res.error;
    }
    setLoading(false);
    if (error) {
      console.error('Report insert error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to submit report', variant: 'destructive' });
    } else {
      toast({ title: 'Report submitted', description: 'Thank you for helping keep the community safe.' });
      setReason('');
      setDescription('');
      onClose();
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
