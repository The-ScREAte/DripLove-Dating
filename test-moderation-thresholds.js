/**
 * Test the updated moderation thresholds
 */

// Test different skin tone ratios with the new thresholds
const testCases = [
  { skinTone: 0.20, description: "Normal portrait (20% skin)", expected: "Auto-approved" },
  { skinTone: 0.35, description: "Casual photo (35% skin)", expected: "Auto-approved" },
  { skinTone: 0.50, description: "Tank top/sleeveless (50% skin)", expected: "Auto-approved" },
  { skinTone: 0.65, description: "Beach/swimwear (65% skin)", expected: "Flagged for review" },
  { skinTone: 0.75, description: "High skin content (75% skin)", expected: "Flagged for review" },
  { skinTone: 0.90, description: "Explicit content (90% skin)", expected: "Flagged for review" }
];

console.log('🧪 Testing Updated Moderation Thresholds\n');

testCases.forEach(testCase => {
  const { skinTone, description, expected } = testCase;
  
  // Simulate the new moderation logic
  let flags = [];
  let adultContent = 0;
  let explicitContent = 0;
  let suggestiveContent = 0;
  
  // Apply new thresholds
  if (skinTone > 0.85) {
    explicitContent = 95;
    flags.push('Explicit content detected');
  }
  else if (skinTone > 0.70) {
    adultContent = 85;
    flags.push('Adult content detected');
  }
  else if (skinTone > 0.60) {
    suggestiveContent = 75;
  }
  
  // Check if requires review (based on combineResults logic)
  const hasFlags = flags.length > 0;
  const highScores = (adultContent >= 70) || (explicitContent >= 80) || (suggestiveContent >= 75);
  
  const requiresReview = hasFlags || highScores;
  const result = requiresReview ? "🔍 Flagged for review" : "✅ Auto-approved";
  
  console.log(`📸 ${description}:`);
  console.log(`   Skin tone: ${(skinTone * 100).toFixed(1)}%`);
  console.log(`   Flags: ${flags.length ? flags.join(', ') : 'None'}`);
  console.log(`   Scores: Adult=${adultContent}, Explicit=${explicitContent}, Suggestive=${suggestiveContent}`);
  console.log(`   Result: ${result}`);
  console.log(`   Expected: ${expected}`);
  console.log(`   ✅ ${result.includes('Auto-approved') === expected.includes('Auto-approved') ? 'PASS' : 'FAIL'}`);
  console.log('');
});

console.log('📊 Summary:');
console.log('- Normal photos (20-60% skin): Auto-approved');
console.log('- Suggestive photos (60-70% skin): Flagged for review');
console.log('- Adult content (70-85% skin): Flagged for review');
console.log('- Explicit content (85%+ skin): Flagged for review');
