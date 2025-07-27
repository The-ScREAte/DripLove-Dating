import imageCompression from 'browser-image-compression';

export async function compressImage(file: File): Promise<File> {
  // Check if file is already small enough and in WebP format
  if (file.size <= 1024 * 1024 && file.type === 'image/webp') {
    return file;
  }

  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1024,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.8,
  };
  
  try {
    const compressedFile = await imageCompression(file, options);
    console.log(`Image compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
    return compressedFile;
  } catch (error) {
    console.error('Image compression error:', error);
    return file;
  }
}
