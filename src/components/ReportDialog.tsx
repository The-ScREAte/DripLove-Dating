import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

import { useBackClose } from '@/utils/backStack';
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
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const { toast } = useToast();
  // Android hardware back closes the dialog (Radix already handles Escape).
  useBackClose(isOpen, onClose, { escape: false });

  const handleReport = async () => {
    if (!reason) return;
    if (!reporterId) {
      toast({ title: t('chat.error'), description: t('report.errorMissingReporter'), variant: 'destructive' });
      return;
    }
    if (!reportedUserId) {
      toast({ title: t('chat.error'), description: t('report.errorMissingReported'), variant: 'destructive' });
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

      toast({ title: t('report.submitted'), description: t('report.submittedDesc') });
      setReason('');
      setDescription('');
      onReportSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error submitting report:', err);
      toast({ title: t('chat.error'), description: err?.message || t('report.errorFailed'), variant: 'destructive' });
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black border border-pink-500/50 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">{t('report.title')}</DialogTitle>
          <DialogDescription className="text-gray-300">
            {t('report.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-gray-300">{t('report.reason')}</Label>
            <select
              className="w-full border border-pink-500/40 rounded p-2 mt-1 bg-neutral-900 text-white"
              value={reason}
              onChange={e => setReason(e.target.value)}
            >
              <option value="">{t('report.selectReason')}</option>
              {REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-gray-300">{t('report.detailsOptional')}</Label>
            <Textarea tone="dark"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('report.addMoreInfo')}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="flex-row justify-end gap-2 space-x-0">
          <Button variant="line" size="md" className="text-white flex-1" onClick={onClose} disabled={isReporting}>{t('common.cancel')}</Button>
          <Button variant="danger" size="md" className="flex-1" onClick={handleReport} disabled={!reason || isReporting}>
            {isReporting ? t('report.reporting') : t('report.submitReport')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
