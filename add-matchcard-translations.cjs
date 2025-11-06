const fs = require('fs');
const path = require('path');

// Deep merge function to preserve existing translations
function deepMerge(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// Define translations for MatchCard expandable section
const enTranslations = {
  discover: {
    matchCard: {
      about: "About",
      aboutUser: "About {{name}}",
      lifestyle: "Lifestyle",
      smoking: "Smoking",
      drinking: "Drinking",
      exercise: "Exercise",
      sleep: "Sleep",
      workEducation: "Work & Education",
      personality: "Personality",
      introvert: "Introvert",
      extrovert: "Extrovert",
      spontaneous: "Spontaneous",
      planner: "Planner",
      messy: "Messy",
      organized: "Organized",
      spontaneousVsPlanner: "Spontaneous vs Planner: {{percentage}}%",
      messyVsOrganized: "Messy vs Organized: {{percentage}}%",
      interests: "Interests"
    }
  }
};

const frTranslations = {
  discover: {
    matchCard: {
      about: "À propos",
      aboutUser: "À propos de {{name}}",
      lifestyle: "Style de vie",
      smoking: "Tabagisme",
      drinking: "Consommation d'alcool",
      exercise: "Exercice",
      sleep: "Sommeil",
      workEducation: "Travail et Éducation",
      personality: "Personnalité",
      introvert: "Introverti",
      extrovert: "Extraverti",
      spontaneous: "Spontané",
      planner: "Planificateur",
      messy: "Désordonné",
      organized: "Organisé",
      spontaneousVsPlanner: "Spontané vs Planificateur : {{percentage}}%",
      messyVsOrganized: "Désordonné vs Organisé : {{percentage}}%",
      interests: "Centres d'intérêt"
    }
  }
};

const deTranslations = {
  discover: {
    matchCard: {
      about: "Über mich",
      aboutUser: "Über {{name}}",
      lifestyle: "Lebensstil",
      smoking: "Rauchen",
      drinking: "Trinken",
      exercise: "Sport",
      sleep: "Schlaf",
      workEducation: "Beruf & Bildung",
      personality: "Persönlichkeit",
      introvert: "Introvertiert",
      extrovert: "Extrovertiert",
      spontaneous: "Spontan",
      planner: "Planer",
      messy: "Unordentlich",
      organized: "Organisiert",
      spontaneousVsPlanner: "Spontan vs Planer: {{percentage}}%",
      messyVsOrganized: "Unordentlich vs Organisiert: {{percentage}}%",
      interests: "Interessen"
    }
  }
};

const zhTranslations = {
  discover: {
    matchCard: {
      about: "关于我",
      aboutUser: "关于{{name}}",
      lifestyle: "生活方式",
      smoking: "吸烟",
      drinking: "饮酒",
      exercise: "运动",
      sleep: "睡眠",
      workEducation: "工作与教育",
      personality: "性格",
      introvert: "内向",
      extrovert: "外向",
      spontaneous: "随性",
      planner: "计划者",
      messy: "凌乱",
      organized: "有条理",
      spontaneousVsPlanner: "随性 vs 计划者：{{percentage}}%",
      messyVsOrganized: "凌乱 vs 有条理：{{percentage}}%",
      interests: "兴趣爱好"
    }
  }
};

const swTranslations = {
  discover: {
    matchCard: {
      about: "Kuhusu",
      aboutUser: "Kuhusu {{name}}",
      lifestyle: "Mtindo wa Maisha",
      smoking: "Kuvuta Sigara",
      drinking: "Kunywa Pombe",
      exercise: "Mazoezi",
      sleep: "Usingizi",
      workEducation: "Kazi na Elimu",
      personality: "Tabia",
      introvert: "Msimamizi",
      extrovert: "Mchangamfu",
      spontaneous: "Wa Ghafla",
      planner: "Mpangaji",
      messy: "Uchafu",
      organized: "Mpangilio",
      spontaneousVsPlanner: "Wa Ghafla vs Mpangaji: {{percentage}}%",
      messyVsOrganized: "Uchafu vs Mpangilio: {{percentage}}%",
      interests: "Mambo Yanayopendeza"
    }
  }
};

const ptTranslations = {
  discover: {
    matchCard: {
      about: "Sobre",
      aboutUser: "Sobre {{name}}",
      lifestyle: "Estilo de Vida",
      smoking: "Fumar",
      drinking: "Beber",
      exercise: "Exercício",
      sleep: "Sono",
      workEducation: "Trabalho e Educação",
      personality: "Personalidade",
      introvert: "Introvertido",
      extrovert: "Extrovertido",
      spontaneous: "Espontâneo",
      planner: "Planejador",
      messy: "Desorganizado",
      organized: "Organizado",
      spontaneousVsPlanner: "Espontâneo vs Planejador: {{percentage}}%",
      messyVsOrganized: "Desorganizado vs Organizado: {{percentage}}%",
      interests: "Interesses"
    }
  }
};

const arTranslations = {
  discover: {
    matchCard: {
      about: "عني",
      aboutUser: "عن {{name}}",
      lifestyle: "نمط الحياة",
      smoking: "التدخين",
      drinking: "الشرب",
      exercise: "التمرين",
      sleep: "النوم",
      workEducation: "العمل والتعليم",
      personality: "الشخصية",
      introvert: "انطوائي",
      extrovert: "منفتح",
      spontaneous: "عفوي",
      planner: "مخطط",
      messy: "فوضوي",
      organized: "منظم",
      spontaneousVsPlanner: "عفوي vs مخطط: {{percentage}}%",
      messyVsOrganized: "فوضوي vs منظم: {{percentage}}%",
      interests: "الاهتمامات"
    }
  }
};

// Update all language files
const languages = [
  { code: 'en', translations: enTranslations },
  { code: 'fr', translations: frTranslations },
  { code: 'de', translations: deTranslations },
  { code: 'zh', translations: zhTranslations },
  { code: 'sw', translations: swTranslations },
  { code: 'pt', translations: ptTranslations },
  { code: 'ar', translations: arTranslations }
];

languages.forEach(({ code, translations }) => {
  const filePath = path.join(__dirname, 'src', 'i18n', 'locales', `${code}.json`);
  
  try {
    // Read existing translations
    const existingContent = fs.readFileSync(filePath, 'utf8');
    const existingTranslations = JSON.parse(existingContent);
    
    // Merge new translations with existing ones
    const mergedTranslations = deepMerge(existingTranslations, translations);
    
    // Write back to file with proper formatting
    fs.writeFileSync(filePath, JSON.stringify(mergedTranslations, null, 2) + '\n', 'utf8');
    
    console.log(`✅ Updated ${code}.json with MatchCard expandable translations`);
  } catch (error) {
    console.error(`❌ Error updating ${code}.json:`, error.message);
  }
});

console.log('\n🎉 All language files updated with MatchCard expandable section translations!');
