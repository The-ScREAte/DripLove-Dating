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

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="bg-black border border-pink-500/30 shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{t('chat.deleteChatTitle')}</AlertDialogTitle>
          <AlertDialogDescription className="text-gray-300">
            {t('chat.deleteChatConfirm', { name: matchName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-black border border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white">{t('chat.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            {t('chat.deleteChat')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteChatDialog;
