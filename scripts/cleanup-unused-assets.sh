#!/bin/bash

# Cleanup unused face detection models (AWS Rekognition is used instead)
echo "🧹 Cleaning up unused face detection models..."

# Remove from public directory
if [ -d "public/models" ]; then
  rm -rf public/models
  echo "✅ Removed public/models/"
fi

# Remove from Android assets
if [ -d "android/app/src/main/assets/public/models" ]; then
  rm -rf android/app/src/main/assets/public/models
  echo "✅ Removed android/app/src/main/assets/public/models/"
fi

# Remove from iOS assets
if [ -d "ios/App/App/public/models" ]; then
  rm -rf ios/App/App/public/models
  echo "✅ Removed ios/App/App/public/models/"
fi

echo "✨ Cleanup complete! This will reduce bundle size by ~10-15MB"
echo ""
echo "⚠️  Note: Run 'npm run build:android' or 'npm run build:ios' to apply changes"
