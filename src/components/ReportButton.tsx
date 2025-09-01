import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ReportButtonProps {
  reporterId: string;
  reportedUserId: string;
  contentType: 'profile' | 'message' | 'image';
  contentId?: string; // message id, image url, etc.
  className?: string;
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

const ReportButton: React.FC<ReportButtonProps> = ({
  reporterId,
  reportedUserId,
  contentType,
  contentId,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!reason) return;
    setLoading(true);
    const { error } = await supabase.from('admin_actions').insert({
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
    setLoading(false);
    setOpen(false);
    setReason('');
    setDescription('');
    if (error) {
      toast({ title: 'Error', description: 'Failed to submit report', variant: 'destructive' });
    } else {
      toast({ title: 'Report submitted', description: 'Thank you for helping keep the community safe.' });
    }
  };

  return (
    <div className={className}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Report
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-xs">
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
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add more info (optional)"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
              <Button size="sm" onClick={handleSubmit} disabled={!reason || loading}>
                {loading ? 'Reporting...' : 'Submit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportButton;
