import imageCompression from 'browser-image-compression';

export async function compressImage(file: File): Promise<File> {
  // Check if file is already small enough and in JPEG format
  if (file.size <= 1024 * 1024 && file.type === 'image/jpeg') {
    return file;
  }

  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1024,
    useWebWorker: true,
    fileType: 'image/jpeg', // Use JPEG - WebP has content-type issues with Supabase Storage
    initialQuality: 0.85,
  };
  
  try {
    const compressedFile = await imageCompression(file, options);
    return compressedFile;
  } catch (error) {
    console.error('Image compression error:', error);
    return file;
  }
}
