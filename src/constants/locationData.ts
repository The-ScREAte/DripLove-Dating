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
      
      // Additional Major Cities
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
      { name: 'Makurdi', state: 'Benue', latitude: 7.7333, longitude: 8.5333, population: 270000, zipCode: '970001' }
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
      { name: 'Kasoa', state: 'Central', latitude: 5.5320, longitude: -0.4163, population: 350000 },
      { name: 'Madina', state: 'Greater Accra', latitude: 5.6847, longitude: -0.1676, population: 150000 },
      { name: 'Adenta', state: 'Greater Accra', latitude: 5.7000, longitude: -0.1667, population: 120000 },
      { name: 'Teshie', state: 'Greater Accra', latitude: 5.5833, longitude: -0.1000, population: 110000 },
      { name: 'Nungua', state: 'Greater Accra', latitude: 5.5964, longitude: -0.0833, population: 100000 },
      { name: 'Ashaiman', state: 'Greater Accra', latitude: 5.6833, longitude: -0.0333, population: 95000 },
      { name: 'Dansoman', state: 'Greater Accra', latitude: 5.5333, longitude: -0.2833, population: 85000 },
      { name: 'Kaneshie', state: 'Greater Accra', latitude: 5.5667, longitude: -0.2333, population: 80000 },
      
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
      
      // Northern Region
      { name: 'Tamale', state: 'Northern', latitude: 9.4034, longitude: -0.8424, population: 600000 },
      { name: 'Yendi', state: 'Northern', latitude: 9.4667, longitude: -0.0167, population: 80000 },
      { name: 'Savelugu', state: 'Northern', latitude: 9.6333, longitude: -0.8333, population: 40000 },
      { name: 'Gushegu', state: 'Northern', latitude: 10.0000, longitude: -0.3500, population: 30000 },
      { name: 'Bimbilla', state: 'Northern', latitude: 9.4167, longitude: -0.4667, population: 25000 },
      
      // Western Region
      { name: 'Takoradi', state: 'Western', latitude: 4.8845, longitude: -1.7554, population: 445000 },
      { name: 'Sekondi', state: 'Western', latitude: 4.9342, longitude: -1.7108, population: 85000 },
      { name: 'Axim', state: 'Western', latitude: 4.8667, longitude: -2.2333, population: 25000 },
      { name: 'Prestea', state: 'Western', latitude: 5.4333, longitude: -2.1333, population: 35000 },
      { name: 'Tarkwa', state: 'Western', latitude: 5.3000, longitude: -1.9833, population: 60000 },
      { name: 'Elubo', state: 'Western', latitude: 5.1333, longitude: -2.8000, population: 15000 },
      { name: 'Half Assini', state: 'Western', latitude: 4.9500, longitude: -2.8167, population: 12000 },
      
      // Central Region
      { name: 'Cape Coast', state: 'Central', latitude: 5.1053, longitude: -1.2466, population: 200000 },
      { name: 'Elmina', state: 'Central', latitude: 5.0833, longitude: -1.3500, population: 25000 },
      { name: 'Winneba', state: 'Central', latitude: 5.3500, longitude: -0.6167, population: 60000 },
      { name: 'Swedru', state: 'Central', latitude: 5.5333, longitude: -0.7000, population: 45000 },
      { name: 'Dunkwa', state: 'Central', latitude: 5.9667, longitude: -1.7833, population: 30000 },
      { name: 'Saltpond', state: 'Central', latitude: 5.2000, longitude: -1.0667, population: 25000 },
      { name: 'Agona Swedru', state: 'Central', latitude: 5.5333, longitude: -0.7000, population: 35000 },
      
      // Eastern Region
      { name: 'Koforidua', state: 'Eastern', latitude: 6.0833, longitude: -0.2667, population: 120000 },
      { name: 'Akropong', state: 'Eastern', latitude: 5.9833, longitude: -0.0833, population: 15000 },
      { name: 'Mpraeso', state: 'Eastern', latitude: 6.5833, longitude: -0.7333, population: 12000 },
      { name: 'Nkawkaw', state: 'Eastern', latitude: 6.5500, longitude: -0.7667, population: 35000 },
      { name: 'Begoro', state: 'Eastern', latitude: 6.3833, longitude: -0.3833, population: 20000 },
      { name: 'Oda', state: 'Eastern', latitude: 5.9167, longitude: -0.9833, population: 65000 },
      { name: 'Asamankese', state: 'Eastern', latitude: 5.8667, longitude: -0.6667, population: 40000 },
      
      // Volta Region
      { name: 'Ho', state: 'Volta', latitude: 6.6000, longitude: 0.4667, population: 85000 },
      { name: 'Keta', state: 'Volta', latitude: 5.9167, longitude: 0.9833, population: 18000 },
      { name: 'Aflao', state: 'Volta', latitude: 6.1167, longitude: 1.1833, population: 66000 },
      { name: 'Hohoe', state: 'Volta', latitude: 7.1500, longitude: 0.4667, population: 60000 },
      { name: 'Kpando', state: 'Volta', latitude: 6.9833, longitude: 0.2833, population: 30000 },
      { name: 'Denu', state: 'Volta', latitude: 6.0667, longitude: 1.1167, population: 25000 },
      
      // Brong-Ahafo Region (now Bono and Ahafo)
      { name: 'Sunyani', state: 'Bono', latitude: 7.3333, longitude: -2.3333, population: 125000 },
      { name: 'Techiman', state: 'Bono East', latitude: 7.5833, longitude: -1.9333, population: 70000 },
      { name: 'Berekum', state: 'Bono', latitude: 7.4500, longitude: -2.5833, population: 55000 },
      { name: 'Goaso', state: 'Ahafo', latitude: 6.8000, longitude: -2.5167, population: 40000 },
      { name: 'Dormaa Ahenkro', state: 'Bono', latitude: 7.3667, longitude: -2.9500, population: 45000 },
      { name: 'Wenchi', state: 'Bono', latitude: 7.7333, longitude: -2.1000, population: 35000 },
      
      // Upper East Region  
      { name: 'Bolgatanga', state: 'Upper East', latitude: 10.7856, longitude: -0.8506, population: 70000 },
      { name: 'Navrongo', state: 'Upper East', latitude: 10.8956, longitude: -1.0939, population: 25000 },
      { name: 'Bawku', state: 'Upper East', latitude: 11.0500, longitude: -0.2333, population: 50000 },
      { name: 'Zebilla', state: 'Upper East', latitude: 10.8500, longitude: -0.5167, population: 20000 },
      
      // Upper West Region
      { name: 'Wa', state: 'Upper West', latitude: 10.0600, longitude: -2.5000, population: 75000 },
      { name: 'Lawra', state: 'Upper West', latitude: 10.6500, longitude: -2.9000, population: 15000 },
      { name: 'Jirapa', state: 'Upper West', latitude: 10.6167, longitude: -2.7833, population: 20000 },
      { name: 'Tumu', state: 'Upper West', latitude: 10.9167, longitude: -2.2000, population: 18000 },
      
      // North East Region
      { name: 'Nalerigu', state: 'North East', latitude: 10.5333, longitude: -0.3667, population: 15000 },
      { name: 'Walewale', state: 'North East', latitude: 10.3000, longitude: -0.8167, population: 30000 },
      
      // Savannah Region
      { name: 'Damongo', state: 'Savannah', latitude: 9.0833, longitude: -1.8167, population: 35000 },
      { name: 'Bole', state: 'Savannah', latitude: 9.0333, longitude: -2.4833, population: 25000 },
      
      // Oti Region
      { name: 'Dambai', state: 'Oti', latitude: 8.1667, longitude: 0.4833, population: 20000 },
      { name: 'Nkwanta', state: 'Oti', latitude: 8.1000, longitude: 0.1667, population: 30000 },
      
      // Western North Region
      { name: 'Sefwi Wiawso', state: 'Western North', latitude: 6.2167, longitude: -2.4833, population: 35000 },
      { name: 'Bibiani', state: 'Western North', latitude: 6.4667, longitude: -2.3167, population: 40000 }
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
      { name: 'Saint-Louis', latitude: 16.0200, longitude: -16.4833, population: 200000 }
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
      { name: 'Nairobi', latitude: -1.2921, longitude: 36.8219, population: 4500000 },
      { name: 'Mombasa', latitude: -4.0435, longitude: 39.6682, population: 1200000 },
      { name: 'Kisumu', latitude: -0.0917, longitude: 34.7680, population: 610000 },
      { name: 'Nakuru', latitude: -0.3031, longitude: 36.0800, population: 570000 },
      { name: 'Eldoret', latitude: 0.5143, longitude: 35.2699, population: 475000 }
    ]
  },
  ethiopia: {
    name: 'Ethiopia',
    code: 'ET',
    continent: 'Africa',
    currency: 'ETB',
    phoneCode: '+251',
    majorCities: [
      { name: 'Addis Ababa', latitude: 9.1450, longitude: 38.7617, population: 5000000 },
      { name: 'Dire Dawa', latitude: 9.5938, longitude: 41.8661, population: 500000 },
      { name: 'Mek\'ele', latitude: 13.4967, longitude: 39.4753, population: 400000 },
      { name: 'Gondar', latitude: 12.6089, longitude: 37.4671, population: 350000 },
      { name: 'Awassa', latitude: 7.0431, longitude: 38.4731, population: 300000 }
    ]
  },
  uganda: {
    name: 'Uganda',
    code: 'UG',
    continent: 'Africa',
    currency: 'UGX',
    phoneCode: '+256',
    majorCities: [
      { name: 'Kampala', latitude: 0.3476, longitude: 32.5825, population: 2000000 },
      { name: 'Gulu', latitude: 2.7796, longitude: 32.2990, population: 200000 },
      { name: 'Lira', latitude: 2.2391, longitude: 32.8998, population: 150000 },
      { name: 'Mbarara', latitude: -0.6063, longitude: 30.6474, population: 200000 }
    ]
  },
  tanzania: {
    name: 'Tanzania',
    code: 'TZ',
    continent: 'Africa',
    currency: 'TZS',
    phoneCode: '+255',
    majorCities: [
      { name: 'Dar es Salaam', latitude: -6.7924, longitude: 39.2083, population: 6000000 },
      { name: 'Dodoma', latitude: -6.1722, longitude: 35.7397, population: 765000 },
      { name: 'Mwanza', latitude: -2.5164, longitude: 32.9175, population: 1200000 },
      { name: 'Arusha', latitude: -3.3869, longitude: 36.6830, population: 617000 },
      { name: 'Mbeya', latitude: -8.9094, longitude: 33.4606, population: 385000 }
    ]
  },
  // Southern Africa
  southAfrica: {
    name: 'South Africa',
    code: 'ZA',
    continent: 'Africa',
    currency: 'ZAR',
    phoneCode: '+27',
    majorCities: [
      { name: 'Johannesburg', state: 'Gauteng', latitude: -26.2041, longitude: 28.0473, population: 5000000 },
      { name: 'Cape Town', state: 'Western Cape', latitude: -33.9249, longitude: 18.4241, population: 4500000 },
      { name: 'Durban', state: 'KwaZulu-Natal', latitude: -29.8587, longitude: 31.0218, population: 3500000 },
      { name: 'Pretoria', state: 'Gauteng', latitude: -25.7479, longitude: 28.2293, population: 2500000 },
      { name: 'Port Elizabeth', state: 'Eastern Cape', latitude: -33.9608, longitude: 25.6022, population: 1300000 },
      { name: 'Bloemfontein', state: 'Free State', latitude: -29.0852, longitude: 26.1596, population: 520000 }
    ]
  },
  zimbabwe: {
    name: 'Zimbabwe',
    code: 'ZW',
    continent: 'Africa',
    currency: 'USD',
    phoneCode: '+263',
    majorCities: [
      { name: 'Harare', latitude: -17.8292, longitude: 31.0522, population: 2100000 },
      { name: 'Bulawayo', latitude: -20.1594, longitude: 28.5906, population: 1200000 },
      { name: 'Chitungwiza', latitude: -18.0130, longitude: 31.0767, population: 400000 },
      { name: 'Mutare', latitude: -18.9707, longitude: 32.6518, population: 280000 }
    ]
  },
  // North Africa
  egypt: {
    name: 'Egypt',
    code: 'EG',
    continent: 'Africa',
    currency: 'EGP',
    phoneCode: '+20',
    majorCities: [
      { name: 'Cairo', latitude: 30.0444, longitude: 31.2357, population: 10000000 },
      { name: 'Alexandria', latitude: 31.2001, longitude: 29.9187, population: 5000000 },
      { name: 'Giza', latitude: 30.0131, longitude: 31.2089, population: 4000000 },
      { name: 'Shubra El Kheima', latitude: 30.1287, longitude: 31.2442, population: 1200000 },
      { name: 'Port Said', latitude: 31.2653, longitude: 32.3019, population: 750000 }
    ]
  },
  morocco: {
    name: 'Morocco',
    code: 'MA',
    continent: 'Africa',
    currency: 'MAD',
    phoneCode: '+212',
    majorCities: [
      { name: 'Casablanca', latitude: 33.5731, longitude: -7.5898, population: 3500000 },
      { name: 'Rabat', latitude: 34.0209, longitude: -6.8416, population: 1800000 },
      { name: 'Fez', latitude: 34.0181, longitude: -5.0078, population: 1200000 },
      { name: 'Marrakech', latitude: 31.6295, longitude: -7.9811, population: 1000000 },
      { name: 'Agadir', latitude: 30.4278, longitude: -9.5981, population: 700000 }
    ]
  },
  // Other popular countries for reference
  unitedStates: {
    name: 'United States',
    code: 'US',
    continent: 'North America',
    currency: 'USD',
    phoneCode: '+1',
    majorCities: [
      // Major Metropolitan Areas
      { name: 'New York', state: 'New York', latitude: 40.7128, longitude: -74.0060, population: 8400000, zipCode: '10001' },
      { name: 'Los Angeles', state: 'California', latitude: 34.0522, longitude: -118.2437, population: 4000000, zipCode: '90001' },
      { name: 'Chicago', state: 'Illinois', latitude: 41.8781, longitude: -87.6298, population: 2700000, zipCode: '60601' },
      { name: 'Houston', state: 'Texas', latitude: 29.7604, longitude: -95.3698, population: 2300000, zipCode: '77001' },
      { name: 'Phoenix', state: 'Arizona', latitude: 33.4484, longitude: -112.0740, population: 1700000, zipCode: '85001' },
      { name: 'Philadelphia', state: 'Pennsylvania', latitude: 39.9526, longitude: -75.1652, population: 1600000, zipCode: '19101' },
      { name: 'San Antonio', state: 'Texas', latitude: 29.4241, longitude: -98.4936, population: 1500000, zipCode: '78201' },
      { name: 'San Diego', state: 'California', latitude: 32.7157, longitude: -117.1611, population: 1400000, zipCode: '92101' },
      { name: 'Dallas', state: 'Texas', latitude: 32.7767, longitude: -96.7970, population: 1340000, zipCode: '75201' },
      { name: 'San Jose', state: 'California', latitude: 37.3382, longitude: -121.8863, population: 1030000, zipCode: '95101' },
      
      // Additional Major Cities
      { name: 'Austin', state: 'Texas', latitude: 30.2672, longitude: -97.7431, population: 970000, zipCode: '73301' },
      { name: 'Jacksonville', state: 'Florida', latitude: 30.3322, longitude: -81.6557, population: 920000, zipCode: '32099' },
      { name: 'Fort Worth', state: 'Texas', latitude: 32.7555, longitude: -97.3308, population: 910000, zipCode: '76101' },
      { name: 'Columbus', state: 'Ohio', latitude: 39.9612, longitude: -82.9988, population: 900000, zipCode: '43085' },
      { name: 'Charlotte', state: 'North Carolina', latitude: 35.2271, longitude: -80.8431, population: 880000, zipCode: '28201' },
      { name: 'San Francisco', state: 'California', latitude: 37.7749, longitude: -122.4194, population: 870000, zipCode: '94102' },
      { name: 'Indianapolis', state: 'Indiana', latitude: 39.7684, longitude: -86.1581, population: 860000, zipCode: '46201' },
      { name: 'Seattle', state: 'Washington', latitude: 47.6062, longitude: -122.3321, population: 750000, zipCode: '98101' },
      { name: 'Denver', state: 'Colorado', latitude: 39.7392, longitude: -104.9903, population: 710000, zipCode: '80201' },
      { name: 'Washington', state: 'District of Columbia', latitude: 38.9072, longitude: -77.0369, population: 700000, zipCode: '20001' },
      
      // State Capitals and Important Cities
      { name: 'Boston', state: 'Massachusetts', latitude: 42.3601, longitude: -71.0589, population: 690000, zipCode: '02101' },
      { name: 'El Paso', state: 'Texas', latitude: 31.7619, longitude: -106.4850, population: 680000, zipCode: '79901' },
      { name: 'Detroit', state: 'Michigan', latitude: 42.3314, longitude: -83.0458, population: 670000, zipCode: '48201' },
      { name: 'Nashville', state: 'Tennessee', latitude: 36.1627, longitude: -86.7816, population: 670000, zipCode: '37201' },
      { name: 'Portland', state: 'Oregon', latitude: 45.5152, longitude: -122.6784, population: 650000, zipCode: '97201' },
      { name: 'Oklahoma City', state: 'Oklahoma', latitude: 35.4676, longitude: -97.5164, population: 650000, zipCode: '73101' },
      { name: 'Las Vegas', state: 'Nevada', latitude: 36.1699, longitude: -115.1398, population: 640000, zipCode: '89101' },
      { name: 'Louisville', state: 'Kentucky', latitude: 38.2527, longitude: -85.7585, population: 620000, zipCode: '40201' },
      { name: 'Baltimore', state: 'Maryland', latitude: 39.2904, longitude: -76.6122, population: 600000, zipCode: '21201' },
      { name: 'Milwaukee', state: 'Wisconsin', latitude: 43.0389, longitude: -87.9065, population: 590000, zipCode: '53201' },
      { name: 'Albuquerque', state: 'New Mexico', latitude: 35.0844, longitude: -106.6504, population: 560000, zipCode: '87101' },
      { name: 'Tucson', state: 'Arizona', latitude: 32.2226, longitude: -110.9747, population: 550000, zipCode: '85701' },
      { name: 'Fresno', state: 'California', latitude: 36.7378, longitude: -119.7871, population: 540000, zipCode: '93650' },
      { name: 'Sacramento', state: 'California', latitude: 38.5816, longitude: -121.4944, population: 520000, zipCode: '94203' },
      { name: 'Kansas City', state: 'Missouri', latitude: 39.0997, longitude: -94.5786, population: 490000, zipCode: '64101' },
      { name: 'Mesa', state: 'Arizona', latitude: 33.4152, longitude: -111.8315, population: 510000, zipCode: '85201' },
      { name: 'Atlanta', state: 'Georgia', latitude: 33.7490, longitude: -84.3880, population: 500000, zipCode: '30301' },
      { name: 'Colorado Springs', state: 'Colorado', latitude: 38.8339, longitude: -104.8214, population: 480000, zipCode: '80901' },
      { name: 'Raleigh', state: 'North Carolina', latitude: 35.7796, longitude: -78.6382, population: 470000, zipCode: '27601' },
      { name: 'Omaha', state: 'Nebraska', latitude: 41.2565, longitude: -95.9345, population: 470000, zipCode: '68101' },
      { name: 'Miami', state: 'Florida', latitude: 25.7617, longitude: -80.1918, population: 460000, zipCode: '33101' },
      { name: 'Long Beach', state: 'California', latitude: 33.7701, longitude: -118.1937, population: 460000, zipCode: '90801' },
      { name: 'Virginia Beach', state: 'Virginia', latitude: 36.8529, longitude: -75.9780, population: 450000, zipCode: '23451' },
      { name: 'Oakland', state: 'California', latitude: 37.8044, longitude: -122.2711, population: 430000, zipCode: '94601' },
      { name: 'Minneapolis', state: 'Minnesota', latitude: 44.9778, longitude: -93.2650, population: 430000, zipCode: '55401' },
      { name: 'Tulsa', state: 'Oklahoma', latitude: 36.1540, longitude: -95.9928, population: 410000, zipCode: '74101' },
      { name: 'Tampa', state: 'Florida', latitude: 27.9506, longitude: -82.4572, population: 390000, zipCode: '33601' },
      { name: 'Arlington', state: 'Texas', latitude: 32.7357, longitude: -97.1081, population: 390000, zipCode: '76001' },
      { name: 'New Orleans', state: 'Louisiana', latitude: 29.9511, longitude: -90.0715, population: 390000, zipCode: '70112' }
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
      { name: 'Kingston upon Hull', state: 'England', latitude: 53.7676, longitude: -0.3274, population: 260000, zipCode: 'HU1 1AA' },
      { name: 'Newcastle upon Tyne', state: 'England', latitude: 54.9783, longitude: -1.6174, population: 300000, zipCode: 'NE1 1AA' },
      { name: 'Stoke-on-Trent', state: 'England', latitude: 53.0027, longitude: -2.1794, population: 260000, zipCode: 'ST1 1AA' },
      { name: 'Southampton', state: 'England', latitude: 50.9097, longitude: -1.4044, population: 250000, zipCode: 'SO14 2AA' },
      { name: 'Derby', state: 'England', latitude: 52.9225, longitude: -1.4746, population: 260000, zipCode: 'DE1 1AA' },
      { name: 'Portsmouth', state: 'England', latitude: 50.8198, longitude: -1.0880, population: 240000, zipCode: 'PO1 1AA' },
      { name: 'Plymouth', state: 'England', latitude: 50.3755, longitude: -4.1427, population: 260000, zipCode: 'PL1 1AA' },
      { name: 'Wolverhampton', state: 'England', latitude: 52.5869, longitude: -2.1282, population: 260000, zipCode: 'WV1 1AA' },
      { name: 'Oxford', state: 'England', latitude: 51.7520, longitude: -1.2577, population: 150000, zipCode: 'OX1 1AA' },
      { name: 'Cambridge', state: 'England', latitude: 52.2053, longitude: 0.1218, population: 130000, zipCode: 'CB1 1AA' },
      { name: 'Brighton', state: 'England', latitude: 50.8225, longitude: -0.1372, population: 290000, zipCode: 'BN1 1AA' },
      { name: 'Reading', state: 'England', latitude: 51.4543, longitude: -0.9781, population: 160000, zipCode: 'RG1 1AA' },
      { name: 'Northampton', state: 'England', latitude: 52.2405, longitude: -0.9027, population: 225000, zipCode: 'NN1 1AA' },
      { name: 'Norwich', state: 'England', latitude: 52.6309, longitude: 1.2974, population: 140000, zipCode: 'NR1 1AA' },
      { name: 'York', state: 'England', latitude: 53.9590, longitude: -1.0815, population: 210000, zipCode: 'YO1 1AA' },
      
      // Scotland
      { name: 'Glasgow', state: 'Scotland', latitude: 55.8642, longitude: -4.2518, population: 630000, zipCode: 'G1 1AA' },
      { name: 'Edinburgh', state: 'Scotland', latitude: 55.9533, longitude: -3.1883, population: 520000, zipCode: 'EH1 1AA' },
      { name: 'Aberdeen', state: 'Scotland', latitude: 57.1497, longitude: -2.0943, population: 230000, zipCode: 'AB10 1AA' },
      { name: 'Dundee', state: 'Scotland', latitude: 56.4620, longitude: -2.9707, population: 150000, zipCode: 'DD1 1AA' },
      { name: 'Stirling', state: 'Scotland', latitude: 56.1165, longitude: -3.9369, population: 37000, zipCode: 'FK8 1AA' },
      { name: 'Perth', state: 'Scotland', latitude: 56.3960, longitude: -3.4375, population: 47000, zipCode: 'PH1 1AA' },
      
      // Wales
      { name: 'Cardiff', state: 'Wales', latitude: 51.4816, longitude: -3.1791, population: 360000, zipCode: 'CF10 1AA' },
      { name: 'Swansea', state: 'Wales', latitude: 51.6214, longitude: -3.9436, population: 240000, zipCode: 'SA1 1AA' },
      { name: 'Newport', state: 'Wales', latitude: 51.5842, longitude: -2.9977, population: 150000, zipCode: 'NP19 1AA' },
      { name: 'Wrexham', state: 'Wales', latitude: 53.0478, longitude: -2.9916, population: 65000, zipCode: 'LL11 1AA' },
      
      // Northern Ireland
      { name: 'Belfast', state: 'Northern Ireland', latitude: 54.5973, longitude: -5.9301, population: 340000, zipCode: 'BT1 1AA' },
      { name: 'Derry', state: 'Northern Ireland', latitude: 54.9981, longitude: -7.3086, population: 110000, zipCode: 'BT48 6AA' },
      { name: 'Lisburn', state: 'Northern Ireland', latitude: 54.5162, longitude: -6.0580, population: 75000, zipCode: 'BT28 1AA' },
      { name: 'Newtownabbey', state: 'Northern Ireland', latitude: 54.6689, longitude: -5.9075, population: 65000, zipCode: 'BT36 4AA' }
    ]
  },
  
  // Additional European Countries
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
      { name: 'Essen', state: 'North Rhine-Westphalia', latitude: 51.4556, longitude: 7.0116, population: 580000, zipCode: '45127' }
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
      { name: 'Lille', state: 'Hauts-de-France', latitude: 50.6292, longitude: 3.0573, population: 230000, zipCode: '59000' }
    ]
  },
  
  spain: {
    name: 'Spain',
    code: 'ES',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+34',
    majorCities: [
      { name: 'Madrid', state: 'Community of Madrid', latitude: 40.4168, longitude: -3.7038, population: 3300000, zipCode: '28001' },
      { name: 'Barcelona', state: 'Catalonia', latitude: 41.3851, longitude: 2.1734, population: 1600000, zipCode: '08001' },
      { name: 'Valencia', state: 'Valencian Community', latitude: 39.4699, longitude: -0.3763, population: 800000, zipCode: '46001' },
      { name: 'Seville', state: 'Andalusia', latitude: 37.3891, longitude: -5.9845, population: 690000, zipCode: '41001' },
      { name: 'Zaragoza', state: 'Aragon', latitude: 41.6488, longitude: -0.8891, population: 670000, zipCode: '50001' },
      { name: 'Málaga', state: 'Andalusia', latitude: 36.7213, longitude: -4.4214, population: 580000, zipCode: '29001' },
      { name: 'Murcia', state: 'Region of Murcia', latitude: 37.9922, longitude: -1.1307, population: 460000, zipCode: '30001' },
      { name: 'Palma', state: 'Balearic Islands', latitude: 39.5696, longitude: 2.6502, population: 420000, zipCode: '07001' },
      { name: 'Las Palmas', state: 'Canary Islands', latitude: 28.1248, longitude: -15.4300, population: 380000, zipCode: '35001' },
      { name: 'Bilbao', state: 'Basque Country', latitude: 43.2627, longitude: -2.9253, population: 350000, zipCode: '48001' }
    ]
  },
  
  italy: {
    name: 'Italy',
    code: 'IT',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+39',
    majorCities: [
      { name: 'Rome', state: 'Lazio', latitude: 41.9028, longitude: 12.4964, population: 2800000, zipCode: '00118' },
      { name: 'Milan', state: 'Lombardy', latitude: 45.4642, longitude: 9.1900, population: 1400000, zipCode: '20121' },
      { name: 'Naples', state: 'Campania', latitude: 40.8518, longitude: 14.2681, population: 970000, zipCode: '80121' },
      { name: 'Turin', state: 'Piedmont', latitude: 45.0703, longitude: 7.6869, population: 870000, zipCode: '10121' },
      { name: 'Palermo', state: 'Sicily', latitude: 38.1157, longitude: 13.3615, population: 670000, zipCode: '90121' },
      { name: 'Genoa', state: 'Liguria', latitude: 44.4056, longitude: 8.9463, population: 580000, zipCode: '16121' },
      { name: 'Bologna', state: 'Emilia-Romagna', latitude: 44.4949, longitude: 11.3426, population: 390000, zipCode: '40121' },
      { name: 'Florence', state: 'Tuscany', latitude: 43.7696, longitude: 11.2558, population: 380000, zipCode: '50121' },
      { name: 'Bari', state: 'Apulia', latitude: 41.1171, longitude: 16.8719, population: 320000, zipCode: '70121' },
      { name: 'Catania', state: 'Sicily', latitude: 37.5079, longitude: 15.0830, population: 310000, zipCode: '95121' }
    ]
  },
  
  netherlands: {
    name: 'Netherlands',
    code: 'NL',
    continent: 'Europe',
    currency: 'EUR',
    phoneCode: '+31',
    majorCities: [
      { name: 'Amsterdam', state: 'North Holland', latitude: 52.3676, longitude: 4.9041, population: 870000, zipCode: '1012' },
      { name: 'Rotterdam', state: 'South Holland', latitude: 51.9244, longitude: 4.4777, population: 650000, zipCode: '3011' },
      { name: 'The Hague', state: 'South Holland', latitude: 52.0705, longitude: 4.3007, population: 550000, zipCode: '2511' },
      { name: 'Utrecht', state: 'Utrecht', latitude: 52.0907, longitude: 5.1214, population: 360000, zipCode: '3511' },
      { name: 'Eindhoven', state: 'North Brabant', latitude: 51.4416, longitude: 5.4697, population: 240000, zipCode: '5611' },
      { name: 'Tilburg', state: 'North Brabant', latitude: 51.5555, longitude: 5.0913, population: 220000, zipCode: '5011' },
      { name: 'Groningen', state: 'Groningen', latitude: 53.2194, longitude: 6.5665, population: 200000, zipCode: '9711' },
      { name: 'Almere', state: 'Flevoland', latitude: 52.3508, longitude: 5.2647, population: 210000, zipCode: '1315' },
      { name: 'Breda', state: 'North Brabant', latitude: 51.5719, longitude: 4.7683, population: 180000, zipCode: '4811' },
      { name: 'Nijmegen', state: 'Gelderland', latitude: 51.8426, longitude: 5.8518, population: 180000, zipCode: '6511' }
    ]
  },

  // Additional West African Countries
  benin: {
    name: 'Benin',
    code: 'BJ',
    continent: 'Africa',
    currency: 'XOF',
    phoneCode: '+229',
    majorCities: [
      { name: 'Cotonou', latitude: 6.3654, longitude: 2.4183, population: 680000 },
      { name: 'Porto-Novo', latitude: 6.4969, longitude: 2.6289, population: 264000 },
      { name: 'Parakou', latitude: 9.3333, longitude: 2.6167, population: 255000 },
      { name: 'Djougou', latitude: 9.7083, longitude: 1.6667, population: 95000 },
      { name: 'Bohicon', latitude: 7.1833, longitude: 2.0667, population: 93000 }
    ]
  },

  togo: {
    name: 'Togo',
    code: 'TG',
    continent: 'Africa',
    currency: 'XOF',
    phoneCode: '+228',
    majorCities: [
      { name: 'Lomé', latitude: 6.1256, longitude: 1.2219, population: 1500000 },
      { name: 'Sokodé', latitude: 8.9833, longitude: 1.1333, population: 115000 },
      { name: 'Kara', latitude: 9.5511, longitude: 1.1861, population: 95000 },
      { name: 'Kpalimé', latitude: 6.9000, longitude: 0.6333, population: 75000 },
      { name: 'Atakpamé', latitude: 7.5333, longitude: 1.1167, population: 70000 }
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
      { name: 'San-Pédro', latitude: 4.7500, longitude: -6.6333, population: 260000 }
    ]
  },

  burkinaFaso: {
    name: 'Burkina Faso',
    code: 'BF',
    continent: 'Africa',
    currency: 'XOF',
    phoneCode: '+226',
    majorCities: [
      { name: 'Ouagadougou', latitude: 12.3714, longitude: -1.5197, population: 2400000 },
      { name: 'Bobo-Dioulasso', latitude: 11.1774, longitude: -4.2980, population: 900000 },
      { name: 'Koudougou', latitude: 12.2520, longitude: -2.3620, population: 115000 },
      { name: 'Banfora', latitude: 10.6333, longitude: -4.7667, population: 75000 },
      { name: 'Ouahigouya', latitude: 13.5833, longitude: -2.4167, population: 75000 }
    ]
  },

  mali: {
    name: 'Mali',
    code: 'ML',
    continent: 'Africa',
    currency: 'XOF',
    phoneCode: '+223',
    majorCities: [
      { name: 'Bamako', latitude: 12.6392, longitude: -8.0029, population: 2400000 },
      { name: 'Sikasso', latitude: 11.3167, longitude: -5.6667, population: 225000 },
      { name: 'Koutiala', latitude: 12.3910, longitude: -5.4640, population: 140000 },
      { name: 'Kayes', latitude: 14.4500, longitude: -11.4333, population: 130000 },
      { name: 'Ségou', latitude: 13.4317, longitude: -6.2158, population: 130000 }
    ]
  },

  niger: {
    name: 'Niger',
    code: 'NE',
    continent: 'Africa',
    currency: 'XOF',
    phoneCode: '+227',
    majorCities: [
      { name: 'Niamey', latitude: 13.5127, longitude: 2.1128, population: 1300000 },
      { name: 'Zinder', latitude: 13.8069, longitude: 8.9881, population: 235000 },
      { name: 'Maradi', latitude: 13.5000, longitude: 7.1000, population: 210000 },
      { name: 'Agadez', latitude: 16.9735, longitude: 7.9861, population: 125000 },
      { name: 'Tahoua', latitude: 14.8900, longitude: 5.2700, population: 120000 }
    ]
  },

  guinea: {
    name: 'Guinea',
    code: 'GN',
    continent: 'Africa',
    currency: 'GNF',
    phoneCode: '+224',
    majorCities: [
      { name: 'Conakry', latitude: 9.6412, longitude: -13.5784, population: 1900000 },
      { name: 'Nzérékoré', latitude: 7.7564, longitude: -8.8179, population: 185000 },
      { name: 'Kankan', latitude: 10.3850, longitude: -9.3061, population: 190000 },
      { name: 'Kindia', latitude: 10.0571, longitude: -12.8656, population: 160000 },
      { name: 'Labé', latitude: 11.3167, longitude: -12.3000, population: 200000 }
    ]
  },

  sierraLeone: {
    name: 'Sierra Leone',
    code: 'SL',
    continent: 'Africa',
    currency: 'SLL',
    phoneCode: '+232',
    majorCities: [
      { name: 'Freetown', latitude: 8.4657, longitude: -13.2317, population: 1200000 },
      { name: 'Bo', latitude: 7.9647, longitude: -11.7383, population: 175000 },
      { name: 'Kenema', latitude: 7.8767, longitude: -11.1900, population: 200000 },
      { name: 'Makeni', latitude: 8.8856, longitude: -12.0453, population: 125000 },
      { name: 'Koidu', latitude: 8.6439, longitude: -10.9708, population: 90000 }
    ]
  },

  liberia: {
    name: 'Liberia',
    code: 'LR',
    continent: 'Africa',
    currency: 'LRD',
    phoneCode: '+231',
    majorCities: [
      { name: 'Monrovia', latitude: 6.3156, longitude: -10.8074, population: 1400000 },
      { name: 'Gbarnga', latitude: 6.9986, longitude: -9.4722, population: 57000 },
      { name: 'Buchanan', latitude: 5.8808, longitude: -10.0467, population: 50000 },
      { name: 'Kakata', latitude: 6.5300, longitude: -10.3517, population: 35000 },
      { name: 'Zwedru', latitude: 6.0700, longitude: -8.1317, population: 25000 }
    ]
  },

  gambia: {
    name: 'The Gambia',
    code: 'GM',
    continent: 'Africa',
    currency: 'GMD',
    phoneCode: '+220',
    majorCities: [
      { name: 'Banjul', latitude: 13.4549, longitude: -16.5790, population: 35000 },
      { name: 'Serekunda', latitude: 13.4333, longitude: -16.6833, population: 345000 },
      { name: 'Brikama', latitude: 13.2708, longitude: -16.6500, population: 100000 },
      { name: 'Bakau', latitude: 13.4789, longitude: -16.6817, population: 50000 },
      { name: 'Farafenni', latitude: 13.5667, longitude: -15.6000, population: 30000 }
    ]
  },

  mauritania: {
    name: 'Mauritania',
    code: 'MR',
    continent: 'Africa',
    currency: 'MRU',
    phoneCode: '+222',
    majorCities: [
      { name: 'Nouakchott', latitude: 18.0735, longitude: -15.9582, population: 1200000 },
      { name: 'Nouadhibou', latitude: 20.9000, longitude: -17.0333, population: 120000 },
      { name: 'Rosso', latitude: 16.5133, longitude: -15.8069, population: 50000 },
      { name: 'Kaédi', latitude: 16.1500, longitude: -13.5000, population: 55000 },
      { name: 'Kiffa', latitude: 16.6167, longitude: -11.4000, population: 40000 }
    ]
  },

  // Central Africa
  cameroon: {
    name: 'Cameroon',
    code: 'CM',
    continent: 'Africa',
    currency: 'XAF',
    phoneCode: '+237',
    majorCities: [
      { name: 'Douala', latitude: 4.0511, longitude: 9.7679, population: 2800000 },
      { name: 'Yaoundé', latitude: 3.8480, longitude: 11.5021, population: 2900000 },
      { name: 'Bamenda', latitude: 5.9597, longitude: 10.1450, population: 500000 },
      { name: 'Bafoussam', latitude: 5.4769, longitude: 10.4178, population: 350000 },
      { name: 'Garoua', latitude: 9.3000, longitude: 13.4000, population: 350000 }
    ]
  },

  chad: {
    name: 'Chad',
    code: 'TD',
    continent: 'Africa',
    currency: 'XAF',
    phoneCode: '+235',
    majorCities: [
      { name: 'N\'Djamena', latitude: 12.1348, longitude: 15.0557, population: 1400000 },
      { name: 'Moundou', latitude: 8.5667, longitude: 16.0833, population: 140000 },
      { name: 'Sarh', latitude: 9.1500, longitude: 18.3833, population: 135000 },
      { name: 'Abéché', latitude: 13.8292, longitude: 20.8322, population: 75000 },
      { name: 'Kélo', latitude: 9.3086, longitude: 15.8069, population: 60000 }
    ]
  },

  centralAfricanRepublic: {
    name: 'Central African Republic',
    code: 'CF',
    continent: 'Africa',
    currency: 'XAF',
    phoneCode: '+236',
    majorCities: [
      { name: 'Bangui', latitude: 4.3947, longitude: 18.5582, population: 890000 },
      { name: 'Bimbo', latitude: 4.2536, longitude: 18.5189, population: 130000 },
      { name: 'Berbérati', latitude: 4.2617, longitude: 15.7925, population: 76000 },
      { name: 'Carnot', latitude: 4.9428, longitude: 15.8767, population: 45000 },
      { name: 'Bambari', latitude: 5.7678, longitude: 20.6753, population: 42000 }
    ]
  },

  congo: {
    name: 'Republic of the Congo',
    code: 'CG',
    continent: 'Africa',
    currency: 'XAF',
    phoneCode: '+242',
    majorCities: [
      { name: 'Brazzaville', latitude: 4.2634, longitude: 15.2429, population: 2100000 },
      { name: 'Pointe-Noire', latitude: 4.7958, longitude: 11.8638, population: 1200000 },
      { name: 'Dolisie', latitude: 4.2000, longitude: 12.6667, population: 110000 },
      { name: 'Nkayi', latitude: 4.1833, longitude: 13.2833, population: 75000 },
      { name: 'Impfondo', latitude: 1.6167, longitude: 18.0667, population: 30000 }
    ]
  },

  drCongo: {
    name: 'Democratic Republic of the Congo',
    code: 'CD',
    continent: 'Africa',
    currency: 'CDF',
    phoneCode: '+243',
    majorCities: [
      { name: 'Kinshasa', latitude: 4.4419, longitude: 15.2663, population: 14000000 },
      { name: 'Lubumbashi', latitude: 11.6667, longitude: 27.4667, population: 2500000 },
      { name: 'Mbuji-Mayi', latitude: 6.1500, longitude: 23.6000, population: 2100000 },
      { name: 'Kananga', latitude: 5.8833, longitude: 22.4167, population: 1200000 },
      { name: 'Kisangani', latitude: 0.5150, longitude: 25.1900, population: 1300000 }
    ]
  },

  gabon: {
    name: 'Gabon',
    code: 'GA',
    continent: 'Africa',
    currency: 'XAF',
    phoneCode: '+241',
    majorCities: [
      { name: 'Libreville', latitude: 0.4162, longitude: 9.4673, population: 800000 },
      { name: 'Port-Gentil', latitude: 0.7193, longitude: 8.7815, population: 140000 },
      { name: 'Franceville', latitude: 1.6333, longitude: 13.5833, population: 110000 },
      { name: 'Oyem', latitude: 1.5989, longitude: 11.5793, population: 65000 },
      { name: 'Moanda', latitude: 1.5667, longitude: 13.2000, population: 40000 }
    ]
  },

  equatorialGuinea: {
    name: 'Equatorial Guinea',
    code: 'GQ',
    continent: 'Africa',
    currency: 'XAF',
    phoneCode: '+240',
    majorCities: [
      { name: 'Malabo', latitude: 3.7504, longitude: 8.7371, population: 300000 },
      { name: 'Bata', latitude: 1.8639, longitude: 9.7658, population: 250000 },
      { name: 'Ebebiyin', latitude: 2.1500, longitude: 11.3333, population: 25000 },
      { name: 'Aconibe', latitude: 1.2967, longitude: 10.9364, population: 15000 },
      { name: 'Añisoc', latitude: 1.8667, longitude: 10.7667, population: 13000 }
    ]
  },

  // East Africa
  rwanda: {
    name: 'Rwanda',
    code: 'RW',
    continent: 'Africa',
    currency: 'RWF',
    phoneCode: '+250',
    majorCities: [
      { name: 'Kigali', latitude: 1.9536, longitude: 30.0606, population: 1200000 },
      { name: 'Butare', latitude: 2.5965, longitude: 29.7390, population: 90000 },
      { name: 'Gitarama', latitude: 2.0744, longitude: 29.7564, population: 90000 },
      { name: 'Ruhengeri', latitude: 1.5000, longitude: 29.6333, population: 85000 },
      { name: 'Gisenyi', latitude: 1.7000, longitude: 29.2667, population: 85000 }
    ]
  },

  burundi: {
    name: 'Burundi',
    code: 'BI',
    continent: 'Africa',
    currency: 'BIF',
    phoneCode: '+257',
    majorCities: [
      { name: 'Gitega', latitude: 3.4271, longitude: 29.9246, population: 135000 },
      { name: 'Bujumbura', latitude: 3.3614, longitude: 29.3599, population: 900000 },
      { name: 'Muyinga', latitude: 2.8447, longitude: 30.3419, population: 72000 },
      { name: 'Ngozi', latitude: 2.9081, longitude: 29.8306, population: 50000 },
      { name: 'Ruyigi', latitude: 3.4764, longitude: 30.2506, population: 40000 }
    ]
  },

  somalia: {
    name: 'Somalia',
    code: 'SO',
    continent: 'Africa',
    currency: 'SOS',
    phoneCode: '+252',
    majorCities: [
      { name: 'Mogadishu', latitude: 2.0469, longitude: 45.3182, population: 2400000 },
      { name: 'Hargeisa', latitude: 9.5600, longitude: 44.0650, population: 1200000 },
      { name: 'Bosaso', latitude: 11.2842, longitude: 49.1816, population: 700000 },
      { name: 'Kismayo', latitude: 0.3582, longitude: 42.5454, population: 500000 },
      { name: 'Merca', latitude: 1.7151, longitude: 44.7703, population: 230000 }
    ]
  },

  djibouti: {
    name: 'Djibouti',
    code: 'DJ',
    continent: 'Africa',
    currency: 'DJF',
    phoneCode: '+253',
    majorCities: [
      { name: 'Djibouti City', latitude: 11.8251, longitude: 42.5903, population: 600000 },
      { name: 'Ali Sabieh', latitude: 11.1583, longitude: 42.7125, population: 40000 },
      { name: 'Tadjourah', latitude: 11.7856, longitude: 42.8828, population: 25000 },
      { name: 'Obock', latitude: 11.9667, longitude: 43.2900, population: 18000 },
      { name: 'Dikhil', latitude: 11.1050, longitude: 42.3717, population: 15000 }
    ]
  },

  eritrea: {
    name: 'Eritrea',
    code: 'ER',
    continent: 'Africa',
    currency: 'ERN',
    phoneCode: '+291',
    majorCities: [
      { name: 'Asmara', latitude: 15.3229, longitude: 38.9251, population: 900000 },
      { name: 'Keren', latitude: 15.7806, longitude: 38.4511, population: 120000 },
      { name: 'Massawa', latitude: 15.6089, longitude: 39.4521, population: 50000 },
      { name: 'Assab', latitude: 13.0092, longitude: 42.7389, population: 55000 },
      { name: 'Mendefera', latitude: 14.8872, longitude: 38.8153, population: 18000 }
    ]
  },

  // Southern Africa
  angola: {
    name: 'Angola',
    code: 'AO',
    continent: 'Africa',
    currency: 'AOA',
    phoneCode: '+244',
    majorCities: [
      { name: 'Luanda', latitude: 8.8383, longitude: 13.2344, population: 8300000 },
      { name: 'Huambo', latitude: 12.7761, longitude: 15.7361, population: 1500000 },
      { name: 'Lobito', latitude: 12.3644, longitude: 13.5355, population: 900000 },
      { name: 'Benguela', latitude: 12.5764, longitude: 13.4055, population: 560000 },
      { name: 'Lubango', latitude: 14.9172, longitude: 13.4925, population: 600000 }
    ]
  },

  namibia: {
    name: 'Namibia',
    code: 'NA',
    continent: 'Africa',
    currency: 'NAD',
    phoneCode: '+264',
    majorCities: [
      { name: 'Windhoek', latitude: 22.5597, longitude: 17.0832, population: 430000 },
      { name: 'Rundu', latitude: 17.9333, longitude: 19.7667, population: 80000 },
      { name: 'Walvis Bay', latitude: 22.9500, longitude: 14.5000, population: 100000 },
      { name: 'Oshakati', latitude: 17.7833, longitude: 15.7000, population: 38000 },
      { name: 'Swakopmund', latitude: 22.6800, longitude: 14.5267, population: 45000 }
    ]
  },

  botswana: {
    name: 'Botswana',
    code: 'BW',
    continent: 'Africa',
    currency: 'BWP',
    phoneCode: '+267',
    majorCities: [
      { name: 'Gaborone', latitude: 24.6282, longitude: 25.9231, population: 230000 },
      { name: 'Francistown', latitude: 21.1699, longitude: 27.5084, population: 100000 },
      { name: 'Molepolole', latitude: 24.4069, longitude: 25.4953, population: 67000 },
      { name: 'Maun', latitude: 19.9945, longitude: 23.4163, population: 60000 },
      { name: 'Serowe', latitude: 22.3833, longitude: 26.7083, population: 50000 }
    ]
  },

  zambia: {
    name: 'Zambia',
    code: 'ZM',
    continent: 'Africa',
    currency: 'ZMW',
    phoneCode: '+260',
    majorCities: [
      { name: 'Lusaka', latitude: 15.3875, longitude: 28.3228, population: 2500000 },
      { name: 'Kitwe', latitude: 12.8024, longitude: 28.2132, population: 520000 },
      { name: 'Ndola', latitude: 12.9687, longitude: 28.6366, population: 455000 },
      { name: 'Kabwe', latitude: 14.4469, longitude: 28.4464, population: 220000 },
      { name: 'Chingola', latitude: 12.5289, longitude: 27.8631, population: 185000 }
    ]
  },

  malawi: {
    name: 'Malawi',
    code: 'MW',
    continent: 'Africa',
    currency: 'MWK',
    phoneCode: '+265',
    majorCities: [
      { name: 'Lilongwe', latitude: 13.9626, longitude: 33.7741, population: 1100000 },
      { name: 'Blantyre', latitude: 15.7850, longitude: 35.0085, population: 800000 },
      { name: 'Mzuzu', latitude: 11.4650, longitude: 34.0150, population: 130000 },
      { name: 'Zomba', latitude: 15.3833, longitude: 35.3333, population: 105000 },
      { name: 'Mangochi', latitude: 14.4789, longitude: 35.2644, population: 52000 }
    ]
  },

  mozambique: {
    name: 'Mozambique',
    code: 'MZ',
    continent: 'Africa',
    currency: 'MZN',
    phoneCode: '+258',
    majorCities: [
      { name: 'Maputo', latitude: 25.9655, longitude: 32.5832, population: 1100000 },
      { name: 'Matola', latitude: 25.9622, longitude: 32.4589, population: 1000000 },
      { name: 'Nampula', latitude: 15.1165, longitude: 39.2666, population: 740000 },
      { name: 'Beira', latitude: 19.8436, longitude: 34.8389, population: 530000 },
      { name: 'Chimoio', latitude: 19.1164, longitude: 33.4833, population: 340000 }
    ]
  },

  madagascar: {
    name: 'Madagascar',
    code: 'MG',
    continent: 'Africa',
    currency: 'MGA',
    phoneCode: '+261',
    majorCities: [
      { name: 'Antananarivo', latitude: 18.8792, longitude: 47.5079, population: 1400000 },
      { name: 'Toamasina', latitude: 18.1443, longitude: 49.4022, population: 325000 },
      { name: 'Antsirabe', latitude: 19.8667, longitude: 47.0333, population: 260000 },
      { name: 'Fianarantsoa', latitude: 21.4500, longitude: 47.0833, population: 200000 },
      { name: 'Mahajanga', latitude: 15.7167, longitude: 46.3167, population: 220000 }
    ]
  },

  mauritius: {
    name: 'Mauritius',
    code: 'MU',
    continent: 'Africa',
    currency: 'MUR',
    phoneCode: '+230',
    majorCities: [
      { name: 'Port Louis', latitude: 20.1609, longitude: 57.5012, population: 150000 },
      { name: 'Beau Bassin-Rose Hill', latitude: 20.2333, longitude: 57.4667, population: 110000 },
      { name: 'Vacoas-Phoenix', latitude: 20.2981, longitude: 57.4931, population: 110000 },
      { name: 'Curepipe', latitude: 20.3167, longitude: 57.5167, population: 85000 },
      { name: 'Quatre Bornes', latitude: 20.2650, longitude: 57.4789, population: 77000 }
    ]
  },

  // North Africa (Additional)
  algeria: {
    name: 'Algeria',
    code: 'DZ',
    continent: 'Africa',
    currency: 'DZD',
    phoneCode: '+213',
    majorCities: [
      { name: 'Algiers', latitude: 36.7372, longitude: 3.0865, population: 2900000 },
      { name: 'Oran', latitude: 35.6969, longitude: 0.6331, population: 850000 },
      { name: 'Constantine', latitude: 36.3650, longitude: 6.6147, population: 450000 },
      { name: 'Annaba', latitude: 36.9000, longitude: 7.7667, population: 260000 },
      { name: 'Blida', latitude: 36.4703, longitude: 2.8277, population: 330000 }
    ]
  },

  tunisia: {
    name: 'Tunisia',
    code: 'TN',
    continent: 'Africa',
    currency: 'TND',
    phoneCode: '+216',
    majorCities: [
      { name: 'Tunis', latitude: 36.8065, longitude: 10.1815, population: 2400000 },
      { name: 'Sfax', latitude: 34.7406, longitude: 10.7603, population: 330000 },
      { name: 'Sousse', latitude: 35.8256, longitude: 10.6411, population: 270000 },
      { name: 'Kairouan', latitude: 35.6781, longitude: 10.0963, population: 186000 },
      { name: 'Bizerte', latitude: 37.2744, longitude: 9.8739, population: 140000 }
    ]
  },

  libya: {
    name: 'Libya',
    code: 'LY',
    continent: 'Africa',
    currency: 'LYD',
    phoneCode: '+218',
    majorCities: [
      { name: 'Tripoli', latitude: 32.8872, longitude: 13.1913, population: 1100000 },
      { name: 'Benghazi', latitude: 32.1167, longitude: 20.0686, population: 630000 },
      { name: 'Misrata', latitude: 32.3754, longitude: 15.0925, population: 550000 },
      { name: 'Bayda', latitude: 32.7617, longitude: 21.7556, population: 250000 },
      { name: 'Zawiya', latitude: 32.7500, longitude: 12.7333, population: 200000 }
    ]
  },

  sudan: {
    name: 'Sudan',
    code: 'SD',
    continent: 'Africa',
    currency: 'SDG',
    phoneCode: '+249',
    majorCities: [
      { name: 'Khartoum', latitude: 15.5007, longitude: 32.5599, population: 5300000 },
      { name: 'Omdurman', latitude: 15.6445, longitude: 32.4777, population: 2800000 },
      { name: 'Port Sudan', latitude: 19.6158, longitude: 37.2164, population: 490000 },
      { name: 'Kassala', latitude: 15.4500, longitude: 36.4000, population: 400000 },
      { name: 'Nyala', latitude: 12.0489, longitude: 24.8881, population: 565000 }
    ]
  },

  southSudan: {
    name: 'South Sudan',
    code: 'SS',
    continent: 'Africa',
    currency: 'SSP',
    phoneCode: '+211',
    majorCities: [
      { name: 'Juba', latitude: 4.8517, longitude: 31.5825, population: 525000 },
      { name: 'Malakal', latitude: 9.5334, longitude: 31.6597, population: 160000 },
      { name: 'Wau', latitude: 7.7028, longitude: 27.9939, population: 150000 },
      { name: 'Yei', latitude: 4.0908, longitude: 30.6781, population: 185000 },
      { name: 'Yambio', latitude: 4.5722, longitude: 28.4167, population: 105000 }
    ]
  },

  // Additional Notable Countries
  lesotho: {
    name: 'Lesotho',
    code: 'LS',
    continent: 'Africa',
    currency: 'LSL',
    phoneCode: '+266',
    majorCities: [
      { name: 'Maseru', latitude: 29.3167, longitude: 27.4833, population: 330000 },
      { name: 'Teyateyaneng', latitude: 29.1500, longitude: 27.7500, population: 75000 },
      { name: 'Mafeteng', latitude: 29.8231, longitude: 27.2372, population: 58000 },
      { name: 'Leribe', latitude: 28.8719, longitude: 28.0453, population: 47000 },
      { name: 'Maputsoe', latitude: 28.8878, longitude: 27.9006, population: 33000 }
    ]
  },

  eswatini: {
    name: 'Eswatini',
    code: 'SZ',
    continent: 'Africa',
    currency: 'SZL',
    phoneCode: '+268',
    majorCities: [
      { name: 'Mbabane', latitude: 26.3167, longitude: 31.1333, population: 95000 },
      { name: 'Manzini', latitude: 26.5000, longitude: 31.3667, population: 110000 },
      { name: 'Lobamba', latitude: 26.4500, longitude: 31.2000, population: 5800 },
      { name: 'Siteki', latitude: 26.4500, longitude: 31.9500, population: 6000 },
      { name: 'Piggs Peak', latitude: 25.9667, longitude: 31.2500, population: 5750 }
    ]
  },

  capeverde: {
    name: 'Cape Verde',
    code: 'CV',
    continent: 'Africa',
    currency: 'CVE',
    phoneCode: '+238',
    majorCities: [
      { name: 'Praia', latitude: 14.9177, longitude: 23.5092, population: 160000 },
      { name: 'Mindelo', latitude: 16.8894, longitude: 24.9819, population: 75000 },
      { name: 'Santa Maria', latitude: 16.5976, longitude: 22.9041, population: 19000 },
      { name: 'Assomada', latitude: 15.0989, longitude: 23.6836, population: 12000 },
      { name: 'Porto Novo', latitude: 17.0189, longitude: 25.0656, population: 9500 }
    ]
  },

  saotomePrincipe: {
    name: 'São Tomé and Príncipe',
    code: 'ST',
    continent: 'Africa',
    currency: 'STN',
    phoneCode: '+239',
    majorCities: [
      { name: 'São Tomé', latitude: 0.3365, longitude: 6.7273, population: 80000 },
      { name: 'Santo António', latitude: 1.6397, longitude: 7.4186, population: 1200 },
      { name: 'Trindade', latitude: 0.2833, longitude: 6.6833, population: 16000 },
      { name: 'Neves', latitude: 0.3500, longitude: 6.5500, population: 5900 },
      { name: 'Santana', latitude: 0.2536, longitude: 6.7456, population: 8400 }
    ]
  },

  comoros: {
    name: 'Comoros',
    code: 'KM',
    continent: 'Africa',
    currency: 'KMF',
    phoneCode: '+269',
    majorCities: [
      { name: 'Moroni', latitude: 11.7022, longitude: 43.2551, population: 56000 },
      { name: 'Mutsamudu', latitude: 12.1667, longitude: 44.4000, population: 23000 },
      { name: 'Fomboni', latitude: 12.2833, longitude: 43.7333, population: 14000 },
      { name: 'Domoni', latitude: 12.2597, longitude: 44.5314, population: 14000 },
      { name: 'Tsimbeo', latitude: 11.8833, longitude: 43.2667, population: 8000 }
    ]
  },

  seychelles: {
    name: 'Seychelles',
    code: 'SC',
    continent: 'Africa',
    currency: 'SCR',
    phoneCode: '+248',
    majorCities: [
      { name: 'Victoria', latitude: 4.6796, longitude: 55.4920, population: 26000 },
      { name: 'Anse Boileau', latitude: 4.7167, longitude: 55.4833, population: 4200 },
      { name: 'Beau Vallon', latitude: 4.6167, longitude: 55.4333, population: 3900 },
      { name: 'Cascade', latitude: 4.6667, longitude: 55.5000, population: 3800 },
      { name: 'Anse Royale', latitude: 4.7419, longitude: 55.5156, population: 3800 }
    ]
  }
};

