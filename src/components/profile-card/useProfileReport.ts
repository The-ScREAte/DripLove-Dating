import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseErrorMessage } from '@/lib/edgeFunctionError';
import { recordRatingNegative } from '@/rating/ratingMoments';

export interface UseProfileReportOptions {
  /** The profile being reported / blocked. */
  reportedUserId?: string | null;
  /** The photo the report refers to, read at submit time (e.g. the photo on screen). */
  getImageUrl: () => string | undefined;
  /** Fired once a block is final (undo window over, or dialog closed early). */
  onBlocked?: (userId: string) => void;
  /** Lets a parent pause gestures (e.g. swiping) while the dialog is open. */
  onOpenChange?: (open: boolean) => void;
  /** Freeze page scroll while open (Discover's fixed full-screen card needs this). */
  lockBodyScroll?: boolean;
}

export const REPORT_REASON_KEYS = ['inappropriate', 'fake', 'spam', 'offensive', 'harassment', 'other'] as const;

/** How long "Undo" is offered after blocking, before the parent is told to move on. */
export const BLOCK_UNDO_WINDOW_MS = 5000;
const REPORT_SUCCESS_CLOSE_MS = 1500;

/**
 * Report + block (with undo) for a profile - one implementation for Discover,
 * Liked Me and the preview. The block row is written immediately (it is real
 * and enforced at once); only telling the parent to move past the profile is
 * delayed so "Undo" can delete that exact row first.
 */
export const useProfileReport = (options: UseProfileReportOptions) => {
  const { t } = useTranslation();
  const optionsRef = useRef(options);
  // Keep the latest callbacks without re-creating the handlers (runs before the effects below).
  useEffect(() => {
    optionsRef.current = options;
  });

  const [isOpen, setIsOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [isBlockSuccess, setIsBlockSuccess] = useState(false);
  const [isUndoingBlock, setIsUndoingBlock] = useState(false);
  const [lastBlockedUserId, setLastBlockedUserId] = useState<string | null>(null);
  const blockCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reasons = REPORT_REASON_KEYS.map((key) => t(`reportModal.reasons.${key}`));

  const resetForm = useCallback(() => {
    setSelectedReason('');
    setReportError('');
    setBlockReason('');
    setIsBlockSuccess(false);
    setReportSuccess(false);
    setLastBlockedUserId(null);
  }, []);

  const clearBlockTimer = () => {
    if (blockCommitTimerRef.current) {
      clearTimeout(blockCommitTimerRef.current);
      blockCommitTimerRef.current = null;
      return true;
    }
    return false;
  };

  // Let the parent pause its own gestures while the dialog is open.
  useEffect(() => {
    optionsRef.current.onOpenChange?.(isOpen);
    return () => optionsRef.current.onOpenChange?.(false);
  }, [isOpen]);

  // Freeze page scroll while open (single write, restored on close/unmount).
  useEffect(() => {
    if (!isOpen || !optionsRef.current.lockBodyScroll) return undefined;
    const original = document.body.style.cssText;
    document.body.style.cssText = 'overflow: hidden; position: fixed; width: 100%';
    return () => {
      document.body.style.cssText = original;
    };
  }, [isOpen]);

  // Never leave a timer running against a profile that is no longer showing.
  useEffect(
    () => () => {
      clearBlockTimer();
      if (reportCloseTimerRef.current) clearTimeout(reportCloseTimerRef.current);
    },
    []
  );

  const open = useCallback(() => setIsOpen(true), []);

  /** Close. Closing mid-undo-window finalizes the block right away. */
  const close = useCallback(() => {
    const hadPendingBlock = clearBlockTimer();
    if (hadPendingBlock && isBlockSuccess && optionsRef.current.reportedUserId) {
      optionsRef.current.onBlocked?.(optionsRef.current.reportedUserId);
    }
    setIsOpen(false);
    resetForm();
  }, [isBlockSuccess, resetForm]);

  const submitReport = useCallback(async () => {
    if (!selectedReason) {
      setReportError(t('reportModal.selectReason'));
      return;
    }
    setReporting(true);
    setReportError('');
    try {
      const { reportedUserId, getImageUrl } = optionsRef.current;
      const imageUrl = getImageUrl();
      if (!imageUrl || !reportedUserId) throw new Error('Missing image or user');
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase.from('reported_images').insert({
        reporter_id: user.id,
        reported_user_id: reportedUserId,
        image_url: imageUrl,
        status: 'pending',
        reason: selectedReason,
      });
      if (error) throw error;

      recordRatingNegative('report_or_block'); // keeps the review prompt away for a day
      setReportSuccess(true);
      reportCloseTimerRef.current = setTimeout(() => {
        setIsOpen(false);
        setReportSuccess(false);
        setSelectedReason('');
      }, REPORT_SUCCESS_CLOSE_MS);
    } catch (err: unknown) {
      setReportError(getSupabaseErrorMessage(err) || t('reportModal.error'));
    } finally {
      setReporting(false);
    }
  }, [selectedReason, t]);

  const blockUser = useCallback(async () => {
    const { reportedUserId } = optionsRef.current;
    if (!reportedUserId) return;
    // Needs a reason picked or a note typed (the button is disabled too; this is defense in depth).
    if (!selectedReason && !blockReason.trim()) {
      setReportError(t('reportModal.selectReason'));
      return;
    }
    setIsBlocking(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Plain insert (no .select()): blocker_id + blocked_id is unique, so Undo can delete by that pair.
      const { error } = await supabase.from('blocks').insert({
        blocker_id: user.id,
        blocked_id: reportedUserId,
        reason: blockReason.trim() || selectedReason || null,
      });
      // 23505 = already blocked earlier: the end state the user wants is already true.
      const alreadyBlocked = (error as { code?: string } | null)?.code === '23505';
      if (error && !alreadyBlocked) throw error;

      recordRatingNegative('report_or_block');
      setLastBlockedUserId(reportedUserId);
      setIsBlockSuccess(true);
      blockCommitTimerRef.current = setTimeout(() => {
        blockCommitTimerRef.current = null;
        setIsOpen(false);
        resetForm();
        optionsRef.current.onBlocked?.(reportedUserId);
      }, BLOCK_UNDO_WINDOW_MS);
    } catch (err: unknown) {
      setReportError(getSupabaseErrorMessage(err) || 'Failed to block user');
    } finally {
      setIsBlocking(false);
    }
  }, [selectedReason, blockReason, resetForm, t]);

  const undoBlock = useCallback(async () => {
    clearBlockTimer();
    setIsUndoingBlock(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && lastBlockedUserId) {
        const { error } = await supabase
          .from('blocks')
          .delete()
          .eq('blocker_id', user.id)
          .eq('blocked_id', lastBlockedUserId);
        if (error) throw error;
      }
      setIsOpen(false);
      resetForm();
      // Deliberately no onBlocked(): the parent is untouched, as if nothing happened.
    } catch (err: unknown) {
      setReportError(getSupabaseErrorMessage(err) || 'Failed to undo block');
    } finally {
      setIsUndoingBlock(false);
    }
  }, [lastBlockedUserId, resetForm]);

  return {
    isOpen,
    open,
    close,
    reasons,
    selectedReason,
    setSelectedReason,
    blockReason,
    setBlockReason,
    reporting,
    reportSuccess,
    reportError,
    isBlocking,
    isBlockSuccess,
    isUndoingBlock,
    submitReport,
    blockUser,
    undoBlock,
  };
};

export type ProfileReportApi = ReturnType<typeof useProfileReport>;
