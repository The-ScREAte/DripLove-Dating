import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';

interface VerifyIdentityPromptProps {
  open: boolean;
  onClose: () => void;
  // Takes the user to Profile with the Photos section expanded (showing the
  // "Verify Identity" card there), rather than jumping straight into the
  // camera capture flow.
  onVerifyNow?: () => void;
}

const VerifyIdentityPrompt = ({ open, onClose, onVerifyNow }: VerifyIdentityPromptProps) => {
  const handleVerifyNow = () => {
    onClose();
    onVerifyNow?.();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-sm bg-black border border-pink-500/30 text-white p-6 text-center">
        <DialogHeader>
          <div className="w-14 h-14 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
            <ShieldCheck className="w-7 h-7 text-purple-400" />
          </div>
          <DialogTitle className="text-white text-center">Verify Your Identity</DialogTitle>
          <DialogDescription className="text-gray-300 text-center">
            Verified profiles get more matches and show others you're really you. It only takes a minute.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-2">
          <Button
            onClick={handleVerifyNow}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
          >
            Verify Now
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full text-gray-400 hover:text-white hover:bg-neutral-800"
          >
            Maybe Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VerifyIdentityPrompt;
