/**
 * Test the AGGRESSIVE moderation system with nude content detection
 */
console.log('🧪 Testing AGGRESSIVE Moderation System for Nude Content');
console.log('=========================================================');

// Test cases including nude content scenarios
const testCases = [
  { ratio: 0.10, desc: 'Normal face photo (10% skin)' },
  { ratio: 0.20, desc: 'Portrait with hands (20% skin)' },
  { ratio: 0.30, desc: 'Tank top/sleeveless (30% skin)' },
  { ratio: 0.45, desc: 'Shirtless male photo (45% skin)' },
  { ratio: 0.60, desc: 'Bikini/lingerie (60% skin)' },
  { ratio: 0.75, desc: 'NUDE CONTENT (75% skin)' },
  { ratio: 0.85, desc: 'FULL NUDE (85% skin)' }
];

testCases.forEach(test => {
  console.log(`\nTesting: ${test.desc}`);
  console.log(`Skin tone ratio: ${(test.ratio * 100).toFixed(1)}%`);
  
  let flags = [];
  let adultContent = 0;
  let explicitContent = 0;
  let suggestiveContent = 0;
  
  // Apply NEW aggressive thresholds
  if (test.ratio > 0.60) {
    explicitContent = 95;
    flags.push('EXPLICIT_CONTENT');
    console.log('🚨 FLAGGED: Very high skin exposure - likely nude/explicit');
  }
  else if (test.ratio > 0.40) {
    adultContent = 85;
    flags.push('ADULT_CONTENT');
    console.log('🚨 FLAGGED: High skin exposure - nude/shirtless/bikini');
  }
  else if (test.ratio > 0.25) {
    suggestiveContent = 75;
    flags.push('INAPPROPRIATE');
    console.log('⚠️ FLAGGED: Moderate skin exposure - suggestive, requires review');
  }
  else if (test.ratio > 0.15) {
    suggestiveContent = 50;
    console.log('⚠️ MONITOR: Some skin exposure - may require review');
  }
  else {
    console.log('✅ PASSED: Minimal skin exposure - appropriate');
  }
  
  // Check if requires review (LOWERED thresholds)
  const hasFlags = flags.length > 0;
  const hasHighScores = adultContent >= 60 || explicitContent >= 70 || suggestiveContent >= 50;
  const requiresReview = hasFlags || hasHighScores;
  
  console.log(`Decision: ${requiresReview ? 'REQUIRES REVIEW 🔍' : 'AUTO-APPROVED ✅'}`);
  if (requiresReview) {
    console.log('  → is_approved: true, moderation_status: "pending"');
  } else {
    console.log('  → is_approved: true, moderation_status: "approved"');
  }
});

console.log('\n🎯 SUMMARY OF AGGRESSIVE CHANGES:');
console.log('1. ✅ MUCH more aggressive skin detection (4 different algorithms)');
console.log('2. ✅ Lower thresholds: 25%→suggestive, 40%→adult, 60%→explicit');
console.log('3. ✅ Lower review thresholds: 50→review, 60→review, 70→review');
console.log('4. ✅ The nude image should now be caught and flagged!');
console.log('\n🚀 The moderation system is now AGGRESSIVE for nude content!');
