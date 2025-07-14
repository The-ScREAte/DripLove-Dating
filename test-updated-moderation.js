/**
 * Test updated moderation behavior
 */

// Mock the updated moderation logic
const MODERATION_FLAGS = {
  EXPLICIT_CONTENT: 'Explicit content detected',
  ADULT_CONTENT: 'Adult content detected',
  VIOLENCE: 'Violent content detected',
  INAPPROPRIATE: 'Inappropriate content detected',
  NO_FACE_DETECTED: 'No face detected in image',
  POOR_QUALITY: 'Image quality is too poor',
  MULTIPLE_FACES: 'Multiple faces detected',
  INVALID_IMAGE: 'Invalid or corrupted image'
};

function testUpdatedModerationThresholds() {
  console.log('🧪 Testing UPDATED Moderation Thresholds\n');

  // Test scenarios based on updated logic
  const testCases = [
    { skinTone: 0.25, desc: "Normal portrait (25% skin)" },
    { skinTone: 0.35, desc: "Normal photo with arms showing (35% skin)" },
    { skinTone: 0.45, desc: "Casual photo, t-shirt (45% skin)" },
    { skinTone: 0.55, desc: "Sleeveless top (55% skin)" },
    { skinTone: 0.65, desc: "Beach photo, swimwear (65% skin)" },
    { skinTone: 0.72, desc: "Workout photo (72% skin)" },
    { skinTone: 0.78, desc: "Summer outdoor photo (78% skin)" },
    { skinTone: 0.82, desc: "High skin content (82% skin)" },
    { skinTone: 0.87, desc: "Very high skin content (87% skin)" },
    { skinTone: 0.92, desc: "Explicit content (92% skin)" }
  ];

  testCases.forEach(testCase => {
    const result = simulateUpdatedModeration(testCase.skinTone);
    console.log(`📸 ${testCase.desc}:`);
    console.log(`   Skin Tone: ${(testCase.skinTone * 100).toFixed(1)}%`);
    console.log(`   Flags: ${result.flags.length ? result.flags.join(', ') : 'None'}`);
    console.log(`   Scores: Adult=${result.adultContent}, Explicit=${result.explicitContent}, Suggestive=${result.suggestiveContent}`);
    console.log(`   Decision: ${result.requiresReview ? '🔒 REQUIRES REVIEW (pending)' : '✅ AUTO-APPROVED'}`);
    console.log('');
  });
}

function simulateUpdatedModeration(skinToneRatio) {
  const flags = [];
  let adultContent = 0;
  let explicitContent = 0;
  let suggestiveContent = 0;

  // Updated logic from photoModeration.ts
  if (skinToneRatio < 0.3) {
    // Auto-approve
    return {
      flags: [],
      adultContent: 0,
      explicitContent: 0,
      suggestiveContent: 0,
      requiresReview: false
    };
  }

  if (skinToneRatio > 0.90) {
    explicitContent = 90;
    flags.push(MODERATION_FLAGS.EXPLICIT_CONTENT);
  }
  else if (skinToneRatio > 0.85) {
    adultContent = 80;
    flags.push(MODERATION_FLAGS.ADULT_CONTENT);
  }
  else if (skinToneRatio > 0.80) {
    suggestiveContent = 70;
  }

  // Check if requires review (updated combineResults logic)
  const hasContentFlags = flags.some(flag =>
    flag === MODERATION_FLAGS.EXPLICIT_CONTENT ||
    flag === MODERATION_FLAGS.ADULT_CONTENT ||
    flag === MODERATION_FLAGS.INAPPROPRIATE
  );

  const requiresReview = hasContentFlags ||
    (adultContent && adultContent > 85) ||
    (explicitContent && explicitContent > 90) ||
    (suggestiveContent && suggestiveContent > 80);

  return {
    flags,
    adultContent,
    explicitContent,
    suggestiveContent,
    requiresReview
  };
}

testUpdatedModerationThresholds();
