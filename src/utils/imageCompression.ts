import imageCompression from 'browser-image-compression';

export async function compressImage(file: File): Promise<File> {
  // Accept any image - only compress if it's very large (over 5MB)
  // This ensures all images work regardless of format
  if (file.size <= 5 * 1024 * 1024) {
    return file;
  }

  const options = {
    maxSizeMB: 3,
    maxWidthOrHeight: 2048,
    useWebWorker: true,
    // Don't force WebP conversion - keep original format for better compatibility
    initialQuality: 0.9,
  };
  
  try {
    const compressedFile = await imageCompression(file, options);
    return compressedFile;
  } catch (error) {
    console.error('Image compression error:', error);
    // Always return the original file if compression fails
    return file;
  }
}
