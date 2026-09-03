/**
 * Convert file to base64 string for AWS Rekognition
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix if present
      const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
      resolve(cleanBase64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
