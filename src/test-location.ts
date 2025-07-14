// Test the enhanced location system
import { 
  getCountriesList, 
  getCitiesForCountry, 
  getCityCoordinates, 
  locationData 
} from '@/constants/locationData';

console.log('=== Testing Enhanced Location System ===');

// Test 1: Check if countries are prioritized correctly (Africa first)
const countries = getCountriesList();
console.log('\n1. Countries (first 10):');
countries.slice(0, 10).forEach((country, index) => {
  console.log(`${index + 1}. ${country.name} (${country.code}) - ${country.continent}`);
});

// Test 2: Check Ghana cities
const ghanaCities = getCitiesForCountry('GH');
console.log(`\n2. Ghana has ${ghanaCities.length} cities/towns`);
console.log('Sample Ghana cities:');
ghanaCities.slice(0, 10).forEach(city => {
  console.log(`- ${city.name}, ${city.state} (${city.latitude}, ${city.longitude})`);
});

// Test 3: Check Nigeria cities
const nigeriaCities = getCitiesForCountry('NG');
console.log(`\n3. Nigeria has ${nigeriaCities.length} cities/towns`);
console.log('Sample Nigeria cities:');
nigeriaCities.slice(0, 10).forEach(city => {
  console.log(`- ${city.name}, ${city.state} (${city.latitude}, ${city.longitude}) ${city.zipCode ? `ZIP: ${city.zipCode}` : ''}`);
});

// Test 4: Check US cities
const usCities = getCitiesForCountry('US');
console.log(`\n4. United States has ${usCities.length} cities`);
console.log('Sample US cities with ZIP codes:');
usCities.slice(0, 10).forEach(city => {
  console.log(`- ${city.name}, ${city.state} ${city.zipCode ? `(${city.zipCode})` : ''}`);
});

// Test 5: Check UK cities
const ukCities = getCitiesForCountry('GB');
console.log(`\n5. United Kingdom has ${ukCities.length} cities`);
console.log('Sample UK cities with postcodes:');
ukCities.slice(0, 10).forEach(city => {
  console.log(`- ${city.name}, ${city.state} ${city.zipCode ? `(${city.zipCode})` : ''}`);
});

// Test 6: Check European coverage
const europeanCountries = countries.filter(c => c.continent === 'Europe');
console.log(`\n6. European countries: ${europeanCountries.length}`);
europeanCountries.forEach(country => {
  const cities = getCitiesForCountry(country.code);
  console.log(`- ${country.name}: ${cities.length} cities`);
});

// Test 7: Test coordinate lookup
const accraCoords = getCityCoordinates('GH', 'Accra');
const lagosCoords = getCityCoordinates('NG', 'Lagos');
const londonCoords = getCityCoordinates('GB', 'London');

console.log('\n7. Coordinate lookup test:');
console.log(`Accra: ${accraCoords ? `${accraCoords.latitude}, ${accraCoords.longitude}` : 'Not found'}`);
console.log(`Lagos: ${lagosCoords ? `${lagosCoords.latitude}, ${lagosCoords.longitude} (ZIP: ${lagosCoords.zipCode})` : 'Not found'}`);
console.log(`London: ${londonCoords ? `${londonCoords.latitude}, ${londonCoords.longitude} (${londonCoords.zipCode})` : 'Not found'}`);

console.log('\n=== Location System Test Complete ===');
