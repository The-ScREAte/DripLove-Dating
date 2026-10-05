import React from 'react';
import { useTranslation } from 'react-i18next';

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
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t('deleteMessage.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full text-sm font-medium transition-colors"
          >
            {t('deleteMessage.delete')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmDialog;
