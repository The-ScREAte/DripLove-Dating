/**
 * Convert image to JPEG only when necessary (HEIC, AVIF, WebP)
 * Preserves original camera JPEGs to avoid canvas re-encoding bugs
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

/**
 * Conditionally convert image based on format
 * Only converts HEIC, AVIF - keeps JPEGs and PNGs as-is
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  const shouldConvert =
    file.type === 'image/heic' ||
    file.type === 'image/avif' ||
    file.type === 'image/heif';

  return shouldConvert ? await normalizeToJpeg(file) : file;
}
