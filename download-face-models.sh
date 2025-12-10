#!/bin/bash

# Download face-api.js models for face recognition
# These models are required for face detection, landmarks, and recognition

echo "Downloading face-api.js models..."

cd public/models

# TinyFaceDetector - lightweight face detection
echo "Downloading TinyFaceDetector..."
curl -L -o tiny_face_detector_model-weights_manifest.json https://raw.githubusercontent.com/vladmandic/face-api/master/model/tiny_face_detector_model-weights_manifest.json
curl -L -o tiny_face_detector_model-shard1 https://raw.githubusercontent.com/vladmandic/face-api/master/model/tiny_face_detector_model-shard1

# FaceLandmark68Net - 68-point facial landmarks
echo "Downloading FaceLandmark68Net..."
curl -L -o face_landmark_68_model-weights_manifest.json https://raw.githubusercontent.com/vladmandic/face-api/master/model/face_landmark_68_model-weights_manifest.json
curl -L -o face_landmark_68_model-shard1 https://raw.githubusercontent.com/vladmandic/face-api/master/model/face_landmark_68_model-shard1

# FaceRecognitionNet - face recognition/comparison
echo "Downloading FaceRecognitionNet..."
curl -L -o face_recognition_model-weights_manifest.json https://raw.githubusercontent.com/vladmandic/face-api/master/model/face_recognition_model-weights_manifest.json
curl -L -o face_recognition_model-shard1 https://raw.githubusercontent.com/vladmandic/face-api/master/model/face_recognition_model-shard1
curl -L -o face_recognition_model-shard2 https://raw.githubusercontent.com/vladmandic/face-api/master/model/face_recognition_model-shard2

echo "✅ Models downloaded successfully!"
echo "Models are now in: public/models/"
