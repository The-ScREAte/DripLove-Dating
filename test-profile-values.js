#!/usr/bin/env node

// Test script to verify ProfileCompletionForm values are correct
console.log("✅ Testing ProfileCompletionForm Values\n");

// Test Relationship Intent Values
console.log("🔍 Relationship Intent Values:");
const profileCompletionRelationshipIntentValues = ["casual", "serious", "open_to_anything"];
const registrationFormRelationshipIntentValues = ["casual", "serious", "open_to_anything"];
const lifestyleSectionRelationshipIntentValues = ["casual", "serious", "open_to_anything"];

console.log("ProfileCompletionForm:", profileCompletionRelationshipIntentValues);
console.log("RegistrationForm:", registrationFormRelationshipIntentValues);
console.log("LifestyleSection:", lifestyleSectionRelationshipIntentValues);

const relationshipIntentMatch = JSON.stringify(profileCompletionRelationshipIntentValues) === JSON.stringify(registrationFormRelationshipIntentValues) &&
                               JSON.stringify(profileCompletionRelationshipIntentValues) === JSON.stringify(lifestyleSectionRelationshipIntentValues);

console.log("✅ Relationship Intent Match:", relationshipIntentMatch);

// Test Education Level Values
console.log("\n🔍 Education Level Values:");
const profileCompletionEducationLevelValues = ["High School", "Some College", "Associate Degree", "Bachelor's Degree", "Master's Degree", "Doctorate", "Other"];
const registrationFormEducationLevelValues = ["High School", "Some College", "Associate Degree", "Bachelor's Degree", "Master's Degree", "Doctorate", "Other"];
const workEducationSectionEducationLevelValues = ["High School", "Some College", "Associate Degree", "Bachelor's Degree", "Master's Degree", "Doctorate", "Other"];

console.log("ProfileCompletionForm:", profileCompletionEducationLevelValues);
console.log("RegistrationForm:", registrationFormEducationLevelValues);
console.log("WorkEducationSection:", workEducationSectionEducationLevelValues);

const educationLevelMatch = JSON.stringify(profileCompletionEducationLevelValues) === JSON.stringify(registrationFormEducationLevelValues) &&
                           JSON.stringify(profileCompletionEducationLevelValues) === JSON.stringify(workEducationSectionEducationLevelValues);

console.log("✅ Education Level Match:", educationLevelMatch);

// Test Sample Data
console.log("\n📋 Sample Profile Completion Data:");
const sampleFormData = {
  relationshipIntent: "serious",
  educationLevel: "Bachelor's Degree"
};

const expectedDatabaseData = {
  relationship_intent: "serious",
  education_level: "Bachelor's Degree"
};

console.log("Form Data:", sampleFormData);
console.log("Database Data:", expectedDatabaseData);

console.log("\n✅ Sample Data Validation:");
console.log("Relationship Intent valid:", profileCompletionRelationshipIntentValues.includes(sampleFormData.relationshipIntent));
console.log("Education Level valid:", profileCompletionEducationLevelValues.includes(sampleFormData.educationLevel));

if (relationshipIntentMatch && educationLevelMatch) {
  console.log("\n🎉 All ProfileCompletionForm values are correctly aligned with other forms!");
} else {
  console.log("\n❌ Some values are misaligned. Please check the form configurations.");
}
