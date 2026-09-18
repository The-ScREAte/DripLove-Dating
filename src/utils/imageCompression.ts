import imageCompression from 'browser-image-compression';
import { prepareImageForUpload } from './imageNormalizer';

const MAX_SIZE_MB = 1;
const MAX_DIMENSION = 1024;

const runLibraryCompression = (file: File, maxWidthOrHeight: number, initialQuality: number): Promise<File> =>
  imageCompression(file, {
    maxSizeMB: MAX_SIZE_MB,
    maxWidthOrHeight,
    useWebWorker: true,
    fileType: 'image/jpeg', // Use JPEG - WebP has content-type issues with Supabase Storage
    initialQuality,
  });

// browser-image-compression has a known failure mode (seen in production:
// several uploads landed in storage typed "application/json" instead of an
// image) where a worker error surfaces as a non-image blob instead of
// throwing. Treat that the same as a thrown error rather than uploading it.
const isUsableImage = (result: File): boolean => result.size > 0 && result.type.startsWith('image/');

// Dependency-free fallback so a single bad browser-image-compression run
// never results in the full, uncompressed original being uploaded.
async function canvasResize(file: File, maxDimension: number, quality: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/jpeg', quality);
    });

    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } finally {
    bitmap.close?.();
  }
}

export async function compressImage(rawFile: File): Promise<File> {
  // iPhones default to HEIC, which browser-image-compression's canvas-based
  // resize can't decode outside Safari - convert it to a real JPEG first (a
  // no-op for every other format) so the rest of this pipeline always has
  // something it can actually work with instead of silently falling back to
  // uploading the undecoded original.
  const file = await prepareImageForUpload(rawFile);

  // Check if file is already small enough and in JPEG format
  if (file.size <= MAX_SIZE_MB * 1024 * 1024 && file.type === 'image/jpeg') {
    return file;
  }

  try {
    const compressed = await runLibraryCompression(file, MAX_DIMENSION, 0.85);
    if (isUsableImage(compressed)) {
      if (compressed.size <= MAX_SIZE_MB * 1024 * 1024) return compressed;

      // Still over budget (rare, very detailed source image) - one more
      // pass, smaller and lower quality, before accepting what we have.
      const retried = await runLibraryCompression(compressed, 800, 0.7);
      if (isUsableImage(retried) && retried.size < compressed.size) return retried;
      return compressed;
    }
    console.error('Image compression returned a non-image result, falling back to canvas resize', {
      type: compressed.type,
      size: compressed.size,
    });
  } catch (error) {
    console.error('Image compression error, falling back to canvas resize:', error);
  }

  try {
    return await canvasResize(file, MAX_DIMENSION, 0.85);
  } catch (error) {
    console.error('Canvas fallback compression error:', error);
    return file;
  }
}
