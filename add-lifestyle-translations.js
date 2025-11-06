import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const updates = {
  "fr": {
    "profile": {
      "lifestyle": "Style de vie",
      "relationshipIntent": "Intention relationnelle",
      "casual": "Décontracté",
      "serious": "Sérieux",
      "openToAnything": "Ouvert à tout",
      "smoking": "Fumeur",
      "drinking": "Boire",
      "exercise": "Niveau d'exercice",
      "exerciseOptions": {
        "active": "Actif",
        "moderate": "Modéré",
        "inactive": "Inactif"
      },
      "sleepingSchedule": "Horaire de sommeil",
      "sleepOptions": {
        "earlyBird": "Lève-tôt",
        "nightOwl": "Couche-tard",
        "flexible": "Flexible"
      },
      "socially": "Socialement"
    }
  },
  "de": {
    "profile": {
      "lifestyle": "Lebensstil",
      "relationshipIntent": "Beziehungsabsicht",
      "casual": "Locker",
      "serious": "Ernst",
      "openToAnything": "Offen für alles",
      "smoking": "Rauchen",
      "drinking": "Trinken",
      "exercise": "Trainingsniveau",
      "exerciseOptions": {
        "active": "Aktiv",
        "moderate": "Moderat",
        "inactive": "Inaktiv"
      },
      "sleepingSchedule": "Schlafplan",
      "sleepOptions": {
        "earlyBird": "Frühaufsteher",
        "nightOwl": "Nachteule",
        "flexible": "Flexibel"
      },
      "socially": "Sozial"
    }
  },
  "pt": {
    "profile": {
      "lifestyle": "Estilo de vida",
      "relationshipIntent": "Intenção de relacionamento",
      "casual": "Casual",
      "serious": "Sério",
      "openToAnything": "Aberto a qualquer coisa",
      "smoking": "Fumar",
      "drinking": "Beber",
      "exercise": "Nível de exercício",
      "exerciseOptions": {
        "active": "Ativo",
        "moderate": "Moderado",
        "inactive": "Inativo"
      },
      "sleepingSchedule": "Horário de sono",
      "sleepOptions": {
        "earlyBird": "Madrugador",
        "nightOwl": "Coruja noturna",
        "flexible": "Flexível"
      },
      "socially": "Socialmente"
    }
  },
  "zh": {
    "profile": {
      "lifestyle": "生活方式",
      "relationshipIntent": "关系意图",
      "casual": "随意",
      "serious": "认真",
      "openToAnything": "开放任何可能",
      "smoking": "吸烟",
      "drinking": "饮酒",
      "exercise": "运动水平",
      "exerciseOptions": {
        "active": "活跃",
        "moderate": "适度",
        "inactive": "不活跃"
      },
      "sleepingSchedule": "睡眠时间",
      "sleepOptions": {
        "earlyBird": "早起鸟",
        "nightOwl": "夜猫子",
        "flexible": "灵活"
      },
      "socially": "社交性"
    }
  },
  "sw": {
    "profile": {
      "lifestyle": "Mtindo wa Maisha",
      "relationshipIntent": "Nia ya Mahusiano",
      "casual": "Kirafiki",
      "serious": "Makini",
      "openToAnything": "Wazi kwa Chochote",
      "smoking": "Kuvuta Sigara",
      "drinking": "Kunywa",
      "exercise": "Kiwango cha Mazoezi",
      "exerciseOptions": {
        "active": "Hai",
        "moderate": "Wastani",
        "inactive": "Haifanyi Kazi"
      },
      "sleepingSchedule": "Ratiba ya Kulala",
      "sleepOptions": {
        "earlyBird": "Ndege wa Alfajiri",
        "nightOwl": "Bundi wa Usiku",
        "flexible": "Inayoweza Kubadilika"
      },
      "socially": "Kijamii"
    }
  },
  "ar": {
    "profile": {
      "lifestyle": "نمط الحياة",
      "relationshipIntent": "نية العلاقة",
      "casual": "غير رسمي",
      "serious": "جاد",
      "openToAnything": "منفتح على أي شيء",
      "smoking": "التدخين",
      "drinking": "الشرب",
      "exercise": "مستوى التمرين",
      "exerciseOptions": {
        "active": "نشط",
        "moderate": "معتدل",
        "inactive": "غير نشط"
      },
      "sleepingSchedule": "جدول النوم",
      "sleepOptions": {
        "earlyBird": "طائر مبكر",
        "nightOwl": "بومة ليلية",
        "flexible": "مرن"
      },
      "socially": "اجتماعياً"
    }
  }
};

function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

for (const [lang, sections] of Object.entries(updates)) {
  const filePath = path.join(__dirname, 'src', 'i18n', 'locales', `${lang}.json`);
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    deepMerge(data, sections);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`✅ Updated ${lang}.json with LifestyleSection translations`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
}

console.log('\n✨ LifestyleSection translations added to all languages!');
