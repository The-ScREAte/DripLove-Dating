/**
 * Convert image to JPEG via the canvas (createImageBitmap + 2D context).
 * Works for formats the browser can decode natively - fine for AVIF, but
 * NOT reliable for HEIC/HEIF: most non-Safari engines (Chrome, Android
 * WebView) have no native HEIC decoder, so createImageBitmap throws on it.
 */
export async function normalizeToJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  // Fill white background so transparent images look normal
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(bitmap, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))), 'image/jpeg', 0.9);
  });

  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}

// HEIC/HEIF (the default photo format on iPhone) needs its own decoder -
// heic2any ships a WASM (libheif) decoder that works regardless of the
// browser's native format support, unlike the canvas path above.
async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import('heic2any')).default;
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  // A "live"/burst HEIC can decode to multiple frames - only the cover
  // image is relevant for a profile photo.
  const blob = Array.isArray(result) ? result[0] : result;
  return new File([blob], file.name.replace(/\.\w+$/i, '.jpg'), { type: 'image/jpeg' });
}

const isHeic = (file: File): boolean =>
  file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name);

/**
 * Conditionally convert image based on format - only converts HEIC/HEIF/AVIF,
 * keeps JPEGs and PNGs as-is. Safe to call on every upload: a no-op for the
 * common case, and the one place that needs to know how to decode an iPhone
 * photo the browser itself can't.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (isHeic(file)) {
    try {
      return await convertHeicToJpeg(file);
    } catch (error) {
      console.error('HEIC conversion failed, trying native canvas decode:', error);
      try {
        return await normalizeToJpeg(file);
      } catch (fallbackError) {
        console.error('Canvas HEIC fallback also failed, uploading original file as-is:', fallbackError);
        return file;
      }
    }
  }

  if (file.type === 'image/avif') {
    try {
      return await normalizeToJpeg(file);
    } catch (error) {
      console.error('AVIF conversion failed, uploading original file as-is:', error);
      return file;
    }
  }

  return file;
}
