import { FaceMesh } from '@mediapipe/face_mesh';

let ready = false;
let loading = false;

export async function preloadFaceMesh() {
  // If already ready, return immediately
  if (ready) return;
  
  // If already loading, wait for the existing promise
  if (loading) {
    return new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (ready) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  }

  loading = true;

  return new Promise<void>(async (resolve, reject) => {
    try {
      const faceMesh = new FaceMesh({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      // 🔥 AGGRESSIVE: Set minimal options for fastest possible load
      await faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.3,
        minTrackingConfidence: 0.3,
      });

      // 🔥 CRITICAL: Trigger model warm-up with multiple dummy frames
      // This forces MediaPipe to fully load graph + tensors
      let initialized = false;
      
      faceMesh.onResults(() => {
        if (!initialized) {
          initialized = true;
          ready = true;
          loading = false;
          (window as any).__faceMeshInstance = faceMesh;
          console.log('✅ MediaPipe fully preloaded and ready');
          resolve();
        }
      });

      // Send multiple dummy frames to force full initialization
      const dummy = document.createElement('canvas');
      dummy.width = 64;
      dummy.height = 64;
      const ctx = dummy.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, 64, 64);
      }

      // Send 3 frames to ensure full warm-up
      await faceMesh.send({ image: dummy });
      await faceMesh.send({ image: dummy });
      await faceMesh.send({ image: dummy });
      
      // Fallback timeout in case onResults never fires
      setTimeout(() => {
        if (!ready) {
          ready = true;
          loading = false;
          (window as any).__faceMeshInstance = faceMesh;
          console.warn('⚠️ MediaPipe preload completed with fallback');
          resolve();
        }
      }, 3000);
    } catch (err) {
      loading = false;
      console.error('❌ MediaPipe preload failed:', err);
      reject(err);
    }
  });
}
