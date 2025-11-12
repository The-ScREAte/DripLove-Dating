
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

    setIsBlocking(true);
    try {
      // First verify the user exists in profiles
      const { data: profileExists, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userToBlock.id)
        .single();

      if (checkError || !profileExists) {
        toast({
          title: t('chat.error'),
          description: 'This user account no longer exists.',
          variant: "destructive",
        });
        setIsBlocking(false);
        onClose();
        return;
      }

      const { error } = await supabase
        .from('blocks')
        .insert({
          blocker_id: currentUserId,
          blocked_id: userToBlock.id,
          reason: reason.trim() || null
        });

      if (error) throw error;

      toast({
        title: t('block.blocked'),
        description: t('block.blockedDesc', { name: userToBlock.first_name }),
      });

      onBlockSuccess();
      onClose();
      setReason('');
    } catch (error) {
      console.error('Error blocking user:', error);
      toast({
        title: t('chat.error'),
        description: t('block.errorFailed'),
        variant: "destructive",
      });
    } finally {
      setIsBlocking(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('block.title', { name: `${userToBlock?.first_name} ${userToBlock?.last_name}` })}
          </DialogTitle>
          <DialogDescription>
            {t('block.description')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="reason">{t('block.reasonOptional')}</Label>
            <Textarea
              id="reason"
              placeholder={t('block.placeholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isBlocking}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleBlock} 
            disabled={isBlocking}
            className="bg-red-500 hover:bg-red-600"
          >
            {isBlocking ? t('block.blocking') : t('block.blockUser')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BlockDialog;
