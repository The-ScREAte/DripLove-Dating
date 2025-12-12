import imageCompression from 'browser-image-compression';

export async function compressImage(file: File): Promise<File> {
  const options = {
    maxSizeMB: 1.5,
    maxWidthOrHeight: 2048,
    useWebWorker: true,
    fileType: 'image/webp',
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
