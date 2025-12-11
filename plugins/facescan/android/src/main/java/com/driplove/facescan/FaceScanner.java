package com.driplove.facescan;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.media.Image;
import android.util.Base64;
import android.util.Log;
 
import androidx.annotation.NonNull;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.google.android.gms.tasks.Task;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.Face;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetector;
import com.google.mlkit.vision.face.FaceDetectorOptions;
import com.google.mlkit.vision.face.FaceLandmark;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;

public class FaceScanner {

    private static final String TAG = "FaceScanner";
    private final Context context;
    private final Activity activity;
    private ProcessCameraProvider cameraProvider;
    private SuccessCallback successCallback;
    private ErrorCallback errorCallback;
    private PreviewCallback previewCallback;
    private java.util.ArrayList<Float> yawHistory = new java.util.ArrayList<>();
    private java.util.ArrayList<Float> rollHistory = new java.util.ArrayList<>();
    private static final int HISTORY_SIZE = 2;
    private static final float STABILITY_THRESHOLD = 3.0f;
    private java.util.concurrent.ExecutorService cameraExecutor;
    private float lastYaw = 0f;
    private float lastRoll = 0f;

    public interface SuccessCallback {
        void invoke(String descriptor, float yaw, float roll);
    }

    public interface ErrorCallback {
        void invoke(String error);
    }

    public interface PreviewCallback {
        void onPreview(float yaw, float roll);
    }

    public FaceScanner(Context context, Activity activity) {
        this.context = context;
        this.activity = activity;
        this.cameraExecutor = java.util.concurrent.Executors.newSingleThreadExecutor();
    }

    public void setPreviewCallback(PreviewCallback callback) {
        this.previewCallback = callback;
    }

    public void capture(SuccessCallback success, ErrorCallback error) {
        this.successCallback = success;
        this.errorCallback = error;

        // Setup camera with ML Kit
        setupCamera();
    }

    private void setupCamera() {
        ListenableFuture<ProcessCameraProvider> cameraProviderFuture =
                ProcessCameraProvider.getInstance(context);

        cameraProviderFuture.addListener(() -> {
            try {
                cameraProvider = cameraProviderFuture.get();
                bindCameraUseCases();
            } catch (ExecutionException | InterruptedException e) {
                Log.e(TAG, "Error setting up camera: " + e.getMessage());
                if (errorCallback != null) {
                    errorCallback.invoke("Camera setup failed: " + e.getMessage());
                }
            }
        }, ContextCompat.getMainExecutor(context));
    }

    private void bindCameraUseCases() {
        // Configure face detector for high accuracy
        FaceDetectorOptions options = new FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
                .setMinFaceSize(0.15f)
                .build();

        FaceDetector detector = FaceDetection.getClient(options);

        // Setup image analysis
        ImageAnalysis imageAnalysis = new ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build();

        // Use background executor to prevent UI thread jank (CRITICAL FIX)
        imageAnalysis.setAnalyzer(cameraExecutor, imageProxy -> {
            processImage(imageProxy, detector);
        });

        // Select front camera
        CameraSelector cameraSelector = new CameraSelector.Builder()
                .requireLensFacing(CameraSelector.LENS_FACING_FRONT)
                .build();

        try {
            // Unbind all use cases before rebinding
            cameraProvider.unbindAll();

            // Bind use cases to camera
            cameraProvider.bindToLifecycle(
                    (LifecycleOwner) activity,
                    cameraSelector,
                    imageAnalysis
            );

        } catch (Exception e) {
            Log.e(TAG, "Use case binding failed", e);
            if (errorCallback != null) {
                errorCallback.invoke("Camera binding failed: " + e.getMessage());
            }
        }
    }

    private void processImage(ImageProxy imageProxy, FaceDetector detector) {
        @SuppressWarnings("UnsafeOptInUsageError")
        Image mediaImage = imageProxy.getImage();
        
        if (mediaImage == null) {
            imageProxy.close();
            return;
        }

        InputImage image = InputImage.fromMediaImage(
                mediaImage,
                imageProxy.getImageInfo().getRotationDegrees()
        );

        detector.process(image)
                .addOnSuccessListener(faces -> {
                    if (!faces.isEmpty()) {
                        Face face = faces.get(0); // Get first detected face
                        
                        float rawYaw = face.getHeadEulerAngleY();
                        float rawRoll = face.getHeadEulerAngleZ();
                        
                        // Apply exponential smoothing to reduce flutter
                        float yaw = rawYaw * 0.7f + lastYaw * 0.3f;
                        float roll = rawRoll * 0.7f + lastRoll * 0.3f;
                        
                        lastYaw = yaw;
                        lastRoll = roll;
                        
                        // Send preview update to React
                        if (previewCallback != null) {
                            previewCallback.onPreview(yaw, roll);
                        }
                        
                        // Check stability before capturing
                        if (!isStable(yaw, roll)) {
                            imageProxy.close();
                            return;
                        }
                        
                        // Generate descriptor from face landmarks
                        String descriptor = generateDescriptor(face);
                        
                        // Stop camera and return result
                        stopCamera();
                        
                        if (successCallback != null) {
                            successCallback.invoke(descriptor, yaw, roll);
                        }
                    }
                    imageProxy.close();
                })
                .addOnFailureListener(e -> {
                    Log.e(TAG, "Face detection failed", e);
                    imageProxy.close();
                });
    }

