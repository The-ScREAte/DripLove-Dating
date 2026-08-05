
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

interface BlockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userToBlock: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  currentUserId: string;
  onBlockSuccess: () => void;
}

const BlockDialog = ({ isOpen, onClose, userToBlock, currentUserId, onBlockSuccess }: BlockDialogProps) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [isBlocking, setIsBlocking] = useState(false);
  const { toast } = useToast();

  const handleBlock = async () => {
    if (!userToBlock) return;
    
    // Validate we're not trying to block ourselves
    if (currentUserId === userToBlock.id) {
      toast({
        title: t('chat.error'),
        description: 'Cannot block yourself',
        variant: "destructive",
      });
      return;
    }

    setIsBlocking(true);
    try {
      const { error } = await supabase
        .from('blocks')
        .insert({
          blocker_id: currentUserId,
          blocked_id: userToBlock.id,
          reason: reason.trim() || null
        });

      if (error) {
        console.error('Error blocking user:', error);
        throw error;
      }

      toast({
        title: t('block.blocked'),
        description: t('block.blockedDesc', { name: userToBlock.first_name }),
      });

      onBlockSuccess();
      onClose();
      setReason('');
    } catch (error: any) {
      console.error('Error blocking user:', error);
      toast({
        title: t('chat.error'),
        description: error?.message || t('block.errorFailed'),
        variant: "destructive",
      });
    } finally {
      setIsBlocking(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black border border-pink-500/50 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">
            {t('block.title', { name: `${userToBlock?.first_name} ${userToBlock?.last_name}` })}
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            {t('block.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="reason" className="text-gray-300">{t('block.reasonOptional')}</Label>
            <Textarea
              id="reason"
              placeholder={t('block.placeholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 bg-neutral-900 border-pink-500/40 text-white placeholder:text-gray-500"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isBlocking} className="border-pink-500/40 text-gray-100 hover:bg-neutral-800 hover:text-white">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleBlock}
            disabled={isBlocking}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            {isBlocking ? t('block.blocking') : t('block.blockUser')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BlockDialog;
