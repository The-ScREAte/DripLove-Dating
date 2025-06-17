
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  const [reason, setReason] = useState('');
  const [isBlocking, setIsBlocking] = useState(false);
  const { toast } = useToast();

  const handleBlock = async () => {
    if (!userToBlock) return;

    setIsBlocking(true);
    try {
      const { error } = await supabase
        .from('blocks')
        .insert({
          blocker_id: currentUserId,
          blocked_id: userToBlock.id,
          reason: reason.trim() || null
        });

      if (error) throw error;

      toast({
        title: "User blocked",
        description: `${userToBlock.first_name} has been blocked`,
      });

      onBlockSuccess();
      onClose();
      setReason('');
    } catch (error) {
      console.error('Error blocking user:', error);
      toast({
        title: "Error",
        description: "Failed to block user",
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
            Block {userToBlock?.first_name} {userToBlock?.last_name}?
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This user will no longer be able to see your profile or contact you. 
            You won't see them in your discover feed either.
          </p>
          
          <div>
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder="Tell us why you're blocking this user..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isBlocking}>
            Cancel
          </Button>
          <Button 
            onClick={handleBlock} 
            disabled={isBlocking}
            className="bg-red-500 hover:bg-red-600"
          >
            {isBlocking ? 'Blocking...' : 'Block User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BlockDialog;
