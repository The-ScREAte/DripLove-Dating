// No compression - return original file as-is
export async function compressImage(file: File): Promise<File> {
  return file;
}
