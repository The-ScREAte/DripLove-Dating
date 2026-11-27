import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';

import { useBackClose } from '@/utils/backStack';
interface DeleteChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  matchName: string;
}

const DeleteChatDialog: React.FC<DeleteChatDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  matchName
}) => {
  const { t } = useTranslation();
  // Android hardware back closes the dialog.
  useBackClose(isOpen, onClose, { escape: false });

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="bg-black border border-pink-500/30 shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{t('chat.deleteChatTitle')}</AlertDialogTitle>
          <AlertDialogDescription className="text-gray-300">
            {t('chat.deleteChatConfirm', { name: matchName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-end gap-2 space-x-0">
          <AlertDialogCancel className="flex-1 mt-0">{t('chat.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="danger"
            onClick={onConfirm}
            className="flex-1"
          >
            {t('chat.deleteChat')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteChatDialog;
