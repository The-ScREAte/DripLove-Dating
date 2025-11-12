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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('chat.deleteChatTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('chat.deleteChatConfirm', { name: matchName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('chat.cancel')}</AlertDialogCancel>
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
