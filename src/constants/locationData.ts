// Comprehensive location data with focus on Africa

export interface CityData {
  name: string;
  state?: string; // For countries with states/provinces
  latitude: number;
  longitude: number;
  population?: number;
  zipCode?: string; // Example ZIP/postal code for the city
}

export interface CountryData {
  name: string;
  code: string;
  continent: string;
  majorCities: CityData[];
  currency: string;
  phoneCode: string;
}

// African countries with their major cities and coordinates
export const locationData: Record<string, CountryData> = {
  // West Africa
  nigeria: {
    name: 'Nigeria',
    code: 'NG',
    continent: 'Africa',
    currency: 'NGN',
    phoneCode: '+234',
    majorCities: [
      // Major Cities
      { name: 'Lagos', state: 'Lagos', latitude: 6.5244, longitude: 3.3792, population: 15000000, zipCode: '101001' },
      { name: 'Abuja', state: 'FCT', latitude: 9.0579, longitude: 7.4951, population: 3000000, zipCode: '900001' },
      { name: 'Kano', state: 'Kano', latitude: 11.9956, longitude: 8.5226, population: 4000000, zipCode: '700001' },
      { name: 'Ibadan', state: 'Oyo', latitude: 7.3775, longitude: 3.9470, population: 3500000, zipCode: '200001' },
      { name: 'Port Harcourt', state: 'Rivers', latitude: 4.8156, longitude: 7.0498, population: 2000000, zipCode: '500001' },
      { name: 'Benin City', state: 'Edo', latitude: 6.3350, longitude: 5.6037, population: 1500000, zipCode: '300001' },
      { name: 'Maiduguri', state: 'Borno', latitude: 11.8311, longitude: 13.1511, population: 1200000, zipCode: '600001' },
      { name: 'Zaria', state: 'Kaduna', latitude: 11.0449, longitude: 7.7336, population: 1000000, zipCode: '810001' },
      { name: 'Aba', state: 'Abia', latitude: 5.1066, longitude: 7.3667, population: 900000, zipCode: '450001' },
      { name: 'Jos', state: 'Plateau', latitude: 9.9285, longitude: 8.8921, population: 900000, zipCode: '930001' },
      { name: 'Ilorin', state: 'Kwara', latitude: 8.5000, longitude: 4.5500, population: 800000, zipCode: '240001' },
      { name: 'Kaduna', state: 'Kaduna', latitude: 10.5222, longitude: 7.4383, population: 760000, zipCode: '800001' },
      { name: 'Warri', state: 'Delta', latitude: 5.5167, longitude: 5.7500, population: 750000, zipCode: '332001' },
      { name: 'Ogbomoso', state: 'Oyo', latitude: 8.1333, longitude: 4.2500, population: 650000, zipCode: '210001' },
      { name: 'Abeokuta', state: 'Ogun', latitude: 7.1333, longitude: 3.3500, population: 600000, zipCode: '110001' },
      { name: 'Onitsha', state: 'Anambra', latitude: 6.1667, longitude: 6.7833, population: 560000, zipCode: '434001' },
      { name: 'Enugu', state: 'Enugu', latitude: 6.4500, longitude: 7.5000, population: 520000, zipCode: '400001' },
      { name: 'Sokoto', state: 'Sokoto', latitude: 13.0622, longitude: 5.2339, population: 500000, zipCode: '840001' },
      { name: 'Uyo', state: 'Akwa Ibom', latitude: 5.0333, longitude: 7.9333, population: 450000, zipCode: '520001' },
      { name: 'Calabar', state: 'Cross River', latitude: 4.9833, longitude: 8.3333, population: 420000, zipCode: '540001' },
      { name: 'Akure', state: 'Ondo', latitude: 7.2500, longitude: 5.2000, population: 400000, zipCode: '340001' },
      { name: 'Bauchi', state: 'Bauchi', latitude: 10.3167, longitude: 9.8333, population: 380000, zipCode: '740001' },
      { name: 'Minna', state: 'Niger', latitude: 9.6167, longitude: 6.5500, population: 350000, zipCode: '920001' },
      { name: 'Osogbo', state: 'Osun', latitude: 7.7667, longitude: 4.5667, population: 340000, zipCode: '230001' },
      { name: 'Gombe', state: 'Gombe', latitude: 10.2833, longitude: 11.1667, population: 320000, zipCode: '760001' },
      { name: 'Owerri', state: 'Imo', latitude: 5.4833, longitude: 7.0333, population: 310000, zipCode: '460001' },
      { name: 'Awka', state: 'Anambra', latitude: 6.2167, longitude: 7.0667, population: 300000, zipCode: '420001' },
      { name: 'Lafia', state: 'Nasarawa', latitude: 8.5000, longitude: 8.5167, population: 290000, zipCode: '950001' },
      { name: 'Yenagoa', state: 'Bayelsa', latitude: 4.9167, longitude: 6.2667, population: 280000, zipCode: '561001' },
      { name: 'Makurdi', state: 'Benue', latitude: 7.7333, longitude: 8.5333, population: 270000, zipCode: '970001' },
      { name: 'Ado Ekiti', state: 'Ekiti', latitude: 7.6167, longitude: 5.2167, population: 250000, zipCode: '360001' },
      { name: 'Yola', state: 'Adamawa', latitude: 9.2000, longitude: 12.4833, population: 240000, zipCode: '640001' },
      { name: 'Asaba', state: 'Delta', latitude: 6.1833, longitude: 6.7500, population: 230000, zipCode: '320001' },
      { name: 'Nnewi', state: 'Anambra', latitude: 6.0167, longitude: 6.9167, population: 220000, zipCode: '435001' },
      { name: 'Abakaliki', state: 'Ebonyi', latitude: 6.3167, longitude: 8.1167, population: 200000, zipCode: '480001' },
      { name: 'Lokoja', state: 'Kogi', latitude: 7.8000, longitude: 6.7333, population: 190000, zipCode: '260001' },
      { name: 'Birnin Kebbi', state: 'Kebbi', latitude: 12.4500, longitude: 4.2000, population: 180000, zipCode: '860001' },
      { name: 'Jalingo', state: 'Taraba', latitude: 8.9000, longitude: 11.3667, population: 170000, zipCode: '660001' },
      { name: 'Dutse', state: 'Jigawa', latitude: 11.7000, longitude: 9.3333, population: 160000, zipCode: '720001' },
      { name: 'Damaturu', state: 'Yobe', latitude: 11.7489, longitude: 11.9611, population: 150000, zipCode: '620001' },
      { name: 'Katsina', state: 'Katsina', latitude: 13.0000, longitude: 7.6000, population: 350000, zipCode: '820001' },
      { name: 'Ile-Ife', state: 'Osun', latitude: 7.4833, longitude: 4.5667, population: 280000, zipCode: '220001' },
      { name: 'Ado-Odo', state: 'Ogun', latitude: 6.5333, longitude: 3.0500, population: 140000, zipCode: '112001' },
      { name: 'Sagamu', state: 'Ogun', latitude: 6.8333, longitude: 3.6667, population: 190000, zipCode: '121001' },
      { name: 'Ijebu Ode', state: 'Ogun', latitude: 6.8167, longitude: 3.9167, population: 170000, zipCode: '120001' }
    ]
  },
  ghana: {
    name: 'Ghana',
    code: 'GH',
    continent: 'Africa',
    currency: 'GHS',
    phoneCode: '+233',
    majorCities: [
      // Greater Accra Region
      { name: 'Accra', state: 'Greater Accra', latitude: 5.6037, longitude: -0.1870, population: 2500000 },
      { name: 'Tema', state: 'Greater Accra', latitude: 5.6698, longitude: -0.0166, population: 300000 },
      { name: 'Madina', state: 'Greater Accra', latitude: 5.6847, longitude: -0.1676, population: 150000 },
      { name: 'Adenta', state: 'Greater Accra', latitude: 5.7000, longitude: -0.1667, population: 120000 },
      { name: 'Teshie', state: 'Greater Accra', latitude: 5.5833, longitude: -0.1000, population: 110000 },
      { name: 'Nungua', state: 'Greater Accra', latitude: 5.5964, longitude: -0.0833, population: 100000 },
      { name: 'Ashaiman', state: 'Greater Accra', latitude: 5.6833, longitude: -0.0333, population: 95000 },
      { name: 'Dansoman', state: 'Greater Accra', latitude: 5.5333, longitude: -0.2833, population: 85000 },
      { name: 'Kaneshie', state: 'Greater Accra', latitude: 5.5667, longitude: -0.2333, population: 80000 },
      { name: 'Labadi', state: 'Greater Accra', latitude: 5.5619, longitude: -0.1522, population: 75000 },
      { name: 'Osu', state: 'Greater Accra', latitude: 5.5558, longitude: -0.1878, population: 70000 },
      { name: 'Achimota', state: 'Greater Accra', latitude: 5.6167, longitude: -0.2167, population: 65000 },
      { name: 'East Legon', state: 'Greater Accra', latitude: 5.6333, longitude: -0.1500, population: 60000 },
      { name: 'Spintex', state: 'Greater Accra', latitude: 5.6333, longitude: -0.0833, population: 55000 },
      
      // Ashanti Region
      { name: 'Kumasi', state: 'Ashanti', latitude: 6.6885, longitude: -1.6244, population: 2000000 },
      { name: 'Obuasi', state: 'Ashanti', latitude: 6.2027, longitude: -1.6708, population: 180000 },
      { name: 'Ejisu', state: 'Ashanti', latitude: 6.6667, longitude: -1.3833, population: 70000 },
      { name: 'Mampong', state: 'Ashanti', latitude: 7.0667, longitude: -1.4000, population: 65000 },
      { name: 'Konongo', state: 'Ashanti', latitude: 6.6167, longitude: -1.2167, population: 45000 },
      { name: 'Suame', state: 'Ashanti', latitude: 6.7000, longitude: -1.6500, population: 90000 },
      { name: 'Asante Mampong', state: 'Ashanti', latitude: 7.0667, longitude: -1.4000, population: 55000 },
      { name: 'Bekwai', state: 'Ashanti', latitude: 6.4667, longitude: -1.5833, population: 35000 },
      { name: 'Juaso', state: 'Ashanti', latitude: 6.8000, longitude: -1.3500, population: 25000 },
      { name: 'Agogo', state: 'Ashanti', latitude: 6.7833, longitude: -1.0833, population: 30000 },
      { name: 'Nkawie', state: 'Ashanti', latitude: 6.5500, longitude: -1.7833, population: 28000 },
      { name: 'Offinso', state: 'Ashanti', latitude: 7.0333, longitude: -1.6833, population: 32000 },
      
      // Northern Region
      { name: 'Tamale', state: 'Northern', latitude: 9.4034, longitude: -0.8424, population: 600000 },
      { name: 'Yendi', state: 'Northern', latitude: 9.4667, longitude: -0.0167, population: 80000 },
      { name: 'Savelugu', state: 'Northern', latitude: 9.6333, longitude: -0.8333, population: 40000 },
      { name: 'Gushegu', state: 'Northern', latitude: 10.0000, longitude: -0.3500, population: 30000 },
      { name: 'Bimbilla', state: 'Northern', latitude: 9.4167, longitude: -0.4667, population: 25000 },
      { name: 'Karaga', state: 'Northern', latitude: 9.9333, longitude: -0.4333, population: 20000 },
      { name: 'Tolon', state: 'Northern', latitude: 9.4167, longitude: -1.0500, population: 18000 },
      
      // Western Region
      { name: 'Takoradi', state: 'Western', latitude: 4.8845, longitude: -1.7554, population: 445000 },
      { name: 'Sekondi', state: 'Western', latitude: 4.9342, longitude: -1.7108, population: 85000 },
      { name: 'Axim', state: 'Western', latitude: 4.8667, longitude: -2.2333, population: 25000 },
      { name: 'Prestea', state: 'Western', latitude: 5.4333, longitude: -2.1333, population: 35000 },
      { name: 'Tarkwa', state: 'Western', latitude: 5.3000, longitude: -1.9833, population: 60000 },
      { name: 'Elubo', state: 'Western', latitude: 5.1333, longitude: -2.8000, population: 15000 },
      { name: 'Half Assini', state: 'Western', latitude: 4.9500, longitude: -2.8167, population: 12000 },
      { name: 'Bogoso', state: 'Western', latitude: 5.5333, longitude: -2.0500, population: 22000 },
      
      // Central Region
      { name: 'Cape Coast', state: 'Central', latitude: 5.1053, longitude: -1.2466, population: 200000 },
      { name: 'Kasoa', state: 'Central', latitude: 5.5320, longitude: -0.4163, population: 350000 },
      { name: 'Elmina', state: 'Central', latitude: 5.0833, longitude: -1.3500, population: 25000 },
      { name: 'Winneba', state: 'Central', latitude: 5.3500, longitude: -0.6167, population: 60000 },
      { name: 'Swedru', state: 'Central', latitude: 5.5333, longitude: -0.7000, population: 45000 },
      { name: 'Dunkwa', state: 'Central', latitude: 5.9667, longitude: -1.7833, population: 30000 },
      { name: 'Saltpond', state: 'Central', latitude: 5.2000, longitude: -1.0667, population: 25000 },
      { name: 'Agona Swedru', state: 'Central', latitude: 5.5333, longitude: -0.7000, population: 35000 },
      { name: 'Assin Fosu', state: 'Central', latitude: 5.7333, longitude: -1.2167, population: 28000 },
      { name: 'Asikuma', state: 'Central', latitude: 5.6833, longitude: -0.9333, population: 15000 },
      { name: 'Mankessim', state: 'Central', latitude: 5.2833, longitude: -1.0333, population: 32000 },
      { name: 'Anomabo', state: 'Central', latitude: 5.1667, longitude: -1.1333, population: 18000 },
      { name: 'Twifo Praso', state: 'Central', latitude: 5.6000, longitude: -1.5500, population: 20000 },
      
      // Eastern Region
      { name: 'Koforidua', state: 'Eastern', latitude: 6.0833, longitude: -0.2667, population: 120000 },
      { name: 'Akropong', state: 'Eastern', latitude: 5.9833, longitude: -0.0833, population: 15000 },
      { name: 'Mpraeso', state: 'Eastern', latitude: 6.5833, longitude: -0.7333, population: 12000 },
      { name: 'Nkawkaw', state: 'Eastern', latitude: 6.5500, longitude: -0.7667, population: 35000 },
      { name: 'Begoro', state: 'Eastern', latitude: 6.3833, longitude: -0.3833, population: 20000 },
      { name: 'Oda', state: 'Eastern', latitude: 5.9167, longitude: -0.9833, population: 65000 },
      { name: 'Asamankese', state: 'Eastern', latitude: 5.8667, longitude: -0.6667, population: 40000 },
      { name: 'Nsawam', state: 'Eastern', latitude: 5.8000, longitude: -0.3500, population: 50000 },
      { name: 'Suhum', state: 'Eastern', latitude: 6.0333, longitude: -0.4500, population: 35000 },
      { name: 'Aburi', state: 'Eastern', latitude: 5.8500, longitude: -0.1833, population: 18000 },
      { name: 'Somanya', state: 'Eastern', latitude: 6.0833, longitude: -0.0167, population: 25000 },
      { name: 'Akwatia', state: 'Eastern', latitude: 6.0333, longitude: -0.8000, population: 22000 },
      
      // Volta Region
      { name: 'Ho', state: 'Volta', latitude: 6.6000, longitude: 0.4667, population: 85000 },
      { name: 'Keta', state: 'Volta', latitude: 5.9167, longitude: 0.9833, population: 18000 },
      { name: 'Aflao', state: 'Volta', latitude: 6.1167, longitude: 1.1833, population: 66000 },
      { name: 'Hohoe', state: 'Volta', latitude: 7.1500, longitude: 0.4667, population: 60000 },
      { name: 'Kpando', state: 'Volta', latitude: 6.9833, longitude: 0.2833, population: 30000 },
      { name: 'Denu', state: 'Volta', latitude: 6.0667, longitude: 1.1167, population: 25000 },
      { name: 'Sogakope', state: 'Volta', latitude: 6.0000, longitude: 0.6167, population: 20000 },
      { name: 'Peki', state: 'Volta', latitude: 6.7500, longitude: 0.3833, population: 15000 },
      { name: 'Akatsi', state: 'Volta', latitude: 6.1500, longitude: 0.8000, population: 22000 },
      
      // Brong-Ahafo Region (now Bono and Ahafo)
      { name: 'Sunyani', state: 'Bono', latitude: 7.3333, longitude: -2.3333, population: 125000 },
      { name: 'Techiman', state: 'Bono East', latitude: 7.5833, longitude: -1.9333, population: 70000 },
      { name: 'Berekum', state: 'Bono', latitude: 7.4500, longitude: -2.5833, population: 55000 },
      { name: 'Goaso', state: 'Ahafo', latitude: 6.8000, longitude: -2.5167, population: 40000 },
      { name: 'Dormaa Ahenkro', state: 'Bono', latitude: 7.3667, longitude: -2.9500, population: 45000 },
      { name: 'Wenchi', state: 'Bono', latitude: 7.7333, longitude: -2.1000, population: 35000 },
      { name: 'Nkoranza', state: 'Bono East', latitude: 7.5500, longitude: -1.7167, population: 25000 },
      { name: 'Kintampo', state: 'Bono East', latitude: 8.0500, longitude: -1.7167, population: 30000 },
      { name: 'Atebubu', state: 'Bono East', latitude: 7.7500, longitude: -0.9833, population: 22000 },
      
      // Upper East Region  
      { name: 'Bolgatanga', state: 'Upper East', latitude: 10.7856, longitude: -0.8506, population: 70000 },
      { name: 'Navrongo', state: 'Upper East', latitude: 10.8956, longitude: -1.0939, population: 25000 },
      { name: 'Bawku', state: 'Upper East', latitude: 11.0500, longitude: -0.2333, population: 50000 },
      { name: 'Zebilla', state: 'Upper East', latitude: 10.8500, longitude: -0.5167, population: 20000 },
      { name: 'Paga', state: 'Upper East', latitude: 10.9833, longitude: -1.1000, population: 15000 },
      { name: 'Sandema', state: 'Upper East', latitude: 10.6167, longitude: -1.0667, population: 18000 },
      
      // Upper West Region
      { name: 'Wa', state: 'Upper West', latitude: 10.0600, longitude: -2.5000, population: 75000 },
      { name: 'Lawra', state: 'Upper West', latitude: 10.6500, longitude: -2.9000, population: 15000 },
      { name: 'Jirapa', state: 'Upper West', latitude: 10.6167, longitude: -2.7833, population: 20000 },
      { name: 'Tumu', state: 'Upper West', latitude: 10.9167, longitude: -2.2000, population: 18000 },
      { name: 'Nadowli', state: 'Upper West', latitude: 10.4167, longitude: -2.6333, population: 12000 },
      { name: 'Nandom', state: 'Upper West', latitude: 10.8667, longitude: -2.7500, population: 10000 },
      
      // North East Region
      { name: 'Nalerigu', state: 'North East', latitude: 10.5333, longitude: -0.3667, population: 15000 },
      { name: 'Walewale', state: 'North East', latitude: 10.3000, longitude: -0.8167, population: 30000 },
      { name: 'Gambaga', state: 'North East', latitude: 10.5167, longitude: -0.4333, population: 12000 },
      
      // Savannah Region
      { name: 'Damongo', state: 'Savannah', latitude: 9.0833, longitude: -1.8167, population: 35000 },
      { name: 'Bole', state: 'Savannah', latitude: 9.0333, longitude: -2.4833, population: 25000 },
      { name: 'Salaga', state: 'Savannah', latitude: 8.5500, longitude: -0.5167, population: 22000 },
      { name: 'Sawla', state: 'Savannah', latitude: 9.2667, longitude: -2.4167, population: 15000 },
      
      // Oti Region
      { name: 'Dambai', state: 'Oti', latitude: 8.1667, longitude: 0.4833, population: 20000 },
      { name: 'Nkwanta', state: 'Oti', latitude: 8.1000, longitude: 0.1667, population: 30000 },
      { name: 'Jasikan', state: 'Oti', latitude: 7.3833, longitude: 0.4500, population: 18000 },
      { name: 'Kadjebi', state: 'Oti', latitude: 7.5500, longitude: 0.4667, population: 15000 },
      
      // Western North Region
      { name: 'Sefwi Wiawso', state: 'Western North', latitude: 6.2167, longitude: -2.4833, population: 35000 },
      { name: 'Bibiani', state: 'Western North', latitude: 6.4667, longitude: -2.3167, population: 40000 },
      { name: 'Juabeso', state: 'Western North', latitude: 6.1000, longitude: -2.8333, population: 20000 },
      { name: 'Enchi', state: 'Western North', latitude: 5.8333, longitude: -2.8333, population: 25000 }
    ]
  },
  senegal: {
    name: 'Senegal',
    code: 'SN',
    continent: 'Africa',
    currency: 'XOF',
    phoneCode: '+221',
    majorCities: [
      { name: 'Dakar', latitude: 14.7167, longitude: -17.4677, population: 3500000 },
      { name: 'Thiès', latitude: 14.7886, longitude: -16.9260, population: 350000 },
      { name: 'Kaolack', latitude: 14.1617, longitude: -16.0729, population: 250000 },
      { name: 'Saint-Louis', latitude: 16.0200, longitude: -16.4833, population: 200000 },
      { name: 'Mbour', latitude: 14.4167, longitude: -16.9667, population: 180000 },
      { name: 'Rufisque', latitude: 14.7167, longitude: -17.2667, population: 160000 },
      { name: 'Ziguinchor', latitude: 12.5833, longitude: -16.2667, population: 150000 },
      { name: 'Diourbel', latitude: 14.6500, longitude: -16.2333, population: 120000 },
      { name: 'Louga', latitude: 15.6167, longitude: -16.2167, population: 100000 },
      { name: 'Tambacounda', latitude: 13.7667, longitude: -13.6833, population: 90000 },
      { name: 'Kolda', latitude: 12.9000, longitude: -14.9500, population: 80000 },
      { name: 'Matam', latitude: 15.6500, longitude: -13.2500, population: 70000 },
      { name: 'Fatick', latitude: 14.3333, longitude: -16.4000, population: 60000 },
      { name: 'Kaffrine', latitude: 14.1000, longitude: -15.5500, population: 55000 },
      { name: 'Sédhiou', latitude: 12.7000, longitude: -15.5500, population: 50000 },
      { name: 'Kédougou', latitude: 12.5500, longitude: -12.1833, population: 45000 },
      { name: 'Pikine', latitude: 14.7500, longitude: -17.3833, population: 900000 },
      { name: 'Guédiawaye', latitude: 14.7833, longitude: -17.3833, population: 350000 },
      { name: 'Richard Toll', latitude: 16.4667, longitude: -15.7000, population: 65000 },
      { name: 'Tivaouane', latitude: 14.9500, longitude: -16.8167, population: 55000 },
      { name: 'Touba', latitude: 14.8500, longitude: -15.8833, population: 500000 },
      { name: 'Mbacké', latitude: 14.7833, longitude: -15.9000, population: 100000 },
      { name: 'Nioro du Rip', latitude: 13.7500, longitude: -15.8000, population: 40000 },
      { name: 'Vélingara', latitude: 13.1500, longitude: -14.1167, population: 35000 },
      { name: 'Joal-Fadiouth', latitude: 14.1667, longitude: -16.8333, population: 45000 },
      { name: 'Saly', latitude: 14.4500, longitude: -17.0167, population: 30000 },
      { name: 'Gossas', latitude: 14.5000, longitude: -16.0667, population: 25000 },
      { name: 'Bignona', latitude: 12.8000, longitude: -16.2333, population: 30000 },
      { name: 'Oussouye', latitude: 12.4833, longitude: -16.5500, population: 20000 },
      { name: 'Dagana', latitude: 16.5167, longitude: -15.5000, population: 25000 }
    ]
  },
  // East Africa
  kenya: {
    name: 'Kenya',
    code: 'KE',
    continent: 'Africa',
    currency: 'KES',
    phoneCode: '+254',
    majorCities: [
      { name: 'Nairobi', state: 'Nairobi', latitude: -1.2921, longitude: 36.8219, population: 4500000 },
      { name: 'Mombasa', state: 'Coast', latitude: -4.0435, longitude: 39.6682, population: 1200000 },
      { name: 'Kisumu', state: 'Nyanza', latitude: -0.0917, longitude: 34.7680, population: 610000 },
      { name: 'Nakuru', state: 'Rift Valley', latitude: -0.3031, longitude: 36.0800, population: 570000 },
      { name: 'Eldoret', state: 'Rift Valley', latitude: 0.5143, longitude: 35.2699, population: 475000 },
      { name: 'Thika', state: 'Central', latitude: -1.0334, longitude: 37.0693, population: 200000 },
      { name: 'Malindi', state: 'Coast', latitude: -3.2138, longitude: 40.1169, population: 120000 },
      { name: 'Kitale', state: 'Rift Valley', latitude: 1.0156, longitude: 35.0062, population: 160000 },
      { name: 'Garissa', state: 'North Eastern', latitude: -0.4536, longitude: 39.6401, population: 120000 },
      { name: 'Nyeri', state: 'Central', latitude: -0.4169, longitude: 36.9511, population: 120000 },
      { name: 'Machakos', state: 'Eastern', latitude: -1.5177, longitude: 37.2634, population: 115000 },
      { name: 'Meru', state: 'Eastern', latitude: 0.0500, longitude: 37.6500, population: 95000 },
      { name: 'Lamu', state: 'Coast', latitude: -2.2686, longitude: 40.9020, population: 25000 },
      { name: 'Naivasha', state: 'Rift Valley', latitude: -0.7172, longitude: 36.4320, population: 85000 },
      { name: 'Kakamega', state: 'Western', latitude: 0.2827, longitude: 34.7519, population: 100000 },
      { name: 'Bungoma', state: 'Western', latitude: 0.5636, longitude: 34.5606, population: 85000 },
      { name: 'Kericho', state: 'Rift Valley', latitude: -0.3692, longitude: 35.2863, population: 75000 },
      { name: 'Embu', state: 'Eastern', latitude: -0.5389, longitude: 37.4583, population: 70000 },
      { name: 'Nanyuki', state: 'Central', latitude: 0.0167, longitude: 37.0667, population: 65000 },
      { name: 'Kilifi', state: 'Coast', latitude: -3.6305, longitude: 39.8499, population: 60000 },
      { name: 'Isiolo', state: 'Eastern', latitude: 0.3556, longitude: 37.5822, population: 45000 },
      { name: 'Migori', state: 'Nyanza', latitude: -1.0634, longitude: 34.4731, population: 55000 },
      { name: 'Homa Bay', state: 'Nyanza', latitude: -0.5167, longitude: 34.4500, population: 60000 },
      { name: 'Kisii', state: 'Nyanza', latitude: -0.6833, longitude: 34.7667, population: 85000 },
      { name: 'Narok', state: 'Rift Valley', latitude: -1.0833, longitude: 35.8667, population: 50000 },
      { name: 'Voi', state: 'Coast', latitude: -3.3833, longitude: 38.5667, population: 40000 },
      { name: 'Webuye', state: 'Western', latitude: 0.6167, longitude: 34.7667, population: 35000 },
      { name: 'Mumias', state: 'Western', latitude: 0.3333, longitude: 34.4833, population: 40000 },
      { name: 'Kapenguria', state: 'Rift Valley', latitude: 1.2333, longitude: 35.1000, population: 25000 },
      { name: 'Lodwar', state: 'Rift Valley', latitude: 3.1167, longitude: 35.5833, population: 35000 }
    ]
  },
  ethiopia: {
    name: 'Ethiopia',
    code: 'ET',
    continent: 'Africa',
    currency: 'ETB',
    phoneCode: '+251',
    majorCities: [
      { name: 'Addis Ababa', state: 'Addis Ababa', latitude: 9.1450, longitude: 38.7617, population: 5000000 },
      { name: 'Dire Dawa', state: 'Dire Dawa', latitude: 9.5938, longitude: 41.8661, population: 500000 },
      { name: 'Mek\'ele', state: 'Tigray', latitude: 13.4967, longitude: 39.4753, population: 400000 },
      { name: 'Gondar', state: 'Amhara', latitude: 12.6089, longitude: 37.4671, population: 350000 },
      { name: 'Awassa', state: 'Sidama', latitude: 7.0431, longitude: 38.4731, population: 300000 },
      { name: 'Bahir Dar', state: 'Amhara', latitude: 11.5936, longitude: 37.3908, population: 290000 },
      { name: 'Dessie', state: 'Amhara', latitude: 11.1333, longitude: 39.6333, population: 185000 },
      { name: 'Jimma', state: 'Oromia', latitude: 7.6667, longitude: 36.8333, population: 175000 },
      { name: 'Adama', state: 'Oromia', latitude: 8.5400, longitude: 39.2700, population: 324000 },
      { name: 'Harar', state: 'Harari', latitude: 9.3114, longitude: 42.1197, population: 130000 },
      { name: 'Debre Markos', state: 'Amhara', latitude: 10.3500, longitude: 37.7333, population: 100000 },
      { name: 'Dilla', state: 'SNNPR', latitude: 6.4167, longitude: 38.3167, population: 90000 },
      { name: 'Nekemte', state: 'Oromia', latitude: 9.0833, longitude: 36.5500, population: 85000 },
      { name: 'Axum', state: 'Tigray', latitude: 14.1308, longitude: 38.7228, population: 65000 },
      { name: 'Arba Minch', state: 'SNNPR', latitude: 6.0333, longitude: 37.5500, population: 95000 },
      { name: 'Shashamane', state: 'Oromia', latitude: 7.2000, longitude: 38.6000, population: 120000 },
      { name: 'Bishoftu', state: 'Oromia', latitude: 8.7500, longitude: 38.9833, population: 150000 },
      { name: 'Debre Birhan', state: 'Amhara', latitude: 9.6833, longitude: 39.5333, population: 90000 },
      { name: 'Asella', state: 'Oromia', latitude: 7.9500, longitude: 39.1333, population: 85000 },
      { name: 'Wolaita Sodo', state: 'SNNPR', latitude: 6.8500, longitude: 37.7500, population: 80000 },
      { name: 'Hosanna', state: 'SNNPR', latitude: 7.5500, longitude: 37.8500, population: 75000 },
      { name: 'Jijiga', state: 'Somali', latitude: 9.3500, longitude: 42.8000, population: 110000 },
      { name: 'Gambela', state: 'Gambela', latitude: 8.2500, longitude: 34.5833, population: 45000 },
      { name: 'Assosa', state: 'Benishangul-Gumuz', latitude: 10.0667, longitude: 34.5333, population: 35000 },
      { name: 'Semera', state: 'Afar', latitude: 11.7917, longitude: 41.0083, population: 35000 },
      { name: 'Kombolcha', state: 'Amhara', latitude: 11.0833, longitude: 39.7333, population: 95000 },
      { name: 'Woldia', state: 'Amhara', latitude: 11.8333, longitude: 39.6000, population: 55000 },
      { name: 'Debre Tabor', state: 'Amhara', latitude: 11.8500, longitude: 38.0167, population: 50000 },
      { name: 'Lalibela', state: 'Amhara', latitude: 12.0333, longitude: 39.0333, population: 25000 },
      { name: 'Bale Robe', state: 'Oromia', latitude: 7.1167, longitude: 40.0000, population: 50000 }
    ]
  },
  uganda: {
    name: 'Uganda',
    code: 'UG',
    continent: 'Africa',
    currency: 'UGX',
    phoneCode: '+256',
    majorCities: [
      { name: 'Kampala', state: 'Central', latitude: 0.3476, longitude: 32.5825, population: 2000000 },
      { name: 'Gulu', state: 'Northern', latitude: 2.7796, longitude: 32.2990, population: 200000 },
      { name: 'Lira', state: 'Northern', latitude: 2.2391, longitude: 32.8998, population: 150000 },
      { name: 'Mbarara', state: 'Western', latitude: -0.6063, longitude: 30.6474, population: 200000 },
      { name: 'Jinja', state: 'Eastern', latitude: 0.4478, longitude: 33.2026, population: 120000 },
      { name: 'Mbale', state: 'Eastern', latitude: 1.0750, longitude: 34.1750, population: 100000 },
      { name: 'Entebbe', state: 'Central', latitude: 0.0512, longitude: 32.4637, population: 70000 },
      { name: 'Fort Portal', state: 'Western', latitude: 0.6710, longitude: 30.2750, population: 60000 },
      { name: 'Masaka', state: 'Central', latitude: -0.3411, longitude: 31.7311, population: 85000 },
      { name: 'Soroti', state: 'Eastern', latitude: 1.7148, longitude: 33.6111, population: 75000 },
      { name: 'Kasese', state: 'Western', latitude: 0.1833, longitude: 30.0833, population: 70000 },
      { name: 'Arua', state: 'West Nile', latitude: 3.0167, longitude: 30.9000, population: 65000 },
      { name: 'Hoima', state: 'Western', latitude: 1.4333, longitude: 31.3500, population: 55000 },
      { name: 'Kabale', state: 'Western', latitude: -1.2500, longitude: 29.9833, population: 50000 },
      { name: 'Mukono', state: 'Central', latitude: 0.3533, longitude: 32.7553, population: 160000 },
      { name: 'Iganga', state: 'Eastern', latitude: 0.6167, longitude: 33.4833, population: 55000 },
      { name: 'Tororo', state: 'Eastern', latitude: 0.6833, longitude: 34.1833, population: 50000 },
      { name: 'Mityana', state: 'Central', latitude: 0.4167, longitude: 32.0333, population: 45000 },
      { name: 'Busia', state: 'Eastern', latitude: 0.4667, longitude: 34.0833, population: 40000 },
      { name: 'Masindi', state: 'Western', latitude: 1.6833, longitude: 31.7167, population: 35000 },
      { name: 'Mubende', state: 'Central', latitude: 0.5667, longitude: 31.4000, population: 40000 },
      { name: 'Kitgum', state: 'Northern', latitude: 3.2833, longitude: 32.8833, population: 35000 },
      { name: 'Moroto', state: 'Northern', latitude: 2.5333, longitude: 34.6667, population: 30000 },
      { name: 'Ntungamo', state: 'Western', latitude: -0.8833, longitude: 30.2667, population: 35000 },
      { name: 'Rukungiri', state: 'Western', latitude: -0.8000, longitude: 29.9333, population: 30000 },
      { name: 'Wakiso', state: 'Central', latitude: 0.4000, longitude: 32.4667, population: 80000 },
      { name: 'Kira', state: 'Central', latitude: 0.3833, longitude: 32.6500, population: 100000 },
      { name: 'Nansana', state: 'Central', latitude: 0.3667, longitude: 32.5333, population: 150000 },
      { name: 'Bushenyi', state: 'Western', latitude: -0.5333, longitude: 30.2000, population: 40000 },
      { name: 'Kayunga', state: 'Central', latitude: 0.7000, longitude: 32.8833, population: 35000 }
    ]
  },
  tanzania: {
    name: 'Tanzania',
    code: 'TZ',
    continent: 'Africa',
    currency: 'TZS',
    phoneCode: '+255',
    majorCities: [
      { name: 'Dar es Salaam', state: 'Dar es Salaam', latitude: -6.7924, longitude: 39.2083, population: 6000000 },
      { name: 'Dodoma', state: 'Dodoma', latitude: -6.1730, longitude: 35.7516, population: 450000 },
      { name: 'Mwanza', state: 'Mwanza', latitude: -2.5167, longitude: 32.9000, population: 700000 },
      { name: 'Arusha', state: 'Arusha', latitude: -3.3869, longitude: 36.6830, population: 420000 },
      { name: 'Zanzibar City', state: 'Zanzibar', latitude: -6.1659, longitude: 39.2026, population: 500000 },
      { name: 'Mbeya', state: 'Mbeya', latitude: -8.9000, longitude: 33.4500, population: 350000 },
      { name: 'Morogoro', state: 'Morogoro', latitude: -6.8235, longitude: 37.6558, population: 320000 },
      { name: 'Tanga', state: 'Tanga', latitude: -5.0692, longitude: 39.0984, population: 280000 },
      { name: 'Kigoma', state: 'Kigoma', latitude: -4.8772, longitude: 29.6341, population: 200000 },
      { name: 'Moshi', state: 'Kilimanjaro', latitude: -3.3333, longitude: 37.3333, population: 180000 },
      { name: 'Iringa', state: 'Iringa', latitude: -7.7667, longitude: 35.7000, population: 150000 },
      { name: 'Tabora', state: 'Tabora', latitude: -5.0167, longitude: 32.8000, population: 150000 },
      { name: 'Songea', state: 'Ruvuma', latitude: -10.6833, longitude: 35.6500, population: 130000 },
      { name: 'Musoma', state: 'Mara', latitude: -1.5000, longitude: 33.8000, population: 120000 },
      { name: 'Bukoba', state: 'Kagera', latitude: -1.3333, longitude: 31.8000, population: 110000 },
      { name: 'Shinyanga', state: 'Shinyanga', latitude: -3.6500, longitude: 33.4167, population: 140000 },
      { name: 'Singida', state: 'Singida', latitude: -4.8167, longitude: 34.7500, population: 95000 },
      { name: 'Lindi', state: 'Lindi', latitude: -10.0000, longitude: 39.7167, population: 85000 },
      { name: 'Mtwara', state: 'Mtwara', latitude: -10.2667, longitude: 40.1833, population: 110000 },
      { name: 'Sumbawanga', state: 'Rukwa', latitude: -7.9667, longitude: 31.6167, population: 100000 },
      { name: 'Njombe', state: 'Njombe', latitude: -9.3333, longitude: 34.7667, population: 65000 },
      { name: 'Babati', state: 'Manyara', latitude: -4.2167, longitude: 35.7500, population: 60000 },
      { name: 'Kahama', state: 'Shinyanga', latitude: -3.8333, longitude: 32.6000, population: 80000 },
      { name: 'Geita', state: 'Geita', latitude: -2.8833, longitude: 32.2333, population: 75000 },
      { name: 'Kibaha', state: 'Coast', latitude: -6.7667, longitude: 38.9167, population: 70000 },
      { name: 'Korogwe', state: 'Tanga', latitude: -5.1500, longitude: 38.4500, population: 55000 },
      { name: 'Same', state: 'Kilimanjaro', latitude: -4.0667, longitude: 37.7333, population: 40000 },
      { name: 'Kondoa', state: 'Dodoma', latitude: -4.9000, longitude: 35.7833, population: 35000 },
      { name: 'Mpanda', state: 'Katavi', latitude: -6.3500, longitude: 31.0667, population: 45000 },
      { name: 'Bagamoyo', state: 'Coast', latitude: -6.4333, longitude: 38.9000, population: 40000 }
    ]
  },
  southAfrica: {
    name: 'South Africa',
    code: 'ZA',
    continent: 'Africa',
    currency: 'ZAR',
    phoneCode: '+27',
    majorCities: [
      { name: 'Johannesburg', state: 'Gauteng', latitude: -26.2041, longitude: 28.0473, population: 5600000 },
      { name: 'Cape Town', state: 'Western Cape', latitude: -33.9249, longitude: 18.4241, population: 4600000 },
      { name: 'Durban', state: 'KwaZulu-Natal', latitude: -29.8587, longitude: 31.0218, population: 3700000 },
      { name: 'Pretoria', state: 'Gauteng', latitude: -25.7479, longitude: 28.2293, population: 2500000 },
      { name: 'Port Elizabeth', state: 'Eastern Cape', latitude: -33.9608, longitude: 25.6022, population: 1300000 },
      { name: 'Bloemfontein', state: 'Free State', latitude: -29.0852, longitude: 26.1596, population: 520000 },
      { name: 'East London', state: 'Eastern Cape', latitude: -33.0153, longitude: 27.9116, population: 480000 },
      { name: 'Nelspruit', state: 'Mpumalanga', latitude: -25.4753, longitude: 30.9694, population: 110000 },
      { name: 'Kimberley', state: 'Northern Cape', latitude: -28.7323, longitude: 24.7623, population: 230000 },
      { name: 'Polokwane', state: 'Limpopo', latitude: -23.9045, longitude: 29.4689, population: 500000 },
      { name: 'Rustenburg', state: 'North West', latitude: -25.6674, longitude: 27.2419, population: 120000 },
      { name: 'Pietermaritzburg', state: 'KwaZulu-Natal', latitude: -29.6006, longitude: 30.3794, population: 750000 },
      { name: 'Soweto', state: 'Gauteng', latitude: -26.2678, longitude: 27.8585, population: 1300000 },
      { name: 'Benoni', state: 'Gauteng', latitude: -26.1888, longitude: 28.3206, population: 420000 },
      { name: 'Tembisa', state: 'Gauteng', latitude: -25.9964, longitude: 28.2169, population: 460000 },
      { name: 'Sandton', state: 'Gauteng', latitude: -26.1076, longitude: 28.0567, population: 220000 },
      { name: 'Midrand', state: 'Gauteng', latitude: -25.9891, longitude: 28.1265, population: 180000 },
      { name: 'George', state: 'Western Cape', latitude: -33.9632, longitude: 22.4621, population: 200000 },
      { name: 'Stellenbosch', state: 'Western Cape', latitude: -33.9347, longitude: 18.8602, population: 180000 },
      { name: 'Paarl', state: 'Western Cape', latitude: -33.7347, longitude: 18.9696, population: 200000 },
      { name: 'Richards Bay', state: 'KwaZulu-Natal', latitude: -28.7807, longitude: 32.0377, population: 150000 },
      { name: 'Witbank', state: 'Mpumalanga', latitude: -25.8714, longitude: 29.2337, population: 120000 },
      { name: 'Vanderbijlpark', state: 'Gauteng', latitude: -26.7111, longitude: 27.8353, population: 100000 },
      { name: 'Welkom', state: 'Free State', latitude: -27.9778, longitude: 26.7358, population: 140000 },
      { name: 'Newcastle', state: 'KwaZulu-Natal', latitude: -27.7577, longitude: 29.9320, population: 90000 },
      { name: 'Mahikeng', state: 'North West', latitude: -25.8652, longitude: 25.6449, population: 80000 },
      { name: 'Upington', state: 'Northern Cape', latitude: -28.4572, longitude: 21.2604, population: 75000 },
      { name: 'Potchefstroom', state: 'North West', latitude: -26.7145, longitude: 27.0970, population: 130000 },
      { name: 'Uitenhage', state: 'Eastern Cape', latitude: -33.7646, longitude: 25.3990, population: 100000 },
      { name: 'Centurion', state: 'Gauteng', latitude: -25.8603, longitude: 28.1894, population: 240000 }
    ]
  },
  // Europe
  unitedStates: {
    name: 'United States',
    code: 'US',
    continent: 'North America',
    currency: 'USD',
    phoneCode: '+1',
    majorCities: [
      // Alabama
      { name: 'Birmingham', state: 'Alabama', latitude: 33.5186, longitude: -86.8104, population: 200000, zipCode: '35203' },
      { name: 'Montgomery', state: 'Alabama', latitude: 32.3792, longitude: -86.3077, population: 200000, zipCode: '36104' },
      { name: 'Huntsville', state: 'Alabama', latitude: 34.7304, longitude: -86.5861, population: 215000, zipCode: '35801' },
      { name: 'Mobile', state: 'Alabama', latitude: 30.6954, longitude: -88.0399, population: 190000, zipCode: '36602' },
      
      // Alaska
      { name: 'Anchorage', state: 'Alaska', latitude: 61.2181, longitude: -149.9003, population: 290000, zipCode: '99501' },
      { name: 'Fairbanks', state: 'Alaska', latitude: 64.8378, longitude: -147.7164, population: 32000, zipCode: '99701' },
      { name: 'Juneau', state: 'Alaska', latitude: 58.3019, longitude: -134.4197, population: 32000, zipCode: '99801' },
      
      // Arizona
      { name: 'Phoenix', state: 'Arizona', latitude: 33.4484, longitude: -112.0740, population: 1600000, zipCode: '85001' },
      { name: 'Tucson', state: 'Arizona', latitude: 32.2226, longitude: -110.9747, population: 550000, zipCode: '85701' },
      { name: 'Mesa', state: 'Arizona', latitude: 33.4152, longitude: -111.8315, population: 500000, zipCode: '85201' },
      { name: 'Scottsdale', state: 'Arizona', latitude: 33.4942, longitude: -111.9261, population: 255000, zipCode: '85251' },
      { name: 'Tempe', state: 'Arizona', latitude: 33.4255, longitude: -111.9400, population: 190000, zipCode: '85281' },
      { name: 'Glendale', state: 'Arizona', latitude: 33.5387, longitude: -112.1860, population: 250000, zipCode: '85301' },
      { name: 'Gilbert', state: 'Arizona', latitude: 33.3528, longitude: -111.7890, population: 265000, zipCode: '85234' },
      { name: 'Chandler', state: 'Arizona', latitude: 33.3062, longitude: -111.8413, population: 270000, zipCode: '85224' },
      { name: 'Flagstaff', state: 'Arizona', latitude: 35.1983, longitude: -111.6513, population: 75000, zipCode: '86001' },
      { name: 'Yuma', state: 'Arizona', latitude: 32.6927, longitude: -114.6277, population: 100000, zipCode: '85364' },
      
      // Arkansas
      { name: 'Little Rock', state: 'Arkansas', latitude: 34.7465, longitude: -92.2896, population: 200000, zipCode: '72201' },
      { name: 'Fort Smith', state: 'Arkansas', latitude: 35.3859, longitude: -94.3985, population: 90000, zipCode: '72901' },
      { name: 'Fayetteville', state: 'Arkansas', latitude: 36.0626, longitude: -94.1574, population: 95000, zipCode: '72701' },
      { name: 'Springdale', state: 'Arkansas', latitude: 36.1867, longitude: -94.1288, population: 85000, zipCode: '72764' },
      
      // California
      { name: 'Los Angeles', state: 'California', latitude: 34.0522, longitude: -118.2437, population: 4000000, zipCode: '90001' },
      { name: 'San Francisco', state: 'California', latitude: 37.7749, longitude: -122.4194, population: 880000, zipCode: '94102' },
      { name: 'San Diego', state: 'California', latitude: 32.7157, longitude: -117.1611, population: 1400000, zipCode: '92101' },
      { name: 'San Jose', state: 'California', latitude: 37.3382, longitude: -121.8863, population: 1000000, zipCode: '95101' },
      { name: 'Fresno', state: 'California', latitude: 36.7378, longitude: -119.7871, population: 540000, zipCode: '93721' },
      { name: 'Sacramento', state: 'California', latitude: 38.5816, longitude: -121.4944, population: 525000, zipCode: '95814' },
      { name: 'Long Beach', state: 'California', latitude: 33.7701, longitude: -118.1937, population: 470000, zipCode: '90802' },
      { name: 'Oakland', state: 'California', latitude: 37.8044, longitude: -122.2712, population: 430000, zipCode: '94607' },
      { name: 'Bakersfield', state: 'California', latitude: 35.3733, longitude: -119.0187, population: 400000, zipCode: '93301' },
      { name: 'Anaheim', state: 'California', latitude: 33.8366, longitude: -117.9143, population: 350000, zipCode: '92801' },
      { name: 'Santa Ana', state: 'California', latitude: 33.7455, longitude: -117.8677, population: 310000, zipCode: '92701' },
      { name: 'Riverside', state: 'California', latitude: 33.9806, longitude: -117.3755, population: 330000, zipCode: '92501' },
      { name: 'Irvine', state: 'California', latitude: 33.6846, longitude: -117.8265, population: 280000, zipCode: '92602' },
      { name: 'Stockton', state: 'California', latitude: 37.9577, longitude: -121.2908, population: 320000, zipCode: '95202' },
      { name: 'Fremont', state: 'California', latitude: 37.5485, longitude: -121.9886, population: 235000, zipCode: '94536' },
      { name: 'Modesto', state: 'California', latitude: 37.6391, longitude: -120.9969, population: 215000, zipCode: '95351' },
      { name: 'Santa Barbara', state: 'California', latitude: 34.4208, longitude: -119.6982, population: 90000, zipCode: '93101' },
      { name: 'Pasadena', state: 'California', latitude: 34.1478, longitude: -118.1445, population: 140000, zipCode: '91101' },
      { name: 'Glendale', state: 'California', latitude: 34.1425, longitude: -118.2551, population: 200000, zipCode: '91203' },
      { name: 'Huntington Beach', state: 'California', latitude: 33.6595, longitude: -117.9988, population: 200000, zipCode: '92648' },
      
      // Colorado
      { name: 'Denver', state: 'Colorado', latitude: 39.7392, longitude: -104.9903, population: 720000, zipCode: '80202' },
      { name: 'Colorado Springs', state: 'Colorado', latitude: 38.8339, longitude: -104.8214, population: 480000, zipCode: '80903' },
      { name: 'Aurora', state: 'Colorado', latitude: 39.7294, longitude: -104.8319, population: 390000, zipCode: '80010' },
      { name: 'Fort Collins', state: 'Colorado', latitude: 40.5853, longitude: -105.0844, population: 170000, zipCode: '80521' },
      { name: 'Boulder', state: 'Colorado', latitude: 40.0150, longitude: -105.2705, population: 105000, zipCode: '80302' },
      { name: 'Lakewood', state: 'Colorado', latitude: 39.7047, longitude: -105.0814, population: 155000, zipCode: '80226' },
      
      // Connecticut
      { name: 'Bridgeport', state: 'Connecticut', latitude: 41.1865, longitude: -73.1952, population: 145000, zipCode: '06604' },
      { name: 'New Haven', state: 'Connecticut', latitude: 41.3083, longitude: -72.9279, population: 130000, zipCode: '06510' },
      { name: 'Hartford', state: 'Connecticut', latitude: 41.7658, longitude: -72.6734, population: 122000, zipCode: '06103' },
      { name: 'Stamford', state: 'Connecticut', latitude: 41.0534, longitude: -73.5387, population: 135000, zipCode: '06901' },
      
      // Delaware
      { name: 'Wilmington', state: 'Delaware', latitude: 39.7391, longitude: -75.5398, population: 71000, zipCode: '19801' },
      { name: 'Dover', state: 'Delaware', latitude: 39.1582, longitude: -75.5244, population: 38000, zipCode: '19901' },
      { name: 'Newark', state: 'Delaware', latitude: 39.6837, longitude: -75.7497, population: 33000, zipCode: '19711' },
      
      // Florida
      { name: 'Miami', state: 'Florida', latitude: 25.7617, longitude: -80.1918, population: 470000, zipCode: '33101' },
      { name: 'Jacksonville', state: 'Florida', latitude: 30.3322, longitude: -81.6557, population: 950000, zipCode: '32202' },
      { name: 'Tampa', state: 'Florida', latitude: 27.9506, longitude: -82.4572, population: 400000, zipCode: '33602' },
      { name: 'Orlando', state: 'Florida', latitude: 28.5383, longitude: -81.3792, population: 310000, zipCode: '32801' },
      { name: 'St. Petersburg', state: 'Florida', latitude: 27.7676, longitude: -82.6403, population: 265000, zipCode: '33701' },
      { name: 'Fort Lauderdale', state: 'Florida', latitude: 26.1224, longitude: -80.1373, population: 185000, zipCode: '33301' },
      { name: 'Hialeah', state: 'Florida', latitude: 25.8576, longitude: -80.2781, population: 240000, zipCode: '33010' },
      { name: 'Tallahassee', state: 'Florida', latitude: 30.4383, longitude: -84.2807, population: 195000, zipCode: '32301' },
      { name: 'Cape Coral', state: 'Florida', latitude: 26.5629, longitude: -81.9495, population: 200000, zipCode: '33904' },
      { name: 'Hollywood', state: 'Florida', latitude: 26.0112, longitude: -80.1495, population: 155000, zipCode: '33019' },
      { name: 'Gainesville', state: 'Florida', latitude: 29.6516, longitude: -82.3248, population: 135000, zipCode: '32601' },
      { name: 'Clearwater', state: 'Florida', latitude: 27.9659, longitude: -82.8001, population: 117000, zipCode: '33755' },
      { name: 'Pembroke Pines', state: 'Florida', latitude: 26.0029, longitude: -80.2241, population: 175000, zipCode: '33024' },
      { name: 'Coral Springs', state: 'Florida', latitude: 26.2712, longitude: -80.2706, population: 135000, zipCode: '33065' },
      { name: 'Miramar', state: 'Florida', latitude: 25.9860, longitude: -80.2323, population: 140000, zipCode: '33023' },
      
      // Georgia
      { name: 'Atlanta', state: 'Georgia', latitude: 33.7490, longitude: -84.3880, population: 500000, zipCode: '30303' },
      { name: 'Augusta', state: 'Georgia', latitude: 33.4735, longitude: -81.9748, population: 200000, zipCode: '30901' },
      { name: 'Columbus', state: 'Georgia', latitude: 32.4610, longitude: -84.9877, population: 195000, zipCode: '31901' },
      { name: 'Savannah', state: 'Georgia', latitude: 32.0809, longitude: -81.0912, population: 145000, zipCode: '31401' },
      { name: 'Macon', state: 'Georgia', latitude: 32.8407, longitude: -83.6324, population: 155000, zipCode: '31201' },
      { name: 'Athens', state: 'Georgia', latitude: 33.9519, longitude: -83.3576, population: 130000, zipCode: '30601' },
      
      // Hawaii
      { name: 'Honolulu', state: 'Hawaii', latitude: 21.3069, longitude: -157.8583, population: 350000, zipCode: '96801' },
      { name: 'Pearl City', state: 'Hawaii', latitude: 21.3972, longitude: -157.9753, population: 50000, zipCode: '96782' },
      { name: 'Hilo', state: 'Hawaii', latitude: 19.7297, longitude: -155.0900, population: 45000, zipCode: '96720' },
      
      // Idaho
      { name: 'Boise', state: 'Idaho', latitude: 43.6150, longitude: -116.2023, population: 235000, zipCode: '83702' },
      { name: 'Meridian', state: 'Idaho', latitude: 43.6121, longitude: -116.3915, population: 120000, zipCode: '83642' },
      { name: 'Nampa', state: 'Idaho', latitude: 43.5407, longitude: -116.5635, population: 100000, zipCode: '83651' },
      { name: 'Idaho Falls', state: 'Idaho', latitude: 43.4917, longitude: -112.0339, population: 65000, zipCode: '83401' },
      
      // Illinois
      { name: 'Chicago', state: 'Illinois', latitude: 41.8781, longitude: -87.6298, population: 2700000, zipCode: '60601' },
      { name: 'Aurora', state: 'Illinois', latitude: 41.7606, longitude: -88.3201, population: 200000, zipCode: '60505' },
      { name: 'Naperville', state: 'Illinois', latitude: 41.7508, longitude: -88.1535, population: 150000, zipCode: '60540' },
      { name: 'Rockford', state: 'Illinois', latitude: 42.2711, longitude: -89.0940, population: 145000, zipCode: '61101' },
      { name: 'Springfield', state: 'Illinois', latitude: 39.7817, longitude: -89.6501, population: 115000, zipCode: '62701' },
      { name: 'Joliet', state: 'Illinois', latitude: 41.5250, longitude: -88.0817, population: 150000, zipCode: '60431' },
      
      // Indiana
      { name: 'Indianapolis', state: 'Indiana', latitude: 39.7684, longitude: -86.1581, population: 880000, zipCode: '46204' },
      { name: 'Fort Wayne', state: 'Indiana', latitude: 41.0793, longitude: -85.1394, population: 270000, zipCode: '46802' },
      { name: 'Evansville', state: 'Indiana', latitude: 37.9716, longitude: -87.5711, population: 120000, zipCode: '47708' },
      { name: 'South Bend', state: 'Indiana', latitude: 41.6764, longitude: -86.2520, population: 102000, zipCode: '46601' },
      { name: 'Carmel', state: 'Indiana', latitude: 39.9784, longitude: -86.1180, population: 100000, zipCode: '46032' },
      
      // Iowa
      { name: 'Des Moines', state: 'Iowa', latitude: 41.5868, longitude: -93.6250, population: 215000, zipCode: '50309' },
      { name: 'Cedar Rapids', state: 'Iowa', latitude: 41.9779, longitude: -91.6656, population: 135000, zipCode: '52401' },
      { name: 'Davenport', state: 'Iowa', latitude: 41.5236, longitude: -90.5776, population: 102000, zipCode: '52801' },
      { name: 'Sioux City', state: 'Iowa', latitude: 42.4963, longitude: -96.4049, population: 82000, zipCode: '51101' },
      
      // Kansas
      { name: 'Wichita', state: 'Kansas', latitude: 37.6872, longitude: -97.3301, population: 395000, zipCode: '67202' },
      { name: 'Overland Park', state: 'Kansas', latitude: 38.9822, longitude: -94.6708, population: 195000, zipCode: '66212' },
      { name: 'Kansas City', state: 'Kansas', latitude: 39.1155, longitude: -94.6268, population: 155000, zipCode: '66101' },
      { name: 'Topeka', state: 'Kansas', latitude: 39.0473, longitude: -95.6752, population: 125000, zipCode: '66603' },
      
      // Kentucky
      { name: 'Louisville', state: 'Kentucky', latitude: 38.2527, longitude: -85.7585, population: 620000, zipCode: '40202' },
      { name: 'Lexington', state: 'Kentucky', latitude: 38.0406, longitude: -84.5037, population: 325000, zipCode: '40507' },
      { name: 'Bowling Green', state: 'Kentucky', latitude: 36.9685, longitude: -86.4808, population: 75000, zipCode: '42101' },
      { name: 'Owensboro', state: 'Kentucky', latitude: 37.7719, longitude: -87.1112, population: 60000, zipCode: '42301' },
      
      // Louisiana
      { name: 'New Orleans', state: 'Louisiana', latitude: 29.9511, longitude: -90.0715, population: 390000, zipCode: '70112' },
      { name: 'Baton Rouge', state: 'Louisiana', latitude: 30.4583, longitude: -91.1403, population: 225000, zipCode: '70801' },
      { name: 'Shreveport', state: 'Louisiana', latitude: 32.5252, longitude: -93.7502, population: 185000, zipCode: '71101' },
      { name: 'Lafayette', state: 'Louisiana', latitude: 30.2241, longitude: -92.0198, population: 130000, zipCode: '70501' },
      
      // Maine
      { name: 'Portland', state: 'Maine', latitude: 43.6591, longitude: -70.2568, population: 68000, zipCode: '04101' },
      { name: 'Lewiston', state: 'Maine', latitude: 44.1004, longitude: -70.2148, population: 36000, zipCode: '04240' },
      { name: 'Bangor', state: 'Maine', latitude: 44.8016, longitude: -68.7712, population: 32000, zipCode: '04401' },
      
      // Maryland
      { name: 'Baltimore', state: 'Maryland', latitude: 39.2904, longitude: -76.6122, population: 590000, zipCode: '21201' },
      { name: 'Frederick', state: 'Maryland', latitude: 39.4143, longitude: -77.4105, population: 75000, zipCode: '21701' },
      { name: 'Rockville', state: 'Maryland', latitude: 39.0840, longitude: -77.1528, population: 68000, zipCode: '20850' },
      { name: 'Gaithersburg', state: 'Maryland', latitude: 39.1434, longitude: -77.2014, population: 70000, zipCode: '20877' },
      
      // Massachusetts
      { name: 'Boston', state: 'Massachusetts', latitude: 42.3601, longitude: -71.0589, population: 690000, zipCode: '02108' },
      { name: 'Worcester', state: 'Massachusetts', latitude: 42.2626, longitude: -71.8023, population: 185000, zipCode: '01608' },
      { name: 'Springfield', state: 'Massachusetts', latitude: 42.1015, longitude: -72.5898, population: 155000, zipCode: '01103' },
      { name: 'Cambridge', state: 'Massachusetts', latitude: 42.3736, longitude: -71.1097, population: 118000, zipCode: '02139' },
      { name: 'Lowell', state: 'Massachusetts', latitude: 42.6334, longitude: -71.3162, population: 115000, zipCode: '01852' },
      
      // Michigan
      { name: 'Detroit', state: 'Michigan', latitude: 42.3314, longitude: -83.0458, population: 640000, zipCode: '48226' },
      { name: 'Grand Rapids', state: 'Michigan', latitude: 42.9634, longitude: -85.6681, population: 200000, zipCode: '49503' },
      { name: 'Warren', state: 'Michigan', latitude: 42.5145, longitude: -83.0147, population: 135000, zipCode: '48089' },
      { name: 'Ann Arbor', state: 'Michigan', latitude: 42.2808, longitude: -83.7430, population: 120000, zipCode: '48104' },
      { name: 'Lansing', state: 'Michigan', latitude: 42.7325, longitude: -84.5555, population: 118000, zipCode: '48933' },
      { name: 'Flint', state: 'Michigan', latitude: 43.0125, longitude: -83.6875, population: 97000, zipCode: '48502' },
      
      // Minnesota
      { name: 'Minneapolis', state: 'Minnesota', latitude: 44.9778, longitude: -93.2650, population: 430000, zipCode: '55401' },
      { name: 'St. Paul', state: 'Minnesota', latitude: 44.9537, longitude: -93.0900, population: 310000, zipCode: '55101' },
      { name: 'Rochester', state: 'Minnesota', latitude: 44.0121, longitude: -92.4802, population: 120000, zipCode: '55901' },
      { name: 'Duluth', state: 'Minnesota', latitude: 46.7867, longitude: -92.1005, population: 90000, zipCode: '55802' },
      { name: 'Bloomington', state: 'Minnesota', latitude: 44.8408, longitude: -93.2983, population: 90000, zipCode: '55431' },
      
      // Mississippi
      { name: 'Jackson', state: 'Mississippi', latitude: 32.2988, longitude: -90.1848, population: 165000, zipCode: '39201' },
      { name: 'Gulfport', state: 'Mississippi', latitude: 30.3674, longitude: -89.0928, population: 72000, zipCode: '39501' },
      { name: 'Southaven', state: 'Mississippi', latitude: 34.9889, longitude: -90.0126, population: 55000, zipCode: '38671' },
      { name: 'Hattiesburg', state: 'Mississippi', latitude: 31.3271, longitude: -89.2903, population: 48000, zipCode: '39401' },
      
      // Missouri
      { name: 'Kansas City', state: 'Missouri', latitude: 39.0997, longitude: -94.5786, population: 500000, zipCode: '64106' },
      { name: 'St. Louis', state: 'Missouri', latitude: 38.6270, longitude: -90.1994, population: 300000, zipCode: '63101' },
      { name: 'Springfield', state: 'Missouri', latitude: 37.2090, longitude: -93.2923, population: 170000, zipCode: '65806' },
      { name: 'Columbia', state: 'Missouri', latitude: 38.9517, longitude: -92.3341, population: 130000, zipCode: '65201' },
      
      // Montana
      { name: 'Billings', state: 'Montana', latitude: 45.7833, longitude: -108.5007, population: 117000, zipCode: '59101' },
      { name: 'Missoula', state: 'Montana', latitude: 46.8721, longitude: -113.9940, population: 75000, zipCode: '59801' },
      { name: 'Great Falls', state: 'Montana', latitude: 47.4942, longitude: -111.2833, population: 60000, zipCode: '59401' },
      { name: 'Helena', state: 'Montana', latitude: 46.5891, longitude: -112.0391, population: 33000, zipCode: '59601' },
      
      // Nebraska
      { name: 'Omaha', state: 'Nebraska', latitude: 41.2565, longitude: -95.9345, population: 485000, zipCode: '68102' },
      { name: 'Lincoln', state: 'Nebraska', latitude: 40.8258, longitude: -96.6852, population: 290000, zipCode: '68508' },
      { name: 'Bellevue', state: 'Nebraska', latitude: 41.1544, longitude: -95.9146, population: 55000, zipCode: '68005' },
      { name: 'Grand Island', state: 'Nebraska', latitude: 40.9250, longitude: -98.3420, population: 52000, zipCode: '68801' },
      
      // Nevada
      { name: 'Las Vegas', state: 'Nevada', latitude: 36.1699, longitude: -115.1398, population: 650000, zipCode: '89101' },
      { name: 'Henderson', state: 'Nevada', latitude: 36.0395, longitude: -114.9817, population: 320000, zipCode: '89015' },
      { name: 'Reno', state: 'Nevada', latitude: 39.5296, longitude: -119.8138, population: 265000, zipCode: '89501' },
      { name: 'North Las Vegas', state: 'Nevada', latitude: 36.1989, longitude: -115.1175, population: 265000, zipCode: '89030' },
      { name: 'Sparks', state: 'Nevada', latitude: 39.5349, longitude: -119.7527, population: 105000, zipCode: '89431' },
      
      // New Hampshire
      { name: 'Manchester', state: 'New Hampshire', latitude: 42.9956, longitude: -71.4548, population: 115000, zipCode: '03101' },
      { name: 'Nashua', state: 'New Hampshire', latitude: 42.7654, longitude: -71.4676, population: 90000, zipCode: '03060' },
      { name: 'Concord', state: 'New Hampshire', latitude: 43.2081, longitude: -71.5376, population: 44000, zipCode: '03301' },
      
      // New Jersey
      { name: 'Newark', state: 'New Jersey', latitude: 40.7357, longitude: -74.1724, population: 280000, zipCode: '07102' },
      { name: 'Jersey City', state: 'New Jersey', latitude: 40.7178, longitude: -74.0431, population: 265000, zipCode: '07302' },
      { name: 'Paterson', state: 'New Jersey', latitude: 40.9168, longitude: -74.1718, population: 145000, zipCode: '07501' },
      { name: 'Elizabeth', state: 'New Jersey', latitude: 40.6640, longitude: -74.2107, population: 130000, zipCode: '07201' },
      { name: 'Trenton', state: 'New Jersey', latitude: 40.2206, longitude: -74.7597, population: 85000, zipCode: '08608' },
      
      // New Mexico
      { name: 'Albuquerque', state: 'New Mexico', latitude: 35.0844, longitude: -106.6504, population: 560000, zipCode: '87102' },
      { name: 'Las Cruces', state: 'New Mexico', latitude: 32.3199, longitude: -106.7637, population: 110000, zipCode: '88001' },
      { name: 'Rio Rancho', state: 'New Mexico', latitude: 35.2328, longitude: -106.6630, population: 105000, zipCode: '87124' },
      { name: 'Santa Fe', state: 'New Mexico', latitude: 35.6870, longitude: -105.9378, population: 85000, zipCode: '87501' },
      
      // New York
      { name: 'New York City', state: 'New York', latitude: 40.7128, longitude: -74.0060, population: 8400000, zipCode: '10001' },
      { name: 'Buffalo', state: 'New York', latitude: 42.8864, longitude: -78.8784, population: 255000, zipCode: '14202' },
      { name: 'Rochester', state: 'New York', latitude: 43.1566, longitude: -77.6088, population: 210000, zipCode: '14604' },
      { name: 'Yonkers', state: 'New York', latitude: 40.9312, longitude: -73.8987, population: 200000, zipCode: '10701' },
      { name: 'Syracuse', state: 'New York', latitude: 43.0481, longitude: -76.1474, population: 145000, zipCode: '13202' },
      { name: 'Albany', state: 'New York', latitude: 42.6526, longitude: -73.7562, population: 98000, zipCode: '12207' },
      
      // North Carolina
      { name: 'Charlotte', state: 'North Carolina', latitude: 35.2271, longitude: -80.8431, population: 900000, zipCode: '28202' },
      { name: 'Raleigh', state: 'North Carolina', latitude: 35.7796, longitude: -78.6382, population: 475000, zipCode: '27601' },
      { name: 'Greensboro', state: 'North Carolina', latitude: 36.0726, longitude: -79.7920, population: 300000, zipCode: '27401' },
      { name: 'Durham', state: 'North Carolina', latitude: 35.9940, longitude: -78.8986, population: 280000, zipCode: '27701' },
      { name: 'Winston-Salem', state: 'North Carolina', latitude: 36.0999, longitude: -80.2442, population: 250000, zipCode: '27101' },
      { name: 'Fayetteville', state: 'North Carolina', latitude: 35.0527, longitude: -78.8784, population: 210000, zipCode: '28301' },
      { name: 'Cary', state: 'North Carolina', latitude: 35.7915, longitude: -78.7811, population: 175000, zipCode: '27511' },
      { name: 'Wilmington', state: 'North Carolina', latitude: 34.2257, longitude: -77.9447, population: 125000, zipCode: '28401' },
      
      // North Dakota
      { name: 'Fargo', state: 'North Dakota', latitude: 46.8772, longitude: -96.7898, population: 125000, zipCode: '58102' },
      { name: 'Bismarck', state: 'North Dakota', latitude: 46.8083, longitude: -100.7837, population: 75000, zipCode: '58501' },
      { name: 'Grand Forks', state: 'North Dakota', latitude: 47.9253, longitude: -97.0329, population: 57000, zipCode: '58201' },
      { name: 'Minot', state: 'North Dakota', latitude: 48.2330, longitude: -101.2923, population: 50000, zipCode: '58701' },
      
      // Ohio
      { name: 'Columbus', state: 'Ohio', latitude: 39.9612, longitude: -82.9988, population: 900000, zipCode: '43215' },
      { name: 'Cleveland', state: 'Ohio', latitude: 41.4993, longitude: -81.6944, population: 380000, zipCode: '44113' },
      { name: 'Cincinnati', state: 'Ohio', latitude: 39.1031, longitude: -84.5120, population: 305000, zipCode: '45202' },
      { name: 'Toledo', state: 'Ohio', latitude: 41.6528, longitude: -83.5379, population: 275000, zipCode: '43604' },
      { name: 'Akron', state: 'Ohio', latitude: 41.0814, longitude: -81.5190, population: 190000, zipCode: '44308' },
      { name: 'Dayton', state: 'Ohio', latitude: 39.7589, longitude: -84.1916, population: 140000, zipCode: '45402' },
      
      // Oklahoma
      { name: 'Oklahoma City', state: 'Oklahoma', latitude: 35.4676, longitude: -97.5164, population: 680000, zipCode: '73102' },
      { name: 'Tulsa', state: 'Oklahoma', latitude: 36.1540, longitude: -95.9928, population: 400000, zipCode: '74103' },
      { name: 'Norman', state: 'Oklahoma', latitude: 35.2226, longitude: -97.4395, population: 125000, zipCode: '73069' },
      { name: 'Broken Arrow', state: 'Oklahoma', latitude: 36.0526, longitude: -95.7908, population: 115000, zipCode: '74012' },
      
      // Oregon
      { name: 'Portland', state: 'Oregon', latitude: 45.5152, longitude: -122.6784, population: 650000, zipCode: '97204' },
      { name: 'Salem', state: 'Oregon', latitude: 44.9429, longitude: -123.0351, population: 175000, zipCode: '97301' },
      { name: 'Eugene', state: 'Oregon', latitude: 44.0521, longitude: -123.0868, population: 175000, zipCode: '97401' },
      { name: 'Gresham', state: 'Oregon', latitude: 45.5001, longitude: -122.4302, population: 115000, zipCode: '97030' },
      { name: 'Bend', state: 'Oregon', latitude: 44.0582, longitude: -121.3153, population: 100000, zipCode: '97701' },
      
      // Pennsylvania
      { name: 'Philadelphia', state: 'Pennsylvania', latitude: 39.9526, longitude: -75.1652, population: 1600000, zipCode: '19102' },
      { name: 'Pittsburgh', state: 'Pennsylvania', latitude: 40.4406, longitude: -79.9959, population: 300000, zipCode: '15222' },
      { name: 'Allentown', state: 'Pennsylvania', latitude: 40.6084, longitude: -75.4902, population: 125000, zipCode: '18101' },
      { name: 'Erie', state: 'Pennsylvania', latitude: 42.1292, longitude: -80.0851, population: 95000, zipCode: '16501' },
      { name: 'Reading', state: 'Pennsylvania', latitude: 40.3356, longitude: -75.9269, population: 95000, zipCode: '19601' },
      
      // Rhode Island
      { name: 'Providence', state: 'Rhode Island', latitude: 41.8240, longitude: -71.4128, population: 180000, zipCode: '02903' },
      { name: 'Warwick', state: 'Rhode Island', latitude: 41.7001, longitude: -71.4162, population: 82000, zipCode: '02886' },
      { name: 'Cranston', state: 'Rhode Island', latitude: 41.7798, longitude: -71.4373, population: 80000, zipCode: '02910' },
      
      // South Carolina
      { name: 'Charleston', state: 'South Carolina', latitude: 32.7765, longitude: -79.9311, population: 140000, zipCode: '29401' },
      { name: 'Columbia', state: 'South Carolina', latitude: 34.0007, longitude: -81.0348, population: 135000, zipCode: '29201' },
      { name: 'North Charleston', state: 'South Carolina', latitude: 32.8546, longitude: -79.9748, population: 115000, zipCode: '29405' },
      { name: 'Greenville', state: 'South Carolina', latitude: 34.8526, longitude: -82.3940, population: 70000, zipCode: '29601' },
      
      // South Dakota
      { name: 'Sioux Falls', state: 'South Dakota', latitude: 43.5446, longitude: -96.7311, population: 195000, zipCode: '57104' },
      { name: 'Rapid City', state: 'South Dakota', latitude: 44.0805, longitude: -103.2310, population: 75000, zipCode: '57701' },
      { name: 'Aberdeen', state: 'South Dakota', latitude: 45.4647, longitude: -98.4865, population: 28000, zipCode: '57401' },
      
      // Tennessee
      { name: 'Nashville', state: 'Tennessee', latitude: 36.1627, longitude: -86.7816, population: 690000, zipCode: '37203' },
      { name: 'Memphis', state: 'Tennessee', latitude: 35.1495, longitude: -90.0490, population: 650000, zipCode: '38103' },
      { name: 'Knoxville', state: 'Tennessee', latitude: 35.9606, longitude: -83.9207, population: 190000, zipCode: '37902' },
      { name: 'Chattanooga', state: 'Tennessee', latitude: 35.0456, longitude: -85.3097, population: 185000, zipCode: '37402' },
      { name: 'Clarksville', state: 'Tennessee', latitude: 36.5298, longitude: -87.3595, population: 165000, zipCode: '37040' },
      
      // Texas
      { name: 'Houston', state: 'Texas', latitude: 29.7604, longitude: -95.3698, population: 2300000, zipCode: '77002' },
      { name: 'San Antonio', state: 'Texas', latitude: 29.4241, longitude: -98.4936, population: 1500000, zipCode: '78205' },
      { name: 'Dallas', state: 'Texas', latitude: 32.7767, longitude: -96.7970, population: 1340000, zipCode: '75201' },
      { name: 'Austin', state: 'Texas', latitude: 30.2672, longitude: -97.7431, population: 1000000, zipCode: '78701' },
      { name: 'Fort Worth', state: 'Texas', latitude: 32.7555, longitude: -97.3308, population: 920000, zipCode: '76102' },
      { name: 'El Paso', state: 'Texas', latitude: 31.7619, longitude: -106.4850, population: 680000, zipCode: '79901' },
      { name: 'Arlington', state: 'Texas', latitude: 32.7357, longitude: -97.1081, population: 400000, zipCode: '76010' },
      { name: 'Corpus Christi', state: 'Texas', latitude: 27.8006, longitude: -97.3964, population: 325000, zipCode: '78401' },
      { name: 'Plano', state: 'Texas', latitude: 33.0198, longitude: -96.6989, population: 290000, zipCode: '75074' },
      { name: 'Laredo', state: 'Texas', latitude: 27.5036, longitude: -99.5075, population: 265000, zipCode: '78040' },
      { name: 'Lubbock', state: 'Texas', latitude: 33.5779, longitude: -101.8552, population: 260000, zipCode: '79401' },
      { name: 'Irving', state: 'Texas', latitude: 32.8140, longitude: -96.9489, population: 240000, zipCode: '75060' },
      { name: 'Garland', state: 'Texas', latitude: 32.9126, longitude: -96.6389, population: 240000, zipCode: '75040' },
      { name: 'Frisco', state: 'Texas', latitude: 33.1507, longitude: -96.8236, population: 210000, zipCode: '75034' },
      { name: 'McKinney', state: 'Texas', latitude: 33.1972, longitude: -96.6397, population: 200000, zipCode: '75069' },
      
      // Utah
      { name: 'Salt Lake City', state: 'Utah', latitude: 40.7608, longitude: -111.8910, population: 200000, zipCode: '84101' },
      { name: 'West Valley City', state: 'Utah', latitude: 40.6916, longitude: -112.0011, population: 140000, zipCode: '84119' },
      { name: 'Provo', state: 'Utah', latitude: 40.2338, longitude: -111.6585, population: 120000, zipCode: '84601' },
      { name: 'West Jordan', state: 'Utah', latitude: 40.6097, longitude: -111.9391, population: 115000, zipCode: '84084' },
      { name: 'Orem', state: 'Utah', latitude: 40.2969, longitude: -111.6946, population: 100000, zipCode: '84057' },
      { name: 'Sandy', state: 'Utah', latitude: 40.5649, longitude: -111.8389, population: 100000, zipCode: '84070' },
      { name: 'Ogden', state: 'Utah', latitude: 41.2230, longitude: -111.9738, population: 90000, zipCode: '84401' },
      { name: 'St. George', state: 'Utah', latitude: 37.0965, longitude: -113.5684, population: 95000, zipCode: '84770' },
      { name: 'Layton', state: 'Utah', latitude: 41.0602, longitude: -111.9711, population: 80000, zipCode: '84041' },
      { name: 'Logan', state: 'Utah', latitude: 41.7370, longitude: -111.8338, population: 55000, zipCode: '84321' },
      { name: 'Taylorsville', state: 'Utah', latitude: 40.6677, longitude: -111.9388, population: 60000, zipCode: '84123' },
      { name: 'Murray', state: 'Utah', latitude: 40.6669, longitude: -111.8880, population: 50000, zipCode: '84107' },
      { name: 'Lehi', state: 'Utah', latitude: 40.3916, longitude: -111.8507, population: 70000, zipCode: '84043' },
      { name: 'Bountiful', state: 'Utah', latitude: 40.8894, longitude: -111.8808, population: 45000, zipCode: '84010' },
      { name: 'Riverton', state: 'Utah', latitude: 40.5219, longitude: -111.9391, population: 45000, zipCode: '84065' },
      
      // Vermont
      { name: 'Burlington', state: 'Vermont', latitude: 44.4759, longitude: -73.2121, population: 45000, zipCode: '05401' },
      { name: 'South Burlington', state: 'Vermont', latitude: 44.4669, longitude: -73.1710, population: 20000, zipCode: '05403' },
      { name: 'Rutland', state: 'Vermont', latitude: 43.6106, longitude: -72.9726, population: 16000, zipCode: '05701' },
      
      // Virginia
      { name: 'Virginia Beach', state: 'Virginia', latitude: 36.8529, longitude: -75.9780, population: 450000, zipCode: '23451' },
      { name: 'Norfolk', state: 'Virginia', latitude: 36.8508, longitude: -76.2859, population: 245000, zipCode: '23510' },
      { name: 'Chesapeake', state: 'Virginia', latitude: 36.7682, longitude: -76.2875, population: 245000, zipCode: '23320' },
      { name: 'Richmond', state: 'Virginia', latitude: 37.5407, longitude: -77.4360, population: 230000, zipCode: '23219' },
      { name: 'Newport News', state: 'Virginia', latitude: 37.0871, longitude: -76.4730, population: 180000, zipCode: '23607' },
      { name: 'Alexandria', state: 'Virginia', latitude: 38.8048, longitude: -77.0469, population: 160000, zipCode: '22314' },
      
      // Washington
      { name: 'Seattle', state: 'Washington', latitude: 47.6062, longitude: -122.3321, population: 750000, zipCode: '98101' },
      { name: 'Spokane', state: 'Washington', latitude: 47.6588, longitude: -117.4260, population: 225000, zipCode: '99201' },
      { name: 'Tacoma', state: 'Washington', latitude: 47.2529, longitude: -122.4443, population: 220000, zipCode: '98402' },
      { name: 'Vancouver', state: 'Washington', latitude: 45.6387, longitude: -122.6615, population: 190000, zipCode: '98660' },
      { name: 'Bellevue', state: 'Washington', latitude: 47.6101, longitude: -122.2015, population: 150000, zipCode: '98004' },
      { name: 'Kent', state: 'Washington', latitude: 47.3809, longitude: -122.2348, population: 135000, zipCode: '98032' },
      
      // West Virginia
      { name: 'Charleston', state: 'West Virginia', latitude: 38.3498, longitude: -81.6326, population: 48000, zipCode: '25301' },
      { name: 'Huntington', state: 'West Virginia', latitude: 38.4192, longitude: -82.4452, population: 45000, zipCode: '25701' },
      { name: 'Morgantown', state: 'West Virginia', latitude: 39.6295, longitude: -79.9559, population: 30000, zipCode: '26505' },
      
      // Wisconsin
      { name: 'Milwaukee', state: 'Wisconsin', latitude: 43.0389, longitude: -87.9065, population: 580000, zipCode: '53202' },
      { name: 'Madison', state: 'Wisconsin', latitude: 43.0731, longitude: -89.4012, population: 260000, zipCode: '53703' },
      { name: 'Green Bay', state: 'Wisconsin', latitude: 44.5133, longitude: -88.0133, population: 105000, zipCode: '54301' },
      { name: 'Kenosha', state: 'Wisconsin', latitude: 42.5847, longitude: -87.8212, population: 100000, zipCode: '53140' },
      { name: 'Racine', state: 'Wisconsin', latitude: 42.7261, longitude: -87.7829, population: 77000, zipCode: '53403' },
      
      // Wyoming
      { name: 'Cheyenne', state: 'Wyoming', latitude: 41.1400, longitude: -104.8202, population: 65000, zipCode: '82001' },
      { name: 'Casper', state: 'Wyoming', latitude: 42.8501, longitude: -106.3252, population: 58000, zipCode: '82601' },
      { name: 'Laramie', state: 'Wyoming', latitude: 41.3114, longitude: -105.5911, population: 33000, zipCode: '82070' },
      { name: 'Gillette', state: 'Wyoming', latitude: 44.2911, longitude: -105.5022, population: 32000, zipCode: '82716' }
    ]
  },
  unitedKingdom: {
    name: 'United Kingdom',
    code: 'GB',
    continent: 'Europe',
    currency: 'GBP',
    phoneCode: '+44',
    majorCities: [
      // England
      { name: 'London', state: 'England', latitude: 51.5074, longitude: -0.1278, population: 9000000, zipCode: 'SW1A 1AA' },
      { name: 'Birmingham', state: 'England', latitude: 52.4862, longitude: -1.8904, population: 1100000, zipCode: 'B1 1BB' },
      { name: 'Manchester', state: 'England', latitude: 53.4808, longitude: -2.2426, population: 550000, zipCode: 'M1 1AA' },
      { name: 'Liverpool', state: 'England', latitude: 53.4084, longitude: -2.9916, population: 500000, zipCode: 'L1 1AA' },
      { name: 'Leeds', state: 'England', latitude: 53.8008, longitude: -1.5491, population: 790000, zipCode: 'LS1 1AA' },
      { name: 'Sheffield', state: 'England', latitude: 53.3811, longitude: -1.4701, population: 580000, zipCode: 'S1 1AA' },
      { name: 'Bristol', state: 'England', latitude: 51.4545, longitude: -2.5879, population: 460000, zipCode: 'BS1 1AA' },
      { name: 'Leicester', state: 'England', latitude: 52.6369, longitude: -1.1398, population: 355000, zipCode: 'LE1 1AA' },
      { name: 'Coventry', state: 'England', latitude: 52.4068, longitude: -1.5197, population: 370000, zipCode: 'CV1 1AA' },
      { name: 'Bradford', state: 'England', latitude: 53.7960, longitude: -1.7594, population: 540000, zipCode: 'BD1 1AA' },
      { name: 'Nottingham', state: 'England', latitude: 52.9548, longitude: -1.1581, population: 330000, zipCode: 'NG1 1AA' },
      { name: 'Newcastle upon Tyne', state: 'England', latitude: 54.9783, longitude: -1.6174, population: 300000, zipCode: 'NE1 1AA' },
      { name: 'Southampton', state: 'England', latitude: 50.9097, longitude: -1.4044, population: 250000, zipCode: 'SO14 2AA' },
      { name: 'Plymouth', state: 'England', latitude: 50.3755, longitude: -4.1427, population: 260000, zipCode: 'PL1 1AA' },
      { name: 'Oxford', state: 'England', latitude: 51.7520, longitude: -1.2577, population: 150000, zipCode: 'OX1 1AA' },
      { name: 'Cambridge', state: 'England', latitude: 52.2053, longitude: 0.1218, population: 130000, zipCode: 'CB1 1AA' },
      { name: 'Brighton', state: 'England', latitude: 50.8225, longitude: -0.1372, population: 290000, zipCode: 'BN1 1AA' },
      { name: 'York', state: 'England', latitude: 53.9590, longitude: -1.0815, population: 210000, zipCode: 'YO1 1AA' },
      
      // Scotland
      { name: 'Glasgow', state: 'Scotland', latitude: 55.8642, longitude: -4.2518, population: 630000, zipCode: 'G1 1AA' },
      { name: 'Edinburgh', state: 'Scotland', latitude: 55.9533, longitude: -3.1883, population: 520000, zipCode: 'EH1 1AA' },
      { name: 'Aberdeen', state: 'Scotland', latitude: 57.1497, longitude: -2.0943, population: 230000, zipCode: 'AB10 1AA' },
      { name: 'Dundee', state: 'Scotland', latitude: 56.4620, longitude: -2.9707, population: 150000, zipCode: 'DD1 1AA' },
      
      // Wales
      { name: 'Cardiff', state: 'Wales', latitude: 51.4816, longitude: -3.1791, population: 360000, zipCode: 'CF10 1AA' },
      { name: 'Swansea', state: 'Wales', latitude: 51.6214, longitude: -3.9436, population: 240000, zipCode: 'SA1 1AA' },
      { name: 'Newport', state: 'Wales', latitude: 51.5842, longitude: -2.9977, population: 150000, zipCode: 'NP19 1AA' },
      
      // Northern Ireland
      { name: 'Belfast', state: 'Northern Ireland', latitude: 54.5973, longitude: -5.9301, population: 340000, zipCode: 'BT1 1AA' },
      { name: 'Derry', state: 'Northern Ireland', latitude: 54.9981, longitude: -7.3086, population: 110000, zipCode: 'BT48 6AA' },
      { name: 'Lisburn', state: 'Northern Ireland', latitude: 54.5162, longitude: -6.0580, population: 75000, zipCode: 'BT28 1AA' }
    ]
  },
  
  germany: {
    name: 'Germany',
    code: 'DE',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+49',
    majorCities: [
      { name: 'Berlin', state: 'Berlin', latitude: 52.5200, longitude: 13.4050, population: 3700000, zipCode: '10115' },
      { name: 'Hamburg', state: 'Hamburg', latitude: 53.5511, longitude: 9.9937, population: 1900000, zipCode: '20095' },
      { name: 'Munich', state: 'Bavaria', latitude: 48.1351, longitude: 11.5820, population: 1500000, zipCode: '80331' },
      { name: 'Cologne', state: 'North Rhine-Westphalia', latitude: 50.9375, longitude: 6.9603, population: 1100000, zipCode: '50667' },
      { name: 'Frankfurt am Main', state: 'Hesse', latitude: 50.1109, longitude: 8.6821, population: 760000, zipCode: '60311' },
      { name: 'Stuttgart', state: 'Baden-Württemberg', latitude: 48.7758, longitude: 9.1829, population: 630000, zipCode: '70173' },
      { name: 'Düsseldorf', state: 'North Rhine-Westphalia', latitude: 51.2277, longitude: 6.7735, population: 620000, zipCode: '40213' },
      { name: 'Leipzig', state: 'Saxony', latitude: 51.3397, longitude: 12.3731, population: 600000, zipCode: '04109' },
      { name: 'Dortmund', state: 'North Rhine-Westphalia', latitude: 51.5136, longitude: 7.4653, population: 590000, zipCode: '44135' },
      { name: 'Essen', state: 'North Rhine-Westphalia', latitude: 51.4556, longitude: 7.0116, population: 580000, zipCode: '45127' },
      { name: 'Bremen', state: 'Bremen', latitude: 53.0793, longitude: 8.8017, population: 570000, zipCode: '28195' },
      { name: 'Dresden', state: 'Saxony', latitude: 51.0504, longitude: 13.7373, population: 560000, zipCode: '01067' },
      { name: 'Hanover', state: 'Lower Saxony', latitude: 52.3759, longitude: 9.7320, population: 540000, zipCode: '30159' },
      { name: 'Nuremberg', state: 'Bavaria', latitude: 49.4521, longitude: 11.0767, population: 520000, zipCode: '90402' },
      { name: 'Duisburg', state: 'North Rhine-Westphalia', latitude: 51.4344, longitude: 6.7623, population: 500000, zipCode: '47051' },
      { name: 'Bochum', state: 'North Rhine-Westphalia', latitude: 51.4818, longitude: 7.2162, population: 365000, zipCode: '44787' },
      { name: 'Wuppertal', state: 'North Rhine-Westphalia', latitude: 51.2562, longitude: 7.1508, population: 355000, zipCode: '42103' },
      { name: 'Bielefeld', state: 'North Rhine-Westphalia', latitude: 52.0302, longitude: 8.5325, population: 340000, zipCode: '33602' },
      { name: 'Bonn', state: 'North Rhine-Westphalia', latitude: 50.7374, longitude: 7.0982, population: 330000, zipCode: '53111' },
      { name: 'Münster', state: 'North Rhine-Westphalia', latitude: 51.9607, longitude: 7.6261, population: 315000, zipCode: '48143' },
      { name: 'Karlsruhe', state: 'Baden-Württemberg', latitude: 49.0069, longitude: 8.4037, population: 310000, zipCode: '76131' },
      { name: 'Mannheim', state: 'Baden-Württemberg', latitude: 49.4875, longitude: 8.4660, population: 310000, zipCode: '68161' },
      { name: 'Augsburg', state: 'Bavaria', latitude: 48.3705, longitude: 10.8978, population: 295000, zipCode: '86150' },
      { name: 'Wiesbaden', state: 'Hesse', latitude: 50.0782, longitude: 8.2398, population: 280000, zipCode: '65183' },
      { name: 'Gelsenkirchen', state: 'North Rhine-Westphalia', latitude: 51.5177, longitude: 7.0857, population: 260000, zipCode: '45879' },
      { name: 'Mönchengladbach', state: 'North Rhine-Westphalia', latitude: 51.1805, longitude: 6.4428, population: 260000, zipCode: '41061' },
      { name: 'Braunschweig', state: 'Lower Saxony', latitude: 52.2689, longitude: 10.5268, population: 250000, zipCode: '38100' },
      { name: 'Chemnitz', state: 'Saxony', latitude: 50.8278, longitude: 12.9214, population: 245000, zipCode: '09111' },
      { name: 'Kiel', state: 'Schleswig-Holstein', latitude: 54.3233, longitude: 10.1228, population: 245000, zipCode: '24103' },
      { name: 'Aachen', state: 'North Rhine-Westphalia', latitude: 50.7753, longitude: 6.0839, population: 250000, zipCode: '52062' }
    ]
  },
  
  france: {
    name: 'France',
    code: 'FR',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+33',
    majorCities: [
      { name: 'Paris', state: 'Île-de-France', latitude: 48.8566, longitude: 2.3522, population: 11000000, zipCode: '75001' },
      { name: 'Marseille', state: 'Provence-Alpes-Côte d\'Azur', latitude: 43.2965, longitude: 5.3698, population: 870000, zipCode: '13001' },
      { name: 'Lyon', state: 'Auvergne-Rhône-Alpes', latitude: 45.7640, longitude: 4.8357, population: 520000, zipCode: '69001' },
      { name: 'Toulouse', state: 'Occitanie', latitude: 43.6047, longitude: 1.4442, population: 480000, zipCode: '31000' },
      { name: 'Nice', state: 'Provence-Alpes-Côte d\'Azur', latitude: 43.7102, longitude: 7.2620, population: 340000, zipCode: '06000' },
      { name: 'Nantes', state: 'Pays de la Loire', latitude: 47.2184, longitude: -1.5536, population: 320000, zipCode: '44000' },
      { name: 'Montpellier', state: 'Occitanie', latitude: 43.6110, longitude: 3.8767, population: 290000, zipCode: '34000' },
      { name: 'Strasbourg', state: 'Grand Est', latitude: 48.5734, longitude: 7.7521, population: 280000, zipCode: '67000' },
      { name: 'Bordeaux', state: 'Nouvelle-Aquitaine', latitude: 44.8378, longitude: -0.5792, population: 260000, zipCode: '33000' },
      { name: 'Lille', state: 'Hauts-de-France', latitude: 50.6292, longitude: 3.0573, population: 230000, zipCode: '59000' },
      { name: 'Rennes', state: 'Brittany', latitude: 48.1173, longitude: -1.6778, population: 220000, zipCode: '35000' },
      { name: 'Reims', state: 'Grand Est', latitude: 49.2583, longitude: 4.0317, population: 185000, zipCode: '51100' },
      { name: 'Le Havre', state: 'Normandy', latitude: 49.4944, longitude: 0.1079, population: 170000, zipCode: '76600' },
      { name: 'Saint-Étienne', state: 'Auvergne-Rhône-Alpes', latitude: 45.4397, longitude: 4.3872, population: 175000, zipCode: '42000' },
      { name: 'Toulon', state: 'Provence-Alpes-Côte d\'Azur', latitude: 43.1242, longitude: 5.9280, population: 170000, zipCode: '83000' },
      { name: 'Grenoble', state: 'Auvergne-Rhône-Alpes', latitude: 45.1885, longitude: 5.7245, population: 160000, zipCode: '38000' },
      { name: 'Dijon', state: 'Bourgogne-Franche-Comté', latitude: 47.3220, longitude: 5.0415, population: 155000, zipCode: '21000' },
      { name: 'Angers', state: 'Pays de la Loire', latitude: 47.4784, longitude: -0.5632, population: 155000, zipCode: '49000' },
      { name: 'Nîmes', state: 'Occitanie', latitude: 43.8367, longitude: 4.3601, population: 150000, zipCode: '30000' },
      { name: 'Villeurbanne', state: 'Auvergne-Rhône-Alpes', latitude: 45.7718, longitude: 4.8902, population: 150000, zipCode: '69100' },
      { name: 'Aix-en-Provence', state: 'Provence-Alpes-Côte d\'Azur', latitude: 43.5297, longitude: 5.4474, population: 145000, zipCode: '13100' },
      { name: 'Saint-Denis', state: 'Île-de-France', latitude: 48.9362, longitude: 2.3574, population: 115000, zipCode: '93200' },
      { name: 'Le Mans', state: 'Pays de la Loire', latitude: 48.0061, longitude: 0.1996, population: 145000, zipCode: '72000' },
      { name: 'Brest', state: 'Brittany', latitude: 48.3904, longitude: -4.4861, population: 140000, zipCode: '29200' },
      { name: 'Limoges', state: 'Nouvelle-Aquitaine', latitude: 45.8336, longitude: 1.2611, population: 135000, zipCode: '87000' },
      { name: 'Tours', state: 'Centre-Val de Loire', latitude: 47.3941, longitude: 0.6848, population: 135000, zipCode: '37000' },
      { name: 'Amiens', state: 'Hauts-de-France', latitude: 49.8941, longitude: 2.2957, population: 135000, zipCode: '80000' },
      { name: 'Perpignan', state: 'Occitanie', latitude: 42.6887, longitude: 2.8948, population: 120000, zipCode: '66000' },
      { name: 'Metz', state: 'Grand Est', latitude: 49.1193, longitude: 6.1757, population: 118000, zipCode: '57000' },
      { name: 'Besançon', state: 'Bourgogne-Franche-Comté', latitude: 47.2378, longitude: 6.0241, population: 115000, zipCode: '25000' }
    ]
  },
  
  ivoryCoast: {
    name: 'Côte d\'Ivoire',
    code: 'CI',
    continent: 'Africa',
    currency: 'XOF',
    phoneCode: '+225',
    majorCities: [
      { name: 'Abidjan', latitude: 5.3600, longitude: -4.0083, population: 4700000 },
      { name: 'Yamoussoukro', latitude: 6.8276, longitude: -5.2893, population: 280000 },
      { name: 'Bouaké', latitude: 7.6900, longitude: -5.0300, population: 660000 },
      { name: 'Daloa', latitude: 6.8770, longitude: -6.4502, population: 270000 },
      { name: 'San-Pédro', latitude: 4.7500, longitude: -6.6333, population: 260000 },
      { name: 'Korhogo', latitude: 9.4500, longitude: -5.6333, population: 250000 },
      { name: 'Man', latitude: 7.4000, longitude: -7.5500, population: 150000 },
      { name: 'Gagnoa', latitude: 6.1333, longitude: -5.9500, population: 140000 },
      { name: 'Divo', latitude: 5.8333, longitude: -5.3667, population: 130000 },
      { name: 'Abengourou', latitude: 6.7333, longitude: -3.4833, population: 120000 },
      { name: 'Soubré', latitude: 5.7833, longitude: -6.6000, population: 110000 },
      { name: 'Séguéla', latitude: 7.9667, longitude: -6.6667, population: 100000 },
      { name: 'Odienné', latitude: 9.5000, longitude: -7.5667, population: 90000 },
      { name: 'Bondoukou', latitude: 8.0500, longitude: -2.8000, population: 85000 },
      { name: 'Ferkessédougou', latitude: 9.5833, longitude: -5.2000, population: 80000 },
      { name: 'Dimbokro', latitude: 6.6500, longitude: -4.7000, population: 75000 },
      { name: 'Agboville', latitude: 5.9333, longitude: -4.2167, population: 70000 },
      { name: 'Sinfra', latitude: 6.6167, longitude: -5.9167, population: 65000 },
      { name: 'Issia', latitude: 6.4833, longitude: -6.5833, population: 60000 },
      { name: 'Lakota', latitude: 5.8500, longitude: -5.6833, population: 55000 },
      { name: 'Grand-Bassam', latitude: 5.2000, longitude: -3.7333, population: 80000 },
      { name: 'Dabou', latitude: 5.3167, longitude: -4.3833, population: 50000 },
      { name: 'Bingerville', latitude: 5.3500, longitude: -3.8833, population: 90000 },
      { name: 'Oumé', latitude: 6.3833, longitude: -5.4000, population: 45000 },
      { name: 'Bouaflé', latitude: 6.9833, longitude: -5.7500, population: 60000 },
      { name: 'Sassandra', latitude: 4.9500, longitude: -6.0833, population: 40000 },
      { name: 'Tiassalé', latitude: 5.9000, longitude: -4.8333, population: 40000 },
      { name: 'Katiola', latitude: 8.1333, longitude: -5.1000, population: 60000 },
      { name: 'Toumodi', latitude: 6.5500, longitude: -5.0167, population: 35000 },
      { name: 'Duékoué', latitude: 6.7333, longitude: -7.3500, population: 65000 }
    ]
  },
  
  // Additional countries with expanded cities
  canada: {
    name: 'Canada',
    code: 'CA',
    continent: 'North America',
    currency: 'CAD',
    phoneCode: '+1',
    majorCities: [
      { name: 'Toronto', state: 'Ontario', latitude: 43.6532, longitude: -79.3832, population: 2800000, zipCode: 'M5H' },
      { name: 'Montreal', state: 'Quebec', latitude: 45.5017, longitude: -73.5673, population: 1800000, zipCode: 'H3A' },
      { name: 'Vancouver', state: 'British Columbia', latitude: 49.2827, longitude: -123.1207, population: 675000, zipCode: 'V6B' },
      { name: 'Calgary', state: 'Alberta', latitude: 51.0447, longitude: -114.0719, population: 1300000, zipCode: 'T2P' },
      { name: 'Edmonton', state: 'Alberta', latitude: 53.5461, longitude: -113.4938, population: 1000000, zipCode: 'T5J' },
      { name: 'Ottawa', state: 'Ontario', latitude: 45.4215, longitude: -75.6972, population: 1000000, zipCode: 'K1A' },
      { name: 'Winnipeg', state: 'Manitoba', latitude: 49.8951, longitude: -97.1384, population: 750000, zipCode: 'R3C' },
      { name: 'Quebec City', state: 'Quebec', latitude: 46.8139, longitude: -71.2080, population: 540000, zipCode: 'G1A' },
      { name: 'Hamilton', state: 'Ontario', latitude: 43.2557, longitude: -79.8711, population: 570000, zipCode: 'L8P' },
      { name: 'Kitchener', state: 'Ontario', latitude: 43.4516, longitude: -80.4925, population: 250000, zipCode: 'N2G' },
      { name: 'London', state: 'Ontario', latitude: 42.9849, longitude: -81.2453, population: 400000, zipCode: 'N6A' },
      { name: 'Victoria', state: 'British Columbia', latitude: 48.4284, longitude: -123.3656, population: 385000, zipCode: 'V8W' },
      { name: 'Halifax', state: 'Nova Scotia', latitude: 44.6488, longitude: -63.5752, population: 430000, zipCode: 'B3J' },
      { name: 'Oshawa', state: 'Ontario', latitude: 43.8971, longitude: -78.8658, population: 170000, zipCode: 'L1H' },
      { name: 'Windsor', state: 'Ontario', latitude: 42.3149, longitude: -83.0364, population: 230000, zipCode: 'N9A' },
      { name: 'Saskatoon', state: 'Saskatchewan', latitude: 52.1579, longitude: -106.6702, population: 270000, zipCode: 'S7K' },
      { name: 'Regina', state: 'Saskatchewan', latitude: 50.4452, longitude: -104.6189, population: 230000, zipCode: 'S4P' },
      { name: 'St. John\'s', state: 'Newfoundland', latitude: 47.5615, longitude: -52.7126, population: 110000, zipCode: 'A1C' },
      { name: 'Barrie', state: 'Ontario', latitude: 44.3894, longitude: -79.6903, population: 150000, zipCode: 'L4M' },
      { name: 'Kelowna', state: 'British Columbia', latitude: 49.8880, longitude: -119.4960, population: 145000, zipCode: 'V1Y' },
      { name: 'Abbotsford', state: 'British Columbia', latitude: 49.0504, longitude: -122.3045, population: 160000, zipCode: 'V2S' },
      { name: 'Sherbrooke', state: 'Quebec', latitude: 45.4042, longitude: -71.8929, population: 170000, zipCode: 'J1H' },
      { name: 'Trois-Rivières', state: 'Quebec', latitude: 46.3432, longitude: -72.5477, population: 135000, zipCode: 'G9A' },
      { name: 'Guelph', state: 'Ontario', latitude: 43.5448, longitude: -80.2482, population: 135000, zipCode: 'N1H' },
      { name: 'Kingston', state: 'Ontario', latitude: 44.2312, longitude: -76.4860, population: 135000, zipCode: 'K7L' },
      { name: 'Cambridge', state: 'Ontario', latitude: 43.3601, longitude: -80.3123, population: 140000, zipCode: 'N1R' },
      { name: 'Moncton', state: 'New Brunswick', latitude: 46.0878, longitude: -64.7782, population: 85000, zipCode: 'E1C' },
      { name: 'Thunder Bay', state: 'Ontario', latitude: 48.3809, longitude: -89.2477, population: 110000, zipCode: 'P7B' },
      { name: 'St. Catharines', state: 'Ontario', latitude: 43.1594, longitude: -79.2469, population: 135000, zipCode: 'L2R' },
      { name: 'Burnaby', state: 'British Columbia', latitude: 49.2488, longitude: -122.9805, population: 250000, zipCode: 'V5C' }
    ]
  },
  
  australia: {
    name: 'Australia',
    code: 'AU',
    continent: 'Oceania',
    currency: 'AUD',
    phoneCode: '+61',
    majorCities: [
      { name: 'Sydney', state: 'New South Wales', latitude: -33.8688, longitude: 151.2093, population: 5300000, zipCode: '2000' },
      { name: 'Melbourne', state: 'Victoria', latitude: -37.8136, longitude: 144.9631, population: 5000000, zipCode: '3000' },
      { name: 'Brisbane', state: 'Queensland', latitude: -27.4698, longitude: 153.0251, population: 2500000, zipCode: '4000' },
      { name: 'Perth', state: 'Western Australia', latitude: -31.9505, longitude: 115.8605, population: 2100000, zipCode: '6000' },
      { name: 'Adelaide', state: 'South Australia', latitude: -34.9285, longitude: 138.6007, population: 1350000, zipCode: '5000' },
      { name: 'Gold Coast', state: 'Queensland', latitude: -28.0167, longitude: 153.4000, population: 700000, zipCode: '4217' },
      { name: 'Newcastle', state: 'New South Wales', latitude: -32.9283, longitude: 151.7817, population: 480000, zipCode: '2300' },
      { name: 'Canberra', state: 'ACT', latitude: -35.2809, longitude: 149.1300, population: 430000, zipCode: '2600' },
      { name: 'Wollongong', state: 'New South Wales', latitude: -34.4278, longitude: 150.8931, population: 310000, zipCode: '2500' },
      { name: 'Hobart', state: 'Tasmania', latitude: -42.8821, longitude: 147.3272, population: 240000, zipCode: '7000' },
      { name: 'Geelong', state: 'Victoria', latitude: -38.1499, longitude: 144.3617, population: 270000, zipCode: '3220' },
      { name: 'Townsville', state: 'Queensland', latitude: -19.2590, longitude: 146.8169, population: 195000, zipCode: '4810' },
      { name: 'Cairns', state: 'Queensland', latitude: -16.9186, longitude: 145.7781, population: 160000, zipCode: '4870' },
      { name: 'Darwin', state: 'Northern Territory', latitude: -12.4634, longitude: 130.8456, population: 145000, zipCode: '0800' },
      { name: 'Toowoomba', state: 'Queensland', latitude: -27.5598, longitude: 151.9507, population: 165000, zipCode: '4350' },
      { name: 'Ballarat', state: 'Victoria', latitude: -37.5622, longitude: 143.8503, population: 110000, zipCode: '3350' },
      { name: 'Bendigo', state: 'Victoria', latitude: -36.7570, longitude: 144.2794, population: 100000, zipCode: '3550' },
      { name: 'Launceston', state: 'Tasmania', latitude: -41.4332, longitude: 147.1441, population: 110000, zipCode: '7250' },
      { name: 'Mackay', state: 'Queensland', latitude: -21.1411, longitude: 149.1861, population: 85000, zipCode: '4740' },
      { name: 'Rockhampton', state: 'Queensland', latitude: -23.3791, longitude: 150.5100, population: 80000, zipCode: '4700' },
      { name: 'Bundaberg', state: 'Queensland', latitude: -24.8661, longitude: 152.3489, population: 75000, zipCode: '4670' },
      { name: 'Hervey Bay', state: 'Queensland', latitude: -25.2886, longitude: 152.8405, population: 55000, zipCode: '4655' },
      { name: 'Wagga Wagga', state: 'New South Wales', latitude: -35.1082, longitude: 147.3598, population: 65000, zipCode: '2650' },
      { name: 'Albury', state: 'New South Wales', latitude: -36.0737, longitude: 146.9135, population: 55000, zipCode: '2640' },
      { name: 'Mildura', state: 'Victoria', latitude: -34.1851, longitude: 142.1569, population: 55000, zipCode: '3500' },
      { name: 'Shepparton', state: 'Victoria', latitude: -36.3833, longitude: 145.4000, population: 50000, zipCode: '3630' },
      { name: 'Tamworth', state: 'New South Wales', latitude: -31.0927, longitude: 150.9320, population: 65000, zipCode: '2340' },
      { name: 'Port Macquarie', state: 'New South Wales', latitude: -31.4309, longitude: 152.9089, population: 50000, zipCode: '2444' },
      { name: 'Orange', state: 'New South Wales', latitude: -33.2833, longitude: 149.1000, population: 40000, zipCode: '2800' },
      { name: 'Dubbo', state: 'New South Wales', latitude: -32.2569, longitude: 148.6010, population: 40000, zipCode: '2830' }
    ]
  },
  
  egypt: {
    name: 'Egypt',
    code: 'EG',
    continent: 'Africa',
    currency: 'EGP',
    phoneCode: '+20',
    majorCities: [
      { name: 'Cairo', latitude: 30.0444, longitude: 31.2357, population: 10000000 },
      { name: 'Alexandria', latitude: 31.2001, longitude: 29.9187, population: 5200000 },
      { name: 'Giza', latitude: 30.0131, longitude: 31.2089, population: 4000000 },
      { name: 'Shubra El-Kheima', latitude: 30.1286, longitude: 31.2422, population: 1200000 },
      { name: 'Port Said', latitude: 31.2653, longitude: 32.3019, population: 750000 },
      { name: 'Suez', latitude: 29.9668, longitude: 32.5498, population: 750000 },
      { name: 'Luxor', latitude: 25.6872, longitude: 32.6396, population: 510000 },
      { name: 'Mansoura', latitude: 31.0409, longitude: 31.3785, population: 600000 },
      { name: 'Tanta', latitude: 30.7865, longitude: 31.0004, population: 530000 },
      { name: 'Asyut', latitude: 27.1809, longitude: 31.1837, population: 475000 },
      { name: 'Ismailia', latitude: 30.5965, longitude: 32.2715, population: 400000 },
      { name: 'Faiyum', latitude: 29.3084, longitude: 30.8428, population: 370000 },
      { name: 'Zagazig', latitude: 30.5876, longitude: 31.5020, population: 400000 },
      { name: 'Aswan', latitude: 24.0889, longitude: 32.8998, population: 350000 },
      { name: 'Damietta', latitude: 31.4175, longitude: 31.8144, population: 350000 },
      { name: 'Damanhur', latitude: 31.0343, longitude: 30.4687, population: 320000 },
      { name: 'Minya', latitude: 28.1099, longitude: 30.7503, population: 310000 },
      { name: 'Beni Suef', latitude: 29.0661, longitude: 31.0994, population: 290000 },
      { name: 'Qena', latitude: 26.1551, longitude: 32.7160, population: 270000 },
      { name: 'Sohag', latitude: 26.5591, longitude: 31.6948, population: 260000 },
      { name: 'Hurghada', latitude: 27.2579, longitude: 33.8116, population: 260000 },
      { name: 'Kafr el-Sheikh', latitude: 31.1108, longitude: 30.9364, population: 180000 },
      { name: 'Shibin el-Kom', latitude: 30.5572, longitude: 31.0105, population: 175000 },
      { name: 'Banha', latitude: 30.4667, longitude: 31.1833, population: 165000 },
      { name: 'Arish', latitude: 31.1269, longitude: 33.7973, population: 165000 },
      { name: 'Mallawi', latitude: 27.7333, longitude: 30.8333, population: 150000 },
      { name: 'Bilbeis', latitude: 30.4167, longitude: 31.5667, population: 145000 },
      { name: 'Marsa Matruh', latitude: 31.3525, longitude: 27.2453, population: 140000 },
      { name: 'Idfu', latitude: 24.9767, longitude: 32.8728, population: 133000 },
      { name: 'Sharm El Sheikh', latitude: 27.9158, longitude: 34.3300, population: 75000 }
    ]
  },
  
  morocco: {
    name: 'Morocco',
    code: 'MA',
    continent: 'Africa',
    currency: 'MAD',
    phoneCode: '+212',
    majorCities: [
      { name: 'Casablanca', latitude: 33.5731, longitude: -7.5898, population: 3700000 },
      { name: 'Rabat', latitude: 34.0209, longitude: -6.8416, population: 580000 },
      { name: 'Fez', latitude: 34.0181, longitude: -5.0078, population: 1100000 },
      { name: 'Marrakech', latitude: 31.6295, longitude: -7.9811, population: 930000 },
      { name: 'Tangier', latitude: 35.7595, longitude: -5.8340, population: 950000 },
      { name: 'Salé', latitude: 34.0531, longitude: -6.7985, population: 900000 },
      { name: 'Meknes', latitude: 33.8730, longitude: -5.5407, population: 630000 },
      { name: 'Oujda', latitude: 34.6867, longitude: -1.9114, population: 500000 },
      { name: 'Kenitra', latitude: 34.2541, longitude: -6.5890, population: 430000 },
      { name: 'Agadir', latitude: 30.4278, longitude: -9.5981, population: 420000 },
      { name: 'Tetouan', latitude: 35.5889, longitude: -5.3626, population: 380000 },
      { name: 'Safi', latitude: 32.2994, longitude: -9.2372, population: 300000 },
      { name: 'El Jadida', latitude: 33.2316, longitude: -8.5007, population: 195000 },
      { name: 'Beni Mellal', latitude: 32.3373, longitude: -6.3498, population: 185000 },
      { name: 'Khouribga', latitude: 32.8811, longitude: -6.9063, population: 170000 },
      { name: 'Nador', latitude: 35.1743, longitude: -2.9287, population: 160000 },
      { name: 'Taza', latitude: 34.2100, longitude: -4.0100, population: 145000 },
      { name: 'Settat', latitude: 33.0014, longitude: -7.6196, population: 140000 },
      { name: 'Mohammedia', latitude: 33.6866, longitude: -7.3833, population: 190000 },
      { name: 'Larache', latitude: 35.1932, longitude: -6.1564, population: 125000 },
      { name: 'Ksar el-Kebir', latitude: 35.0006, longitude: -5.9000, population: 120000 },
      { name: 'Khemisset', latitude: 33.8242, longitude: -6.0666, population: 115000 },
      { name: 'Guelmim', latitude: 28.9870, longitude: -10.0574, population: 100000 },
      { name: 'Ouarzazate', latitude: 30.9200, longitude: -6.8936, population: 70000 },
      { name: 'Essaouira', latitude: 31.5085, longitude: -9.7595, population: 80000 },
      { name: 'Errachidia', latitude: 31.9314, longitude: -4.4266, population: 95000 },
      { name: 'Taourirt', latitude: 34.4108, longitude: -2.8897, population: 85000 },
      { name: 'Berkane', latitude: 34.9200, longitude: -2.3200, population: 110000 },
      { name: 'Sidi Kacem', latitude: 34.2256, longitude: -5.7081, population: 80000 },
      { name: 'Taroudant', latitude: 30.4703, longitude: -8.8767, population: 80000 }
    ]
  },

  india: {
    name: 'India',
    code: 'IN',
    continent: 'Asia',
    currency: 'INR',
    phoneCode: '+91',
    majorCities: [
      { name: 'Mumbai', state: 'Maharashtra', latitude: 19.0760, longitude: 72.8777, population: 20400000 },
      { name: 'Delhi', state: 'Delhi', latitude: 28.7041, longitude: 77.1025, population: 30300000 },
      { name: 'Bangalore', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946, population: 12300000 },
      { name: 'Hyderabad', state: 'Telangana', latitude: 17.3850, longitude: 78.4867, population: 10000000 },
      { name: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707, population: 10900000 },
      { name: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639, population: 14900000 },
      { name: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567, population: 6600000 },
      { name: 'Ahmedabad', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714, population: 8400000 },
      { name: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873, population: 3900000 },
      { name: 'Surat', state: 'Gujarat', latitude: 21.1702, longitude: 72.8311, population: 6900000 },
      { name: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462, population: 3700000 },
      { name: 'Kochi', state: 'Kerala', latitude: 9.9312, longitude: 76.2673, population: 2100000 }
    ]
  },

  pakistan: {
    name: 'Pakistan',
    code: 'PK',
    continent: 'Asia',
    currency: 'PKR',
    phoneCode: '+92',
    majorCities: [
      { name: 'Karachi', latitude: 24.8607, longitude: 67.0011, population: 16000000 },
      { name: 'Lahore', latitude: 31.5497, longitude: 74.3436, population: 13000000 },
      { name: 'Islamabad', latitude: 33.6844, longitude: 73.0479, population: 1100000 },
      { name: 'Rawalpindi', latitude: 33.5651, longitude: 73.0169, population: 2100000 },
      { name: 'Faisalabad', latitude: 31.4504, longitude: 73.1350, population: 3200000 },
      { name: 'Peshawar', latitude: 34.0151, longitude: 71.5249, population: 1970000 }
    ]
  },

  bangladesh: {
    name: 'Bangladesh',
    code: 'BD',
    continent: 'Asia',
    currency: 'BDT',
    phoneCode: '+880',
    majorCities: [
      { name: 'Dhaka', latitude: 23.8103, longitude: 90.4125, population: 21000000 },
      { name: 'Chittagong', latitude: 22.3569, longitude: 91.7832, population: 5200000 },
      { name: 'Khulna', latitude: 22.8456, longitude: 89.5403, population: 1500000 },
      { name: 'Rajshahi', latitude: 24.3745, longitude: 88.6042, population: 900000 }
    ]
  },

  philippines: {
    name: 'Philippines',
    code: 'PH',
    continent: 'Asia',
    currency: 'PHP',
    phoneCode: '+63',
    majorCities: [
      { name: 'Manila', latitude: 14.5995, longitude: 120.9842, population: 13900000 },
      { name: 'Quezon City', latitude: 14.6760, longitude: 121.0437, population: 2960000 },
      { name: 'Davao City', latitude: 7.1907, longitude: 125.4553, population: 1770000 },
      { name: 'Cebu City', latitude: 10.3157, longitude: 123.8854, population: 960000 }
    ]
  },

  indonesia: {
    name: 'Indonesia',
    code: 'ID',
    continent: 'Asia',
    currency: 'IDR',
    phoneCode: '+62',
    majorCities: [
      { name: 'Jakarta', latitude: -6.2088, longitude: 106.8456, population: 10600000 },
      { name: 'Surabaya', latitude: -7.2575, longitude: 112.7521, population: 2900000 },
      { name: 'Bandung', latitude: -6.9175, longitude: 107.6191, population: 2500000 },
      { name: 'Medan', latitude: 3.5952, longitude: 98.6722, population: 2400000 },
      { name: 'Bali (Denpasar)', state: 'Bali', latitude: -8.6705, longitude: 115.2126, population: 900000 }
    ]
  },

  malaysia: {
    name: 'Malaysia',
    code: 'MY',
    continent: 'Asia',
    currency: 'MYR',
    phoneCode: '+60',
    majorCities: [
      { name: 'Kuala Lumpur', latitude: 3.1390, longitude: 101.6869, population: 1800000 },
      { name: 'George Town', latitude: 5.4141, longitude: 100.3288, population: 800000 },
      { name: 'Johor Bahru', latitude: 1.4927, longitude: 103.7414, population: 1800000 }
    ]
  },

  singapore: {
    name: 'Singapore',
    code: 'SG',
    continent: 'Asia',
    currency: 'SGD',
    phoneCode: '+65',
    majorCities: [
      { name: 'Singapore', latitude: 1.3521, longitude: 103.8198, population: 5700000 }
    ]
  },

  thailand: {
    name: 'Thailand',
    code: 'TH',
    continent: 'Asia',
    currency: 'THB',
    phoneCode: '+66',
    majorCities: [
      { name: 'Bangkok', latitude: 13.7563, longitude: 100.5018, population: 10700000 },
      { name: 'Chiang Mai', latitude: 18.7883, longitude: 98.9853, population: 1200000 },
      { name: 'Phuket', latitude: 7.8804, longitude: 98.3923, population: 420000 }
    ]
  },

  vietnam: {
    name: 'Vietnam',
    code: 'VN',
    continent: 'Asia',
    currency: 'VND',
    phoneCode: '+84',
    majorCities: [
      { name: 'Ho Chi Minh City', latitude: 10.8231, longitude: 106.6297, population: 9000000 },
      { name: 'Hanoi', latitude: 21.0278, longitude: 105.8342, population: 8000000 },
      { name: 'Da Nang', latitude: 16.0544, longitude: 108.2022, population: 1200000 }
    ]
  },

  china: {
    name: 'China',
    code: 'CN',
    continent: 'Asia',
    currency: 'CNY',
    phoneCode: '+86',
    majorCities: [
      { name: 'Shanghai', latitude: 31.2304, longitude: 121.4737, population: 27000000 },
      { name: 'Beijing', latitude: 39.9042, longitude: 116.4074, population: 21500000 },
      { name: 'Guangzhou', latitude: 23.1291, longitude: 113.2644, population: 15300000 },
      { name: 'Shenzhen', latitude: 22.5431, longitude: 114.0579, population: 12500000 }
    ]
  },

  japan: {
    name: 'Japan',
    code: 'JP',
    continent: 'Asia',
    currency: 'JPY',
    phoneCode: '+81',
    majorCities: [
      { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503, population: 14000000 },
      { name: 'Osaka', latitude: 34.6937, longitude: 135.5023, population: 2700000 },
      { name: 'Yokohama', latitude: 35.4437, longitude: 139.6380, population: 3700000 }
    ]
  },

  south_korea: {
    name: 'South Korea',
    code: 'KR',
    continent: 'Asia',
    currency: 'KRW',
    phoneCode: '+82',
    majorCities: [
      { name: 'Seoul', latitude: 37.5665, longitude: 126.9780, population: 9700000 },
      { name: 'Busan', latitude: 35.1796, longitude: 129.0756, population: 3400000 },
      { name: 'Incheon', latitude: 37.4563, longitude: 126.7052, population: 3000000 }
    ]
  },

  uae: {
    name: 'United Arab Emirates',
    code: 'AE',
    continent: 'Asia',
    currency: 'AED',
    phoneCode: '+971',
    majorCities: [
      { name: 'Dubai', latitude: 25.2048, longitude: 55.2708, population: 3400000 },
      { name: 'Abu Dhabi', latitude: 24.4539, longitude: 54.3773, population: 1500000 },
      { name: 'Sharjah', latitude: 25.3463, longitude: 55.4209, population: 1800000 }
    ]
  },

  saudi_arabia: {
    name: 'Saudi Arabia',
    code: 'SA',
    continent: 'Asia',
    currency: 'SAR',
    phoneCode: '+966',
    majorCities: [
      { name: 'Riyadh', latitude: 24.7136, longitude: 46.6753, population: 7600000 },
      { name: 'Jeddah', latitude: 21.4858, longitude: 39.1925, population: 4700000 },
      { name: 'Mecca', latitude: 21.3891, longitude: 39.8579, population: 2400000 }
    ]
  },

  turkey: {
    name: 'Turkey',
    code: 'TR',
    continent: 'Asia',
    currency: 'TRY',
    phoneCode: '+90',
    majorCities: [
      { name: 'Istanbul', latitude: 41.0082, longitude: 28.9784, population: 15500000 },
      { name: 'Ankara', latitude: 39.9334, longitude: 32.8597, population: 5700000 },
      { name: 'Izmir', latitude: 38.4237, longitude: 27.1428, population: 4400000 }
    ]
  },

  brazil: {
    name: 'Brazil',
    code: 'BR',
    continent: 'South America',
    currency: 'BRL',
    phoneCode: '+55',
    majorCities: [
      { name: 'São Paulo', latitude: -23.5505, longitude: -46.6333, population: 12300000 },
      { name: 'Rio de Janeiro', latitude: -22.9068, longitude: -43.1729, population: 6700000 },
      { name: 'Brasília', latitude: -15.8267, longitude: -47.9218, population: 3100000 },
      { name: 'Salvador', latitude: -12.9777, longitude: -38.5016, population: 2900000 }
    ]
  },

  mexico: {
    name: 'Mexico',
    code: 'MX',
    continent: 'North America',
    currency: 'MXN',
    phoneCode: '+52',
    majorCities: [
      { name: 'Mexico City', latitude: 19.4326, longitude: -99.1332, population: 9200000 },
      { name: 'Guadalajara', latitude: 20.6597, longitude: -103.3496, population: 1500000 },
      { name: 'Monterrey', latitude: 25.6866, longitude: -100.3161, population: 1140000 },
      { name: 'Cancún', latitude: 21.1619, longitude: -86.8515, population: 890000 }
    ]
  },

  argentina: {
    name: 'Argentina',
    code: 'AR',
    continent: 'South America',
    currency: 'ARS',
    phoneCode: '+54',
    majorCities: [
      { name: 'Buenos Aires', latitude: -34.6037, longitude: -58.3816, population: 3000000 },
      { name: 'Córdoba', latitude: -31.4201, longitude: -64.1888, population: 1500000 },
      { name: 'Rosario', latitude: -32.9468, longitude: -60.6393, population: 1300000 }
    ]
  },

  colombia: {
    name: 'Colombia',
    code: 'CO',
    continent: 'South America',
    currency: 'COP',
    phoneCode: '+57',
    majorCities: [
      { name: 'Bogotá', latitude: 4.7110, longitude: -74.0721, population: 7400000 },
      { name: 'Medellín', latitude: 6.2442, longitude: -75.5812, population: 2500000 },
      { name: 'Cali', latitude: 3.4516, longitude: -76.5320, population: 2200000 }
    ]
  },

  jamaica: {
    name: 'Jamaica',
    code: 'JM',
    continent: 'North America',
    currency: 'JMD',
    phoneCode: '+1876',
    majorCities: [
      { name: 'Kingston', latitude: 17.9712, longitude: -76.7930, population: 590000 },
      { name: 'Montego Bay', latitude: 18.4762, longitude: -77.8939, population: 110000 }
    ]
  },

  spain: {
    name: 'Spain',
    code: 'ES',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+34',
    majorCities: [
      { name: 'Madrid', latitude: 40.4168, longitude: -3.7038, population: 3300000 },
      { name: 'Barcelona', latitude: 41.3874, longitude: 2.1686, population: 1600000 },
      { name: 'Valencia', latitude: 39.4699, longitude: -0.3763, population: 800000 }
    ]
  },

  italy: {
    name: 'Italy',
    code: 'IT',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+39',
    majorCities: [
      { name: 'Rome', latitude: 41.9028, longitude: 12.4964, population: 2870000 },
      { name: 'Milan', latitude: 45.4642, longitude: 9.1900, population: 1400000 },
      { name: 'Naples', latitude: 40.8518, longitude: 14.2681, population: 970000 }
    ]
  },

  netherlands: {
    name: 'Netherlands',
    code: 'NL',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+31',
    majorCities: [
      { name: 'Amsterdam', latitude: 52.3676, longitude: 4.9041, population: 870000 },
      { name: 'Rotterdam', latitude: 51.9244, longitude: 4.4777, population: 650000 },
      { name: 'The Hague', latitude: 52.0705, longitude: 4.3007, population: 550000 }
    ]
  },

  portugal: {
    name: 'Portugal',
    code: 'PT',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+351',
    majorCities: [
      { name: 'Lisbon', latitude: 38.7223, longitude: -9.1393, population: 545000 },
      { name: 'Porto', latitude: 41.1579, longitude: -8.6291, population: 240000 }
    ]
  },

  poland: {
    name: 'Poland',
    code: 'PL',
    continent: 'Europe',
    currency: 'PLN',
    phoneCode: '+48',
    majorCities: [
      { name: 'Warsaw', latitude: 52.2297, longitude: 21.0122, population: 1800000 },
      { name: 'Kraków', latitude: 50.0647, longitude: 19.9450, population: 780000 }
    ]
  },

  sweden: {
    name: 'Sweden',
    code: 'SE',
    continent: 'Europe',
    currency: 'SEK',
    phoneCode: '+46',
    majorCities: [
      { name: 'Stockholm', latitude: 59.3293, longitude: 18.0686, population: 980000 },
      { name: 'Gothenburg', latitude: 57.7089, longitude: 11.9746, population: 580000 }
    ]
  },

  norway: {
    name: 'Norway',
    code: 'NO',
    continent: 'Europe',
    currency: 'NOK',
    phoneCode: '+47',
    majorCities: [
      { name: 'Oslo', latitude: 59.9139, longitude: 10.7522, population: 700000 },
      { name: 'Bergen', latitude: 60.3913, longitude: 5.3221, population: 285000 }
    ]
  },

  denmark: {
    name: 'Denmark',
    code: 'DK',
    continent: 'Europe',
    currency: 'DKK',
    phoneCode: '+45',
    majorCities: [
      { name: 'Copenhagen', latitude: 55.6761, longitude: 12.5683, population: 800000 },
      { name: 'Aarhus', latitude: 56.1629, longitude: 10.2039, population: 285000 }
    ]
  },

  ireland: {
    name: 'Ireland',
    code: 'IE',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+353',
    majorCities: [
      { name: 'Dublin', latitude: 53.3498, longitude: -6.2603, population: 1200000 },
      { name: 'Cork', latitude: 51.8985, longitude: -8.4756, population: 220000 }
    ]
  },

  switzerland: {
    name: 'Switzerland',
    code: 'CH',
    continent: 'Europe',
    currency: 'CHF',
    phoneCode: '+41',
    majorCities: [
      { name: 'Zurich', latitude: 47.3769, longitude: 8.5417, population: 430000 },
      { name: 'Geneva', latitude: 46.2044, longitude: 6.1432, population: 200000 }
    ]
  },

  belgium: {
    name: 'Belgium',
    code: 'BE',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+32',
    majorCities: [
      { name: 'Brussels', latitude: 50.8503, longitude: 4.3517, population: 1200000 },
      { name: 'Antwerp', latitude: 51.2194, longitude: 4.4025, population: 530000 }
    ]
  },

  austria: {
    name: 'Austria',
    code: 'AT',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+43',
    majorCities: [
      { name: 'Vienna', latitude: 48.2082, longitude: 16.3738, population: 1900000 },
      { name: 'Graz', latitude: 47.0707, longitude: 15.4395, population: 290000 }
    ]
  },

  greece: {
    name: 'Greece',
    code: 'GR',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+30',
    majorCities: [
      { name: 'Athens', latitude: 37.9838, longitude: 23.7275, population: 660000 },
      { name: 'Thessaloniki', latitude: 40.6401, longitude: 22.9444, population: 320000 }
    ]
  },

  russia: {
    name: 'Russia',
    code: 'RU',
    continent: 'Europe',
    currency: 'RUB',
    phoneCode: '+7',
    majorCities: [
      { name: 'Moscow', latitude: 55.7558, longitude: 37.6173, population: 12500000 },
      { name: 'Saint Petersburg', latitude: 59.9311, longitude: 30.3609, population: 5400000 }
    ]
  },

  new_zealand: {
    name: 'New Zealand',
    code: 'NZ',
    continent: 'Oceania',
    currency: 'NZD',
    phoneCode: '+64',
    majorCities: [
      { name: 'Auckland', latitude: -36.8485, longitude: 174.7633, population: 1650000 },
      { name: 'Wellington', latitude: -41.2865, longitude: 174.7762, population: 420000 }
    ]
  },

  zambia: {
    name: 'Zambia',
    code: 'ZM',
    continent: 'Africa',
    currency: 'ZMW',
    phoneCode: '+260',
    majorCities: [
      { name: 'Lusaka', latitude: -15.3875, longitude: 28.3228, population: 2500000 },
      { name: 'Kitwe', latitude: -12.8024, longitude: 28.2132, population: 700000 }
    ]
  },

  zimbabwe: {
    name: 'Zimbabwe',
    code: 'ZW',
    continent: 'Africa',
    currency: 'ZWL',
    phoneCode: '+263',
    majorCities: [
      { name: 'Harare', latitude: -17.8292, longitude: 31.0522, population: 1600000 },
      { name: 'Bulawayo', latitude: -20.1500, longitude: 28.5833, population: 650000 }
    ]
  },

  botswana: {
    name: 'Botswana',
    code: 'BW',
    continent: 'Africa',
    currency: 'BWP',
    phoneCode: '+267',
    majorCities: [
      { name: 'Gaborone', latitude: -24.6282, longitude: 25.9231, population: 260000 }
    ]
  },

  rwanda: {
    name: 'Rwanda',
    code: 'RW',
    continent: 'Africa',
    currency: 'RWF',
    phoneCode: '+250',
    majorCities: [
      { name: 'Kigali', latitude: -1.9706, longitude: 30.1044, population: 1300000 }
    ]
  },

  cameroon: {
    name: 'Cameroon',
    code: 'CM',
    continent: 'Africa',
    currency: 'XAF',
    phoneCode: '+237',
    majorCities: [
      { name: 'Douala', latitude: 4.0511, longitude: 9.7679, population: 3600000 },
      { name: 'Yaoundé', latitude: 3.8480, longitude: 11.5021, population: 4100000 }
    ]
  }
};