    private String generateDescriptor(Face face) {
        // Create a 128-dimensional descriptor from face data
        float[] descriptor = new float[128];
        
        // Fill with face geometry data
        Rect bounds = face.getBoundingBox();
        descriptor[0] = bounds.left;
        descriptor[1] = bounds.top;
        descriptor[2] = bounds.right;
        descriptor[3] = bounds.bottom;
        descriptor[4] = bounds.width();
        descriptor[5] = bounds.height();
        
        // Add rotation angles
        Float headEulerAngleY = face.getHeadEulerAngleY();
        Float headEulerAngleZ = face.getHeadEulerAngleZ();
        Float headEulerAngleX = face.getHeadEulerAngleX();
        
        descriptor[6] = headEulerAngleY != null ? headEulerAngleY : 0;
        descriptor[7] = headEulerAngleZ != null ? headEulerAngleZ : 0;
        descriptor[8] = headEulerAngleX != null ? headEulerAngleX : 0;
        
        int idx = 9;
        
        // Add landmark positions
        FaceLandmark leftEye = face.getLandmark(FaceLandmark.LEFT_EYE);
        if (leftEye != null && idx < 128 - 1) {
            descriptor[idx++] = leftEye.getPosition().x;
            descriptor[idx++] = leftEye.getPosition().y;
        }
        
        FaceLandmark rightEye = face.getLandmark(FaceLandmark.RIGHT_EYE);
        if (rightEye != null && idx < 128 - 1) {
            descriptor[idx++] = rightEye.getPosition().x;
            descriptor[idx++] = rightEye.getPosition().y;
        }
        
        FaceLandmark noseBase = face.getLandmark(FaceLandmark.NOSE_BASE);
        if (noseBase != null && idx < 128 - 1) {
            descriptor[idx++] = noseBase.getPosition().x;
            descriptor[idx++] = noseBase.getPosition().y;
        }
        
        FaceLandmark leftMouth = face.getLandmark(FaceLandmark.MOUTH_LEFT);
        if (leftMouth != null && idx < 128 - 1) {
            descriptor[idx++] = leftMouth.getPosition().x;
            descriptor[idx++] = leftMouth.getPosition().y;
        }
        
        FaceLandmark rightMouth = face.getLandmark(FaceLandmark.MOUTH_RIGHT);
        if (rightMouth != null && idx < 128 - 1) {
            descriptor[idx++] = rightMouth.getPosition().x;
            descriptor[idx++] = rightMouth.getPosition().y;
        }
        
        FaceLandmark bottomMouth = face.getLandmark(FaceLandmark.MOUTH_BOTTOM);
        if (bottomMouth != null && idx < 128 - 1) {
            descriptor[idx++] = bottomMouth.getPosition().x;
            descriptor[idx++] = bottomMouth.getPosition().y;
        }
        
        FaceLandmark leftCheek = face.getLandmark(FaceLandmark.LEFT_CHEEK);
        if (leftCheek != null && idx < 128 - 1) {
            descriptor[idx++] = leftCheek.getPosition().x;
            descriptor[idx++] = leftCheek.getPosition().y;
        }
        
        FaceLandmark rightCheek = face.getLandmark(FaceLandmark.RIGHT_CHEEK);
        if (rightCheek != null && idx < 128 - 1) {
            descriptor[idx++] = rightCheek.getPosition().x;
            descriptor[idx++] = rightCheek.getPosition().y;
        }
        
        // Fill remaining with normalized values
        while (idx < 128) {
            descriptor[idx++] = 0;
        }
        
        // Convert float array to byte array and encode as base64
        ByteBuffer buffer = ByteBuffer.allocate(descriptor.length * 4);
        for (float value : descriptor) {
            buffer.putFloat(value);
        }
        
        return Base64.encodeToString(buffer.array(), Base64.DEFAULT);
    }

    private void stopCamera() {
        if (cameraProvider != null) {
            cameraProvider.unbindAll();
        }
        if (cameraExecutor != null && !cameraExecutor.isShutdown()) {
            cameraExecutor.shutdown();
        }
    }
    
    private boolean isStable(float yaw, float roll) {
        yawHistory.add(yaw);
        rollHistory.add(roll);
        
        if (yawHistory.size() > HISTORY_SIZE) {
            yawHistory.remove(0);
            rollHistory.remove(0);
        }
        
        if (yawHistory.size() < HISTORY_SIZE) {
            return false;
        }
        
        float yawSum = 0;
        float rollSum = 0;
        for (int i = 0; i < HISTORY_SIZE; i++) {
            yawSum += yawHistory.get(i);
            rollSum += rollHistory.get(i);
        }
        float yawAvg = yawSum / HISTORY_SIZE;
        float rollAvg = rollSum / HISTORY_SIZE;
        
        for (int i = 0; i < HISTORY_SIZE; i++) {
            if (Math.abs(yawHistory.get(i) - yawAvg) > STABILITY_THRESHOLD) {
                return false;
            }
            if (Math.abs(rollHistory.get(i) - rollAvg) > STABILITY_THRESHOLD) {
                return false;
            }
        }
        
        return true;
    }
}
