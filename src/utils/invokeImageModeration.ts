import { supabase } from '@/integrations/supabase/client';

/**
 * Shared wrapper around the `moderate-image` edge function invoke, used by
 * every upload entry point (profile photo management, registration,
 * profile-completion).
 *
 * Why this exists: a bare invoke() failure (network blip, cold start,
 * transient 5xx) used to be treated as "fine, the photo's already live" by
 * every caller - the DB row was left at its real default (moderation_status
 * 'pending', is_approved false) while the user was told the photo was
 * approved. That's exactly what let an already-checked, already-approved-
 * looking photo keep resurfacing in the admin queue: the client's claim and
 * the DB's actual state had silently diverged.
 *
 * This wrapper retries transient failures a few times with backoff (covers
 * the large majority of real-world blips), and if every attempt still
 * fails, returns an honest 'pending' outcome instead of a false 'approved'
 * one - callers should tell the user their photo is being reviewed, not
 * that it's live.
 */

export type ModerationOutcome = {
  status: 'approved' | 'rejected' | 'pending';
  message: string;
  hasFace?: boolean | null;
};

const PENDING_MESSAGE =
  "This photo is uploaded and queued for review - it'll go live automatically within a few minutes. If it doesn't, try re-uploading it.";

export async function invokeImageModeration(
  imageId: string,
  imageBase64: string,
  options?: { retries?: number; baseDelayMs?: number }
): Promise<ModerationOutcome> {
  const retries = options?.retries ?? 2;
  const baseDelayMs = options?.baseDelayMs ?? 800;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke('moderate-image', {
        body: { imageId, imageBase64 },
      });

      if (error || !data?.success) {
        throw error || new Error(data?.error || 'Moderation check failed');
      }

      return { status: data.status, message: data.message, hasFace: data.hasFace };
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }

  console.error('[invokeImageModeration] Failed after retries:', lastError);
  return { status: 'pending', message: PENDING_MESSAGE, hasFace: null };
}

// How long a photo can sit at 'pending' before we treat it as "the original
// invoke never landed" rather than "still in flight right now" - long
// enough that this never races a genuinely-in-progress upload elsewhere in
// the app.
const STUCK_PENDING_AGE_MS = 60_000;

/**
 * Best-effort reconciliation: silently retries moderation for any of the
 * CURRENT user's own photos still stuck at 'pending' from a past failed
 * attempt (see invokeImageModeration's docblock for why that can happen).
 * Uses the caller's own session - no service-role/cron machinery needed,
 * since it only ever touches images the signed-in user already owns.
 * Safe to call on every app load; it no-ops when there's nothing stuck.
 */
export async function reconcileStuckPendingImages(userId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STUCK_PENDING_AGE_MS).toISOString();
    const { data: stuck, error } = await supabase
      .from('user_images')
      .select('id, image_url')
      .eq('user_id', userId)
      .eq('moderation_status', 'pending')
      .lt('created_at', cutoff);

    if (error || !stuck || stuck.length === 0) return;

    for (const row of stuck) {
      try {
        const response = await fetch(row.image_url);
        const blob = await response.blob();
        const imageBase64: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        await invokeImageModeration(row.id, imageBase64);
      } catch (rowErr) {
        // One stuck photo failing to reconcile shouldn't stop the rest, and
        // shouldn't surface anywhere - this is a silent background sweep,
        // not a user-initiated action.
        console.error('[reconcileStuckPendingImages] Failed for image', row.id, rowErr);
      }
    }
  } catch (err) {
    console.error('[reconcileStuckPendingImages] Unexpected error:', err);
  }
}
