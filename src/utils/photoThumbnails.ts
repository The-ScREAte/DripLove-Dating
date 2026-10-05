import { supabase } from '@/integrations/supabase/client';

/**
 * Small copies of profile photos for grids and cards (Circle rows, the Liked
 * Me grid, the profile photo strip). Supabase's on-the-fly resizing is
 * switched off (quota - see getDetailImageUrl), so without these every small
 * card downloaded the full ~1024px photo.
 *
 * A thumbnail lives next to its photo in a `thumbs/` sub-folder with the same
 * file name:
 *   <userId>/<name>.jpg  ->  <userId>/thumbs/<name>.jpg
 * so its URL can be derived from the photo URL alone - no database column.
 * Photos uploaded before this existed simply have no thumbnail yet; the
 * <ThumbnailImage> component falls back to the full photo for those (and
 * scripts/backfill-photo-thumbnails.mjs creates them in one go).
 */

const BUCKET = 'user-photos';
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;
const THUMB_DIR = 'thumbs';
/** Longest side in pixels: sharp at ~160 CSS px on a 3x phone screen. */
export const THUMBNAIL_MAX_DIMENSION = 400;
const THUMBNAIL_QUALITY = 0.78;

/** `<userId>/<name>` -> `<userId>/thumbs/<name>` (null for anything else). */
export function thumbnailPathFor(filePath: string): string | null {
  const clean = filePath.split('?')[0];
  const slash = clean.lastIndexOf('/');
  if (slash <= 0) return null;
  const dir = clean.slice(0, slash);
  if (dir.endsWith(`/${THUMB_DIR}`) || dir === THUMB_DIR) return null;
  return `${dir}/${THUMB_DIR}/${clean.slice(slash + 1)}`;
}

/** Thumbnail URL for a public profile-photo URL, or '' if it isn't one. */
export function thumbnailUrlFor(photoUrl: string | null | undefined): string {
  if (!photoUrl) return '';
  const raw = photoUrl.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/').split('?')[0];
  const at = raw.indexOf(PUBLIC_MARKER);
  if (at === -1) return '';
  const thumbPath = thumbnailPathFor(raw.slice(at + PUBLIC_MARKER.length));
  return thumbPath ? `${raw.slice(0, at + PUBLIC_MARKER.length)}${thumbPath}` : '';
}

/** Adds each photo's thumbnail path, for deleting a photo and its thumbnail together. */
export function withThumbnailPaths(filePaths: string[]): string[] {
  const out = [...filePaths];
  for (const p of filePaths) {
    const t = thumbnailPathFor(p);
    if (t) out.push(t);
  }
  return out;
}

async function renderThumbnail(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, THUMBNAIL_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Thumbnail encode failed'))), 'image/jpeg', THUMBNAIL_QUALITY);
    });
  } finally {
    bitmap.close?.();
  }
}

/**
 * Creates and uploads the thumbnail for a photo that was just uploaded to
 * `filePath`. Best-effort and safe to fire-and-forget: a failure only means
 * cards show the full photo for this one, exactly as before.
 */
export async function uploadPhotoThumbnail(filePath: string, source: Blob): Promise<void> {
  try {
    const thumbPath = thumbnailPathFor(filePath);
    if (!thumbPath) return;
    const thumb = await renderThumbnail(source);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, thumb, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
    if (error) console.warn('Thumbnail upload failed (full photo will be used):', error.message);
    else forgetMissingThumbnail(thumbnailUrlFor(supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl));
  } catch (error) {
    console.warn('Thumbnail creation failed (full photo will be used):', error);
  }
}

/** Storage path inside the bucket for a public photo URL ('' if not one). */
export function photoPathFromUrl(photoUrl: string): string {
  const raw = photoUrl.split('?')[0];
  const at = raw.indexOf(PUBLIC_MARKER);
  return at === -1 ? '' : decodeURIComponent(raw.slice(at + PUBLIC_MARKER.length));
}

// ---- Remembering photos that have no thumbnail (older uploads) ----------
// So each one costs a single failed request per device, not one per render.
const MISSING_KEY = 'driplove_missing_thumbs_v1';
const MISSING_LIMIT = 3000;
let missing: Set<string> | null = null;

function loadMissing(): Set<string> {
  if (missing) return missing;
  try {
    const raw = localStorage.getItem(MISSING_KEY);
    missing = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    missing = new Set();
  }
  return missing;
}

function saveMissing() {
  try {
    const list = Array.from(loadMissing());
    localStorage.setItem(MISSING_KEY, JSON.stringify(list.slice(-MISSING_LIMIT)));
  } catch {
    // storage full / unavailable - the in-memory set still works this session
  }
}

export function isThumbnailKnownMissing(thumbUrl: string): boolean {
  return loadMissing().has(thumbUrl);
}

export function markThumbnailMissing(thumbUrl: string): void {
  if (!thumbUrl) return;
  const set = loadMissing();
  if (set.has(thumbUrl)) return;
  set.add(thumbUrl);
  saveMissing();
}

function forgetMissingThumbnail(thumbUrl: string): void {
  const set = loadMissing();
  if (set.delete(thumbUrl)) saveMissing();
}
