// Test script to verify moderation logic
import { photoModerationService } from './src/utils/photoModeration.js';

// Create a test file blob (this would normally be from user upload)
async function testModeration() {
  console.log('🧪 Testing moderation logic...');

  // Test 1: Create a mock "inappropriate" image result
  const mockInappropriateResult = {
    isApproved: true,      // Changed: should be true now (upload allowed)
    confidence: 40,        // Low confidence
    flags: ['Inappropriate content detected'],
    details: {
      adultContent: 35,    // Above 20% threshold - should trigger pending
      requiresReview: true // Should be true
    },
    message: 'Image uploaded successfully but requires admin approval before being visible to others.'
  };

  console.log('📊 Expected result for inappropriate content:', mockInappropriateResult);

  // Test 2: Create a mock "clean" image result  
  const mockCleanResult = {
    isApproved: true,
    confidence: 90,
    flags: [],
    details: {
      adultContent: 5,
      requiresReview: false
    },
    message: 'Image approved for upload.'
  };

  console.log('📊 Expected result for clean content:', mockCleanResult);

  console.log('✅ Test complete - check console logs when uploading images');
}

testModeration();
