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
      <div className="bg-white rounded-xl shadow-xl w-64 p-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-gray-700 mb-3 text-center">
          {t('deleteMessage.confirmTitle')}
        </p>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            {t('deleteMessage.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t('deleteMessage.delete')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmDialog;
