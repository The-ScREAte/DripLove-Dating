import imageCompression from 'browser-image-compression';

export async function compressImage(file: File): Promise<File> {
  // Accept ALL images without any compression - just return as-is
  // This ensures maximum compatibility with all image formats and sizes
  // The server and storage will handle the images directly
  
  // Only compress if extremely large (over 15MB) to prevent upload failures
  if (file.size <= 15 * 1024 * 1024) {
    return file;
  }

  const options = {
    maxSizeMB: 10,
    maxWidthOrHeight: 4096,
    useWebWorker: true,
    preserveExif: true,
    initialQuality: 0.95,
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