// Get sorted list of countries (Africa first)
export const getCountriesList = (): Array<{name: string, code: string, continent: string}> => {
  const countries = Object.values(locationData).map(country => ({
    name: country.name,
    code: country.code,
    continent: country.continent
  }));

  // Sort: Africa first, then alphabetically within each continent
  return countries.sort((a, b) => {
    if (a.continent === 'Africa' && b.continent !== 'Africa') return -1;
    if (a.continent !== 'Africa' && b.continent === 'Africa') return 1;
    if (a.continent === b.continent) return a.name.localeCompare(b.name);
    return a.continent.localeCompare(b.continent);
  });
};

// Get cities for a specific country
export const getCitiesForCountry = (countryCode: string): CityData[] => {
  const country = Object.values(locationData).find(c => c.code === countryCode);
  return country?.majorCities || [];
};

// Calculate distance between two coordinates (Haversine formula)
export const calculateDistance = (
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

// Helper function to convert degrees to radians
const toRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

// Find coordinates for a city
export const getCityCoordinates = (countryCode: string, cityName: string): CityData | null => {
  const cities = getCitiesForCountry(countryCode);
  return cities.find(city => 
    city.name.toLowerCase() === cityName.toLowerCase()
  ) || null;
};

// Get country by code
export const getCountryByCode = (code: string): CountryData | null => {
  return Object.values(locationData).find(country => country.code === code) || null;
};
