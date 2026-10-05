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

// Camera RAW formats (Canon, Nikon, Sony, Adobe DNG, Fuji, Olympus,
// Panasonic, Pentax, Samsung, ...). No browser can decode the raw sensor
// data, and the OS file picker often reports them with an empty or
// non-"image/" MIME type - so they're recognised by extension too.
const RAW_EXTENSIONS = ['cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'raf', 'orf', 'rw2', 'rwl', 'pef', 'srw', '3fr', 'erf', 'kdc', 'mrw', 'x3f', 'iiq'];
const RAW_EXTENSION_RE = new RegExp(`\\.(${RAW_EXTENSIONS.join('|')})$`, 'i');

export const isCameraRaw = (file: File): boolean =>
  RAW_EXTENSION_RE.test(file.name) || /x-(canon|nikon|sony|adobe-dng|fuji|olympus|panasonic|pentax|samsung)/i.test(file.type);

/** Any photo the upload pipeline can turn into a JPEG. */
export const isSupportedImageFile = (file: File): boolean =>
  file.type.startsWith('image/') || isHeic(file) || isCameraRaw(file);

/** `accept` value for photo pickers. Phones keep the plain image picker (an
 *  extension list makes Android fall back to a generic file browser, and
 *  phone galleries hand over JPEG/HEIC anyway); desktop browsers also get
 *  HEIC and RAW extensions, which macOS/Windows otherwise grey out. */
export const getPhotoAcceptAttribute = (isNativeApp: boolean): string =>
  isNativeApp ? 'image/*' : ['image/*', '.heic', '.heif', ...RAW_EXTENSIONS.map((ext) => `.${ext}`)].join(',');

// Uploads are resized to <=1024px / ~1MB on-device before they leave the
// phone, so the source file itself can be much larger - RAW files are
// routinely 20-60MB.
export const MAX_SOURCE_PHOTO_BYTES = 80 * 1024 * 1024;

// TIFF-based RAW files (CR2, NEF, ARW, DNG, ...) record the camera's
// orientation in IFD0; the embedded preview JPEG usually doesn't, so a
// portrait shot would otherwise come out sideways.
function readTiffOrientation(bytes: Uint8Array): number {
  if (bytes.length < 16) return 1;
  const little = bytes[0] === 0x49 && bytes[1] === 0x49; // "II"
  const big = bytes[0] === 0x4d && bytes[1] === 0x4d; // "MM"
  if (!little && !big) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const ifd0 = u32(4);
  if (ifd0 + 2 > bytes.length) return 1;
  const count = u16(ifd0);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > bytes.length) break;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

// Every RAW format embeds at least one ordinary JPEG preview (usually full
// or near-full resolution) next to the raw data. Find each JPEG start
// marker, let the browser try to decode from there, and keep the largest
// image that decodes - the raw data itself (lossless JPEG) and the tiny
// thumbnails simply lose out or fail to decode.
async function extractRawPreviewToJpeg(file: File): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const starts: number[] = [];
  for (let i = 0; i < bytes.length - 3 && starts.length < 40; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) starts.push(i);
  }

  let best: ImageBitmap | null = null;
  for (const start of starts) {
    try {
      const bitmap = await createImageBitmap(file.slice(start, file.size, 'image/jpeg'));
      if (!best || bitmap.width * bitmap.height > best.width * best.height) {
        best?.close?.();
        best = bitmap;
      } else {
        bitmap.close?.();
      }
    } catch {
      // not a decodable JPEG at this offset - keep looking
    }
  }
  if (!best || best.width < 200 || best.height < 200) {
    best?.close?.();
    throw new Error('No usable preview image inside RAW file');
  }

  try {
    const orientation = readTiffOrientation(bytes);
    const quarterTurn = orientation >= 5; // 5-8 swap width/height
    const scale = Math.min(1, 2048 / Math.max(best.width, best.height));
    const w = Math.round(best.width * scale);
    const h = Math.round(best.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = quarterTurn ? h : w;
    canvas.height = quarterTurn ? w : h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    // Standard EXIF orientation transforms.
    switch (orientation) {
      case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
      case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
      case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
      case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
      case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
      case 7: ctx.transform(0, -1, -1, 0, h, w); break;
      case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
      default: break;
    }
    ctx.drawImage(best, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))), 'image/jpeg', 0.9);
    });
    return new File([blob], file.name.replace(/\.\w+$/i, '.jpg'), { type: 'image/jpeg' });
  } finally {
    best.close?.();
  }
}

/**
 * Conditionally convert image based on format - only converts RAW/HEIC/HEIF/AVIF,
 * keeps JPEGs and PNGs as-is. Safe to call on every upload: a no-op for the
 * common case, and the one place that needs to know how to decode an iPhone
 * photo the browser itself can't.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (isCameraRaw(file)) {
    // Throws if no preview can be read - a raw file must never be uploaded
    // as-is (nothing could display it).
    return extractRawPreviewToJpeg(file);
  }

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
