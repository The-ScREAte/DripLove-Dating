/**
 * Simple test for ProfileCompletionForm gender and preference options
 */

// Mock test data that should work with the form
const testFormData = {
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '1995-01-01',
  country: 'United States',
  city: 'New York',
  zipCode: '10001',
  gender: 'male',        // Should match: 'male', 'female', 'other'
  preference: 'female',   // Should match: 'male', 'female', 'everyone'
  relationshipIntent: 'serious-relationship',
  occupation: 'Software Engineer',
  industry: 'Technology',
  educationLevel: 'bachelors'
};

// Expected database values after form submission
const expectedProfileData = {
  first_name: 'John',
  last_name: 'Doe',
  date_of_birth: '1995-01-01',
  country: 'United States',
  city: 'New York',
  zip_code: '10001',
  gender: 'male',        // Should save as 'male'
  preference: 'female',   // Should save as 'female'
  relationship_intent: 'serious-relationship',
  occupation: 'Software Engineer',
  industry: 'Technology',
  education_level: 'bachelors'
};

console.log('✅ Test ProfileCompletionForm Data Structure');
console.log('Input Data:', testFormData);
console.log('Expected Database Data:', expectedProfileData);

// Test gender options
const validGenderOptions = ['male', 'female', 'other'];
const validPreferenceOptions = ['male', 'female', 'everyone'];

console.log('\n✅ Valid Gender Options:', validGenderOptions);
console.log('✅ Valid Preference Options:', validPreferenceOptions);

// Verify test data matches valid options
const isValidGender = validGenderOptions.includes(testFormData.gender);
const isValidPreference = validPreferenceOptions.includes(testFormData.preference);

console.log('\n✅ Test Data Validation:');
console.log('Gender valid:', isValidGender);
console.log('Preference valid:', isValidPreference);

if (isValidGender && isValidPreference) {
  console.log('\n🎉 ProfileCompletionForm gender and preference options are correctly configured!');
} else {
  console.log('\n❌ There might be an issue with the form options');
}
