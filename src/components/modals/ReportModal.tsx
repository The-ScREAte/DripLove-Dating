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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-auto" 
        onClick={e => e.stopPropagation()}
        style={{
          minHeight: '350px',
          maxHeight: '90vh',
          width: '100%',
          maxWidth: '400px',
          overflow: 'hidden',
          willChange: 'auto',
          backfaceVisibility: 'hidden'
        }}
      >
        {/* Modal header with close button */}
        <div className="relative p-6 pb-2">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
            disabled={reporting}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          <h3 className="text-xl font-bold text-red-600 pr-8">Report Image</h3>
        </div>

        {/* Modal content */}
        <div className="px-6 pb-6 max-h-96 overflow-y-auto">
          {reportSuccess ? (
            <div className="text-green-600 font-semibold text-center py-8">
              <div className="mb-2 text-2xl">✓</div>
              <div>Reported! Thank you.</div>
            </div>
          ) : (
            <>
              <p className="text-gray-700 mb-4 text-sm font-semibold">Please select a reason for reporting this image:</p>
              
              {/* Reason selection with stable layout */}
              <div className="space-y-3 mb-6">
                {reportReasons.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setSelectedReason(reason)}
                    disabled={reporting}
                    className={`w-full h-12 px-4 text-left rounded-lg border-2 transition-all duration-200 flex items-center justify-between ${
                      selectedReason === reason
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                    } ${reporting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className="text-sm font-medium flex-1 pr-2">{reason}</span>
                    {selectedReason === reason && (
                      <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {/* Action buttons with stable height */}
              <div className="space-y-3">
                <button
                  className="w-full h-12 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  onClick={handleReportSubmit}
                  disabled={reporting || !selectedReason}
                >
                  {reporting ? 'Reporting...' : 'Report Image'}
                </button>
                
                <button
                  className="w-full h-12 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  onClick={onClose}
                  disabled={reporting}
                >
                  Cancel
                </button>
              </div>
              
              {reportError && (
                <div className="text-red-500 text-sm mt-4 text-center bg-red-50 p-3 rounded-lg border border-red-200">
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