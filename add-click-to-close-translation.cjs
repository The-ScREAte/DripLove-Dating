const fs = require('fs');
const path = require('path');

// Translations for "Click to close"
const translations = {
  en: "Click to close",
  fr: "Cliquez pour fermer",
  de: "Klicken Sie zum Schließen",
  zh: "点击关闭",
  sw: "Bonyeza kufunga",
  pt: "Clique para fechar",
  ar: "انقر للإغلاق"
};

// Add translations to each locale file
Object.keys(translations).forEach(lang => {
  const filePath = path.join(__dirname, `src/i18n/locales/${lang}.json`);
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Add clickToClose to common section
    if (!data.common) {
      data.common = {};
    }
    data.common.clickToClose = translations[lang];
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated ${lang}.json with "Click to close" translation`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
});

console.log('\n✨ All "Click to close" translations added successfully!');
