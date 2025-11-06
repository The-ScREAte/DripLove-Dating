import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const updates = {
  "fr": {
    "profile": {
      "workEducation": "Travail et éducation",
      "occupation": "Profession",
      "selectOccupation": "Sélectionnez ou saisissez votre profession",
      "enterOccupation": "Ou saisissez votre profession",
      "industry": "Secteur",
      "selectIndustry": "Sélectionnez ou saisissez votre secteur",
      "enterIndustry": "Ou saisissez votre secteur",
      "education": "Niveau d'éducation",
      "selectEducation": "Sélectionnez votre niveau d'éducation",
      "enterEducation": "Ou saisissez votre niveau d'éducation",
      "educationOptions": {
        "highSchool": "Lycée",
        "someCollege": "Quelques études supérieures",
        "associate": "Diplôme d'associé",
        "bachelors": "Licence",
        "masters": "Master",
        "doctorate": "Doctorat",
        "other": "Autre"
      }
    }
  },
  "de": {
    "profile": {
      "workEducation": "Arbeit und Bildung",
      "occupation": "Beruf",
      "selectOccupation": "Wählen oder geben Sie Ihren Beruf ein",
      "enterOccupation": "Oder geben Sie Ihren Beruf ein",
      "industry": "Branche",
      "selectIndustry": "Wählen oder geben Sie Ihre Branche ein",
      "enterIndustry": "Oder geben Sie Ihre Branche ein",
      "education": "Bildungsniveau",
      "selectEducation": "Wählen Sie Ihr Bildungsniveau",
      "enterEducation": "Oder geben Sie Ihr Bildungsniveau ein",
      "educationOptions": {
        "highSchool": "Gymnasium",
        "someCollege": "Etwas Hochschule",
        "associate": "Associate-Abschluss",
        "bachelors": "Bachelor-Abschluss",
        "masters": "Master-Abschluss",
        "doctorate": "Doktorat",
        "other": "Andere"
      }
    }
  },
  "pt": {
    "profile": {
      "workEducation": "Trabalho e educação",
      "occupation": "Ocupação",
      "selectOccupation": "Selecione ou digite sua ocupação",
      "enterOccupation": "Ou digite sua ocupação",
      "industry": "Indústria",
      "selectIndustry": "Selecione ou digite sua indústria",
      "enterIndustry": "Ou digite sua indústria",
      "education": "Nível de educação",
      "selectEducation": "Selecione seu nível de educação",
      "enterEducation": "Ou digite seu nível de educação",
      "educationOptions": {
        "highSchool": "Ensino médio",
        "someCollege": "Alguma faculdade",
        "associate": "Grau associado",
        "bachelors": "Bacharelado",
        "masters": "Mestrado",
        "doctorate": "Doutorado",
        "other": "Outro"
      }
    }
  },
  "zh": {
    "profile": {
      "workEducation": "工作和教育",
      "occupation": "职业",
      "selectOccupation": "选择或输入您的职业",
      "enterOccupation": "或输入您的职业",
      "industry": "行业",
      "selectIndustry": "选择或输入您的行业",
      "enterIndustry": "或输入您的行业",
      "education": "教育程度",
      "selectEducation": "选择您的教育程度",
      "enterEducation": "或输入您的教育程度",
      "educationOptions": {
        "highSchool": "高中",
        "someCollege": "部分大学",
        "associate": "副学士学位",
        "bachelors": "学士学位",
        "masters": "硕士学位",
        "doctorate": "博士学位",
        "other": "其他"
      }
    }
  },
  "sw": {
    "profile": {
      "workEducation": "Kazi na elimu",
      "occupation": "Kazi",
      "selectOccupation": "Chagua au andika kazi yako",
      "enterOccupation": "Au andika kazi yako",
      "industry": "Sekta",
      "selectIndustry": "Chagua au andika sekta yako",
      "enterIndustry": "Au andika sekta yako",
      "education": "Kiwango cha elimu",
      "selectEducation": "Chagua kiwango chako cha elimu",
      "enterEducation": "Au andika kiwango chako cha elimu",
      "educationOptions": {
        "highSchool": "Shule ya Sekondari",
        "someCollege": "Baadhi ya Chuo Kikuu",
        "associate": "Digrii ya Msaidizi",
        "bachelors": "Digrii ya Kwanza",
        "masters": "Digrii ya Uzamili",
        "doctorate": "Digrii ya Uzamivu",
        "other": "Nyingine"
      }
    }
  },
  "ar": {
    "profile": {
      "workEducation": "العمل والتعليم",
      "occupation": "المهنة",
      "selectOccupation": "اختر أو اكتب مهنتك",
      "enterOccupation": "أو أدخل مهنتك",
      "industry": "الصناعة",
      "selectIndustry": "اختر أو اكتب صناعتك",
      "enterIndustry": "أو أدخل صناعتك",
      "education": "المستوى التعليمي",
      "selectEducation": "اختر مستواك التعليمي",
      "enterEducation": "أو أدخل مستواك التعليمي",
      "educationOptions": {
        "highSchool": "الثانوية",
        "someCollege": "بعض الجامعة",
        "associate": "درجة مشارك",
        "bachelors": "درجة البكالوريوس",
        "masters": "درجة الماجستير",
        "doctorate": "درجة الدكتوراه",
        "other": "آخر"
      }
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
    console.log(`✅ Updated ${lang}.json with WorkEducationSection translations`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
}

console.log('\n✨ WorkEducationSection translations added to all languages!');
