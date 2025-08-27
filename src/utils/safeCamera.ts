// Camera safety wrapper for Capacitor
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export async function safeGetPhoto(options = {}) {
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 90,
      ...options
    });
    return photo;
  } catch (error) {
    // Fallback to photo library if camera is not available or permission denied
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
        quality: 90,
        ...options
      });
      return photo;
    } catch (err) {
      throw new Error('Unable to access camera or photo library.');
    }
  }
}
