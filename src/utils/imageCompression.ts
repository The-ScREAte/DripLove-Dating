import imageCompression from 'browser-image-compression';

export async function compressImage(file: File): Promise<File> {
  const options = {
    maxSizeMB: 3,
    maxWidthOrHeight: 4096,
    useWebWorker: true,
    // Keep original image format instead of forcing WebP
    fileType: file.type && file.type.startsWith('image/') ? file.type : undefined,
    initialQuality: 0.9,
  };
  
  try {
    const compressedFile = await imageCompression(file, options);
    return compressedFile;
  } catch (error) {
    console.error('Image compression error:', error);
    return file;
  }
}
