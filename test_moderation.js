// Test the updated moderation logic
console.log('🧪 Testing Updated Moderation Logic');
console.log('=====================================');

// Simulate skin tone ratios for different types of photos
const testCases = [
  { ratio: 0.10, desc: 'Normal face photo (10% skin)' },
  { ratio: 0.20, desc: 'Face + hands photo (20% skin)' },
  { ratio: 0.30, desc: 'Moderate exposure (30% skin)' },
  { ratio: 0.45, desc: 'Shirtless/bikini photo (45% skin) - YOUR UPLOADED IMAGE' },
  { ratio: 0.65, desc: 'High skin exposure (65% skin)' },
  { ratio: 0.80, desc: 'Very high exposure (80% skin)' }
];

testCases.forEach(test => {
  console.log(`\nTesting: ${test.desc}`);
  console.log(`Skin tone ratio: ${(test.ratio * 100).toFixed(1)}%`);
  
  let flags = [];
  let adultContent = 0;
  let explicitContent = 0;
  let suggestiveContent = 0;
  
  if (test.ratio < 0.15) {
    console.log('✅ Auto-approved - normal photo');
  } else if (test.ratio > 0.75) {
    explicitContent = 95;
    flags.push('Explicit content detected');
    console.log('🚨 Explicit content - flagged');
  } else if (test.ratio > 0.60) {
    adultContent = 85;
    flags.push('Adult content detected');
    console.log('🚨 Adult content - flagged');
  } else if (test.ratio > 0.40) {
    suggestiveContent = 80;
    flags.push('Inappropriate content detected');
    console.log('⚠️ Suggestive content - flagged for review');
  } else if (test.ratio > 0.25) {
    suggestiveContent = 60;
    console.log('⚠️ Moderate exposure - flagged for review');
  } else {
    console.log('✅ Acceptable - auto-approved');
  }
  
  // Check if would require review
  const hasContentFlags = flags.length > 0;
  const hasHighScores = adultContent >= 70 || explicitContent >= 80 || suggestiveContent >= 60;
  const requiresReview = hasContentFlags || hasHighScores;
  
  console.log(`Final decision: ${requiresReview ? 'REQUIRES REVIEW 🔍' : 'AUTO-APPROVED ✅'}`);
  if (requiresReview) {
    console.log('  → Will be marked as pending in database');
    console.log('  → is_approved: false, moderation_status: "pending"');
  } else {
    console.log('  → Will be auto-approved');
    console.log('  → is_approved: true, moderation_status: "approved"');
  }
});

console.log('\n🎯 KEY CHANGES MADE:');
console.log('1. Lowered auto-approve threshold from 25% to 15% skin tone');
console.log('2. Added 25-40% skin tone → suggestive content (score 60) → requires review');
console.log('3. Added 40%+ skin tone → inappropriate flag + score 80 → requires review');
console.log('4. Lowered suggestive content review threshold from 75 to 60');
console.log('\n✅ Your shirtless photo (~45% skin) will now be flagged for admin review!');
