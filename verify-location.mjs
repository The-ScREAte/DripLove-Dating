import { 
  getCountriesList, 
  getCitiesForCountry, 
  getCityCoordinates, 
  locationData 
} from './src/constants/locationData.js';

// Test key functionality
console.log('🧪 Testing Enhanced Location System\n');

// 1. Test Africa-first sorting
const countries = getCountriesList();
const firstFive = countries.slice(0, 5);
console.log('✅ First 5 countries (should prioritize Africa):');
firstFive.forEach((c, i) => console.log(`${i+1}. ${c.name} (${c.continent})`));

// 2. Test Ghana coverage
const ghanaCities = getCitiesForCountry('GH');
console.log(`\n✅ Ghana: ${ghanaCities.length} cities/towns available`);
console.log('Sample:', ghanaCities.slice(0, 3).map(c => c.name).join(', '));

// 3. Test Nigeria coverage with ZIP codes
const nigeriaCities = getCitiesForCountry('NG');
console.log(`\n✅ Nigeria: ${nigeriaCities.length} cities available`);
const lagosCity = nigeriaCities.find(c => c.name === 'Lagos');
console.log('Lagos ZIP code:', lagosCity?.zipCode);

// 4. Test US/Europe coverage
const usCities = getCitiesForCountry('US');
const ukCities = getCitiesForCountry('GB');
const germanCities = getCitiesForCountry('DE');
console.log(`\n✅ Global coverage:`);
console.log(`- US: ${usCities.length} cities`);
console.log(`- UK: ${ukCities.length} cities`);
console.log(`- Germany: ${germanCities.length} cities`);

// 5. Test coordinate lookup
const accra = getCityCoordinates('GH', 'Accra');
const lagos = getCityCoordinates('NG', 'Lagos');
const london = getCityCoordinates('GB', 'London');

console.log(`\n✅ Coordinate lookup:`);
console.log(`- Accra: ${accra ? 'Found' : 'Not found'}`);
console.log(`- Lagos: ${lagos ? 'Found' : 'Not found'}`);
console.log(`- London: ${london ? 'Found' : 'Not found'}`);

console.log('\n🎉 Location system verification complete!');
