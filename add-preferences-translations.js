import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const updates = {
  "fr": {
    "common": { "select": "Sélectionner" },
    "profile": {
      "preferences": "Préférences",
      "gender": "Genre",
      "genderOptions": {
        "male": "Homme",
        "female": "Femme",
        "other": "Autre",
        "both": "Les deux"
      },
      "lookingFor": "Recherche",
      "ageRangeForMatches": "Tranche d'âge pour les correspondances",
      "ageYears": "{{age}} ans",
      "ageRange": "{{min}} - {{max}} ans",
      "ageRangeDescription": "Définissez la tranche d'âge des correspondances potentielles. Vous ne verrez que les profils dans cette tranche d'âge."
    }
  },
  "de": {
    "common": { "select": "Auswählen" },
    "profile": {
      "preferences": "Präferenzen",
      "gender": "Geschlecht",
      "genderOptions": {
        "male": "Männlich",
        "female": "Weiblich",
        "other": "Andere",
        "both": "Beide"
      },
      "lookingFor": "Suche nach",
      "ageRangeForMatches": "Altersspanne für Übereinstimmungen",
      "ageYears": "{{age}} Jahre",
      "ageRange": "{{min}} - {{max}} Jahre",
      "ageRangeDescription": "Legen Sie die Altersspanne für potenzielle Übereinstimmungen fest. Sie sehen nur Profile in dieser Altersspanne."
    }
  },
  "pt": {
    "common": { "select": "Selecionar" },
    "profile": {
      "preferences": "Preferências",
      "gender": "Gênero",
      "genderOptions": {
        "male": "Masculino",
        "female": "Feminino",
        "other": "Outro",
        "both": "Ambos"
      },
      "lookingFor": "Procurando por",
      "ageRangeForMatches": "Faixa etária para correspondências",
      "ageYears": "{{age}} anos",
      "ageRange": "{{min}} - {{max}} anos",
      "ageRangeDescription": "Defina a faixa etária para correspondências potenciais. Você só verá perfis dentro desta faixa etária."
    }
  },
  "zh": {
    "common": { "select": "选择" },
    "profile": {
      "preferences": "偏好",
      "gender": "性别",
      "genderOptions": {
        "male": "男性",
        "female": "女性",
        "other": "其他",
        "both": "两者"
      },
      "lookingFor": "寻找",
      "ageRangeForMatches": "匹配年龄范围",
      "ageYears": "{{age}}岁",
      "ageRange": "{{min}} - {{max}}岁",
      "ageRangeDescription": "设置潜在匹配的年龄范围。您只会看到此年龄范围内的个人资料。"
    }
  },
  "sw": {
    "common": { "select": "Chagua" },
    "profile": {
      "preferences": "Mapendeleo",
      "gender": "Jinsia",
      "genderOptions": {
        "male": "Mwanaume",
        "female": "Mwanamke",
        "other": "Nyingine",
        "both": "Wote"
      },
      "lookingFor": "Inatafuta",
      "ageRangeForMatches": "Kipindi cha umri cha mechi",
      "ageYears": "Miaka {{age}}",
      "ageRange": "Miaka {{min}} - {{max}}",
      "ageRangeDescription": "Weka kipindi cha umri cha mechi zinazowezekana. Utaona tu wasifu ndani ya kipindi hiki cha umri."
    }
  },
  "ar": {
    "common": { "select": "اختر" },
    "profile": {
      "preferences": "التفضيلات",
      "gender": "الجنس",
      "genderOptions": {
        "male": "ذكر",
        "female": "أنثى",
        "other": "آخر",
        "both": "كلاهما"
      },
      "lookingFor": "يبحث عن",
      "ageRangeForMatches": "النطاق العمري للمطابقات",
      "ageYears": "{{age}} سنة",
      "ageRange": "{{min}} - {{max}} سنة",
      "ageRangeDescription": "حدد النطاق العمري للمطابقات المحتملة. سترى فقط الملفات الشخصية ضمن هذا النطاق العمري."
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
    console.log(`✅ Updated ${lang}.json with PreferencesSection translations`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
}

console.log('\n✨ PreferencesSection translations added to all languages!');
