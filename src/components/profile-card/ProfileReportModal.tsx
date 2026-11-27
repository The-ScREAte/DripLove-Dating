import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBackClose } from '@/utils/backStack';
import type { ProfileReportApi } from './useProfileReport';

// One tone per reason (same order as REPORT_REASON_KEYS).
const REASON_TONES = [
  'border-rose-500 bg-rose-950/50 text-rose-300 ring-1 ring-rose-500/30',
  'border-orange-500 bg-orange-950/50 text-orange-300 ring-1 ring-orange-500/30',
  'border-amber-500 bg-amber-950/50 text-amber-300 ring-1 ring-amber-500/30',
  'border-fuchsia-500 bg-fuchsia-950/50 text-fuchsia-300 ring-1 ring-fuchsia-500/30',
  'border-red-500 bg-red-950/50 text-red-300 ring-1 ring-red-500/30',
  'border-slate-400 bg-slate-800/60 text-slate-200 ring-1 ring-slate-500/30',
];

/**
 * The report / block dialog, identical on Discover, Liked Me and the preview.
 * Portaled to <body>: callers live inside swipeable cards that carry a live
 * transform, and a transformed ancestor would otherwise become the containing
 * block of this `position: fixed` overlay and drag it along with the card.
 */
export const ProfileReportModal: React.FC<{
  report: ProfileReportApi;
  /** Hide the block option (e.g. a read-only preview that can only report). */
  allowBlock?: boolean;
}> = ({ report, allowBlock = true }) => {
  const { t } = useTranslation();
  // Android back / Escape closes the dialog before anything underneath reacts.
  useBackClose(report.isOpen, report.close);
  if (!report.isOpen) return null;

  const busy = report.reporting || report.isBlocking;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[9999] flex touch-none select-none items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={report.close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('reportModal.title')}
        className="mx-auto flex max-h-[85dvh] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-brand/30 bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-brand/20 bg-black px-3 pb-2 pt-3">
          <button
            type="button"
            onClick={report.close}
            disabled={report.reporting}
            aria-label={t('common.close', 'Close')}
            className="dl-hit absolute right-2 top-2 flex h-6 min-h-0 w-6 items-center justify-center rounded-full border border-brand/20 bg-white/10 text-gray-400 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="pr-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-400">
              {t('reportModal.safetyCenter', 'Safety Center')}
            </p>
            <h3 className="mt-0.5 text-base font-bold text-white">{t('reportModal.title')}</h3>
            <p className="mt-0.5 text-[11px] text-gray-300">{t('reportModal.instruction')}</p>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
          {report.isBlockSuccess ? (
            <div className="py-6 text-center">
              <div className="font-semibold text-green-400">
                <div className="mb-2 text-3xl" aria-hidden="true">🚫</div>
                <div className="mb-2 text-lg">{t('reportModal.blockSuccess.title')}</div>
                <div className="text-sm text-gray-300">{t('reportModal.blockSuccess.message')}</div>
              </div>
              <Button variant="secondary" size="md" className="mt-4" onClick={report.undoBlock} disabled={report.isUndoingBlock}>
                {report.isUndoingBlock ? t('reportModal.blockSuccess.undoing') : t('reportModal.blockSuccess.undo')}
              </Button>
            </div>
          ) : report.reportSuccess ? (
            <div className="py-8 text-center font-semibold text-green-400">
              <div className="mb-2 text-2xl" aria-hidden="true">✓</div>
              <div>{t('reportModal.success')}</div>
            </div>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {report.reasons.map((reason, index) => {
                  const selected = report.selectedReason === reason;
                  return (
                    <button
                      key={reason}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => report.setSelectedReason(reason)}
                      disabled={busy}
                      className={cn(
                        'flex min-h-11 w-full items-center justify-between rounded-lg border-2 px-2.5 py-1.5 text-left transition-all duration-200',
                        selected
                          ? REASON_TONES[index % REASON_TONES.length]
                          : 'border-brand/20 bg-black/60 text-gray-200 hover:border-brand/40 hover:bg-white/5',
                        busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                      )}
                    >
                      <span className="flex-1 break-words pr-1 text-xs font-semibold leading-tight sm:text-sm">{reason}</span>
                      {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>

              {allowBlock && (
                <div className="mb-3 rounded-lg border border-brand/20 bg-black/60 p-2.5">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-200">
                    {t('reportModal.blockSection.title')}
                  </p>
                  <textarea
                    placeholder={t('reportModal.blockSection.placeholder')}
                    value={report.blockReason}
                    onChange={(e) => report.setBlockReason(e.target.value)}
                    disabled={busy}
                    rows={2}
                    className="w-full resize-none rounded-lg border border-brand/30 bg-black/40 p-2 text-base text-white placeholder:text-gray-500 focus:border-brand/50 focus:ring-2 focus:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              )}

              <div className={cn('grid gap-1.5', allowBlock ? 'grid-cols-2' : 'grid-cols-1')}>
                <Button
                  variant="danger"
                  size="md"
                  className="w-full"
                  onClick={report.submitReport}
                  disabled={busy || !report.selectedReason}
                >
                  {report.reporting ? t('reportModal.reporting') : t('reportModal.reportButton')}
                </Button>
                {allowBlock && (
                  <Button
                    variant="danger"
                    size="md"
                    className="w-full"
                    onClick={report.blockUser}
                    disabled={busy || (!report.selectedReason && !report.blockReason.trim())}
                  >
                    {report.isBlocking ? t('reportModal.blockSection.blocking') : t('reportModal.blockSection.blockButton')}
                  </Button>
                )}
              </div>

              {report.reportError && (
                <div role="alert" className="mt-2 rounded-lg border border-red-500/30 bg-red-950/50 p-2 text-center text-xs text-red-300">
                  {report.reportError}
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
