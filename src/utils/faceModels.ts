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
    const MODEL_URL = '/models';
    
    console.log('🔄 Loading face recognition models...');

    // Load all required models in parallel
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),      // Detect faces
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),     // Find 68 facial landmarks
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)     // Generate face descriptor for comparison
    ]);

    modelsLoaded = true;
    console.log('✅ Face recognition models loaded successfully');
  } catch (error) {
    console.error('❌ Error loading face recognition models:', error);
    throw new Error('Failed to load face recognition models. Please check your internet connection.');
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