// Helper functions
export function getCountriesList(): { name: string; code: string; continent: string }[] {
  return Object.values(locationData).map(country => ({
    name: country.name,
    code: country.code,
    continent: country.continent
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export function getCitiesByCountry(countryCode: string): CityData[] {
  const countryKey = Object.keys(locationData).find(
    key => locationData[key].code === countryCode
  );
  
  if (countryKey && locationData[countryKey]) {
    return locationData[countryKey].majorCities.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  return [];
}

export function getCountryByCode(code: string): CountryData | undefined {
  const countryKey = Object.keys(locationData).find(
    key => locationData[key].code === code
  );
  
  return countryKey ? locationData[countryKey] : undefined;
}

export function getCityData(countryCode: string, cityName: string): CityData | undefined {
  const cities = getCitiesByCountry(countryCode);
  return cities.find(city => city.name.toLowerCase() === cityName.toLowerCase());
}

export function getStatesByCountry(countryCode: string): string[] {
  const cities = getCitiesByCountry(countryCode);
  const states = new Set<string>();
  
  cities.forEach(city => {
    if (city.state) {
      states.add(city.state);
    }
  });
  
  return Array.from(states).sort();
}

export function getCitiesByState(countryCode: string, state: string): CityData[] {
  const cities = getCitiesByCountry(countryCode);
  return cities
    .filter(city => city.state === state)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Alias for backwards compatibility
export const getCitiesForCountry = getCitiesByCountry;

// Get city coordinates
export function getCityCoordinates(countryCode: string, cityName: string): { latitude: number; longitude: number } | null {
  const city = getCityData(countryCode, cityName);
  if (city) {
    return { latitude: city.latitude, longitude: city.longitude };
  }
  return null;
}

// Distance calculation (Haversine formula)
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
