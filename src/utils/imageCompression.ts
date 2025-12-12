import heic2any from 'heic2any';

// Keep images uncompressed, but convert unsupported HEIC/HEIF photos to JPEG
export async function compressImage(file: File): Promise<File> {
  try {
    const isHeic =
      file.type === 'image/heic' ||
      file.type === 'image/heif' ||
      /\.heic$/i.test(file.name) ||
      /\.heif$/i.test(file.name);

    if (!isHeic) {
      // For all normal web image types (jpeg, png, webp, etc) return as-is
      return file;
    }

    // Convert HEIC/HEIF to JPEG so it works in all browsers
    const convertedBlob = (await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9,
    })) as Blob;

    const convertedFile = new File([convertedBlob],
      file.name.replace(/\.(heic|heif)$/i, '.jpg'),
      { type: 'image/jpeg' }
    );

    return convertedFile;
  } catch (error) {
    console.error('Image conversion error (HEIC → JPEG):', error);
    // If conversion fails, fall back to the original file
    return file;
  }
}

