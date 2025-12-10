/**
 * Face Recognition Models Loader
 * Loads the required face-api.js models for face detection, landmarks, and recognition
 */

import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;

/**
 * Load face recognition models from public/models directory
 * This needs to be called before any face detection/recognition operations
 */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) {
    console.log('✅ Face models already loaded');
    return;
  }

  try {
    // Use relative path for better Capacitor compatibility
    const MODEL_URL = './models';
    
    console.log('🔄 Loading face recognition models from:', MODEL_URL);
    console.log('📍 Current location:', window.location.href);

    // Load all required models in parallel with timeout
    const loadPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),      // Detect faces
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),     // Find 68 facial landmarks
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)     // Generate face descriptor for comparison
    ]);

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Model loading timeout (30s)')), 30000)
    );

    await Promise.race([loadPromise, timeoutPromise]);

    modelsLoaded = true;
    console.log('✅ Face recognition models loaded successfully');
  } catch (error) {
    console.error('❌ Error loading face recognition models:', error);
    modelsLoaded = false;
    throw new Error(`Failed to load face recognition models: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if face models are loaded
 */
export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

/**
 * Reset models loaded state (useful for testing)
 */
export function resetModelsState(): void {
  modelsLoaded = false;
}
