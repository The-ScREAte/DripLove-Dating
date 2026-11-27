import React from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import { useBackClose } from '@/utils/backStack';
interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  deleteType: 'me' | 'everyone';
}

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  deleteType
}) => {
  const { t } = useTranslation();
  // Android hardware back closes the dialog (hook must run before the early return below).
  useBackClose(isOpen, onClose);
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-black border border-pink-500/30 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] w-64 p-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-gray-100 mb-3 text-center">
          {t('deleteMessage.confirmTitle')}
        </p>

        <div className="flex gap-2">
          <Button variant="line" size="md" className="flex-1 text-white"
            onClick={onClose}
           
          >
            {t('deleteMessage.cancel')}
          </Button>
          <Button variant="danger" size="md" className="flex-1"
            onClick={handleConfirm}
           
          >
            {t('deleteMessage.delete')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmDialog;
