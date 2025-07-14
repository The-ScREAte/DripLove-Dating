/**
 * Test current moderation behavior to understand what's happening
 */

// Mock the moderation logic to test thresholds
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

function testModerationThresholds() {
  console.log('🧪 Testing Current Moderation Thresholds\n');

  // Test scenarios based on current logic
  const testCases = [
    { skinTone: 0.25, desc: "Normal portrait (25% skin)" },
    { skinTone: 0.35, desc: "Normal photo with arms showing (35% skin)" },
    { skinTone: 0.45, desc: "Casual photo, t-shirt (45% skin)" },
    { skinTone: 0.55, desc: "Sleeveless top (55% skin)" },
    { skinTone: 0.65, desc: "Beach photo, swimwear (65% skin)" },
    { skinTone: 0.72, desc: "Workout photo (72% skin)" },
    { skinTone: 0.82, desc: "Inappropriate content (82% skin)" },
    { skinTone: 0.95, desc: "Explicit content (95% skin)" }
  ];

  testCases.forEach(testCase => {
    const result = simulateModeration(testCase.skinTone);
    console.log(`📸 ${testCase.desc}:`);
    console.log(`   Skin Tone: ${(testCase.skinTone * 100).toFixed(1)}%`);
    console.log(`   Flags: ${result.flags.length ? result.flags.join(', ') : 'None'}`);
    console.log(`   Scores: Adult=${result.adultContent}, Explicit=${result.explicitContent}, Suggestive=${result.suggestiveContent}`);
    console.log(`   Decision: ${result.requiresReview ? '🔒 REQUIRES REVIEW (pending)' : '✅ AUTO-APPROVED'}`);
    console.log('');
  });
}

function simulateModeration(skinToneRatio) {
  const flags = [];
  let adultContent = 0;
  let explicitContent = 0;
  let suggestiveContent = 0;

  // Current logic from photoModeration.ts
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

  if (skinToneRatio > 0.80) {
    explicitContent = 85;
    flags.push(MODERATION_FLAGS.EXPLICIT_CONTENT);
  }
  else if (skinToneRatio > 0.70) {
    adultContent = 75;
    flags.push(MODERATION_FLAGS.ADULT_CONTENT);
  }
  else if (skinToneRatio > 0.60) {
    suggestiveContent = 60;
  }

  // Check if requires review (from combineResults logic)
  const hasContentFlags = flags.some(flag =>
    flag === MODERATION_FLAGS.EXPLICIT_CONTENT ||
    flag === MODERATION_FLAGS.ADULT_CONTENT ||
    flag === MODERATION_FLAGS.INAPPROPRIATE
  );

  const requiresReview = hasContentFlags ||
    (adultContent && adultContent > 75) ||
    (explicitContent && explicitContent > 85) ||
    (suggestiveContent && suggestiveContent > 65);

  return {
    flags,
    adultContent,
    explicitContent,
    suggestiveContent,
    requiresReview
  };
}

testModerationThresholds();
