import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReport: (reason: string) => Promise<void>;
}

const reportReasons = [
  'Inappropriate content',
  'Fake profile',
  'Spam or scam',
  'Offensive language',
  'Harassment',
  'Other'
];

const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, onReport }) => {
  const [reporting, setReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState("");
  const [selectedReason, setSelectedReason] = useState("");

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setReporting(false);
      setReportSuccess(false);
      setReportError("");
      setSelectedReason("");
    }
  }, [isOpen]);

  // Close modal on escape key
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const handleReportSubmit = async () => {
    if (!selectedReason) {
      setReportError("Please select a reason for reporting");
      return;
    }

    setReporting(true);
    setReportError("");

    try {
      await onReport(selectedReason);
      setReportSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Failed to report. Please try again.");
    } finally {
      setReporting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 touch-none select-none" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        willChange: 'auto',
        backfaceVisibility: 'hidden',
        transform: 'translateZ(0)',
        pointerEvents: 'auto',
        touchAction: 'none',
        userSelect: 'none'
      }}
    >
      <div
        className="bg-black border border-pink-500/50 rounded-2xl shadow-2xl w-full max-w-sm mx-auto"
        onClick={e => e.stopPropagation()}
        style={{
          minHeight: '320px',
          maxHeight: '90vh',
          width: '100%',
          maxWidth: '400px',
          overflow: 'hidden',
          willChange: 'auto',
          backfaceVisibility: 'hidden'
        }}
      >
        {/* Modal header with close button */}
        <div className="relative px-4 pt-4 pb-1">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors rounded-full hover:bg-white/10"
            disabled={reporting}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h3 className="text-xl font-bold text-red-400 pr-8">Report Image</h3>
        </div>

        {/* Modal content */}
        <div className="px-4 pb-4 max-h-96 overflow-y-auto">
          {reportSuccess ? (
            <div className="text-green-400 font-semibold text-center py-8">
              <div className="mb-2 text-2xl">✓</div>
              <div>Reported! Thank you.</div>
            </div>
          ) : (
            <>
              <p className="text-gray-300 mb-3 text-sm font-semibold">Please select a reason for reporting this image:</p>

              {/* Reason selection with stable layout */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {reportReasons.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setSelectedReason(reason)}
                    disabled={reporting}
                    className={`w-full min-h-10 px-3 py-2 text-left rounded-lg border-2 transition-all duration-200 flex items-center justify-between ${
                      selectedReason === reason
                        ? 'border-red-500 bg-red-950/60 text-red-300'
                        : 'border-neutral-700 bg-neutral-900 text-gray-300 hover:border-neutral-500 hover:bg-neutral-800'
                    } ${reporting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className="text-xs sm:text-sm font-medium flex-1 pr-1 leading-tight">{reason}</span>
                    {selectedReason === reason && (
                      <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {/* Action buttons with stable height */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="w-full h-10 bg-red-500 hover:bg-red-600 text-white font-semibold text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  onClick={handleReportSubmit}
                  disabled={reporting || !selectedReason}
                >
                  {reporting ? 'Reporting...' : 'Report Image'}
                </button>

                <button
                  className="w-full h-10 bg-neutral-800 hover:bg-neutral-700 text-gray-100 font-semibold text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 border border-pink-500/30"
                  onClick={onClose}
                  disabled={reporting}
                >
                  Cancel
                </button>
              </div>

              {reportError && (
                <div className="text-red-300 text-sm mt-4 text-center bg-red-950/40 p-3 rounded-lg border border-red-500/40">
                  {reportError}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReportModal;