import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Update English first
const enFilePath = path.join(__dirname, 'src', 'i18n', 'locales', 'en.json');
const enData = JSON.parse(fs.readFileSync(enFilePath, 'utf8'));

// Add new keys to English
enData.profile.yourDripLoveSummary = "Your DripLove Summary";
enData.profile.totalMatches = "Total Matches";
enData.profile.activeChats = "Active Chats";
enData.profile.likesGiven = "Likes Given";
enData.profile.moreItems = "more items";
enData.profile.completionCriteria = {
  photos: "Upload 3 approved photos",
  basicInfo: "Complete basic information",
  location: "Set location and distance preferences",
  preferences: "Set gender preferences",
  lifestyle: "Complete lifestyle preferences",
  workEducation: "Add work and education details",
  personality: "Complete personality sliders",
  funQuestions: "Answer fun questions",
  interests: "Select at least 3 interests"
};

fs.writeFileSync(enFilePath, JSON.stringify(enData, null, 2) + '\n');
console.log('✅ Updated en.json with header translations');

// Add translations for all other languages
const updates = {
  "fr": {
    "profile": {
      "yourDripLoveSummary": "Votre résumé DripLove",
      "totalMatches": "Correspondances totales",
      "activeChats": "Chats actifs",
      "likesGiven": "Likes donnés",
      "moreItems": "éléments supplémentaires",
      "completionCriteria": {
        "photos": "Téléchargez 3 photos approuvées",
        "basicInfo": "Complétez les informations de base",
        "location": "Définissez la localisation et les préférences de distance",
        "preferences": "Définissez les préférences de genre",
        "lifestyle": "Complétez les préférences de style de vie",
        "workEducation": "Ajoutez des détails sur le travail et l'éducation",
        "personality": "Complétez les curseurs de personnalité",
        "funQuestions": "Répondez aux questions amusantes",
        "interests": "Sélectionnez au moins 3 intérêts"
      }
    }
  },
  "de": {
    "profile": {
      "yourDripLoveSummary": "Ihre DripLove-Zusammenfassung",
      "totalMatches": "Gesamte Übereinstimmungen",
      "activeChats": "Aktive Chats",
      "likesGiven": "Likes gegeben",
      "moreItems": "weitere Elemente",
      "completionCriteria": {
        "photos": "Laden Sie 3 genehmigte Fotos hoch",
        "basicInfo": "Vervollständigen Sie grundlegende Informationen",
        "location": "Legen Sie Standort- und Entfernungspräferenzen fest",
        "preferences": "Legen Sie Geschlechtspräferenzen fest",
        "lifestyle": "Vervollständigen Sie Lebensstilpräferenzen",
        "workEducation": "Fügen Sie Arbeits- und Bildungsdetails hinzu",
        "personality": "Vervollständigen Sie Persönlichkeitsregler",
        "funQuestions": "Beantworten Sie lustige Fragen",
        "interests": "Wählen Sie mindestens 3 Interessen"
      }
    }
  },
  "pt": {
    "profile": {
      "yourDripLoveSummary": "Seu resumo DripLove",
      "totalMatches": "Total de correspondências",
      "activeChats": "Chats ativos",
      "likesGiven": "Curtidas dadas",
      "moreItems": "mais itens",
      "completionCriteria": {
        "photos": "Envie 3 fotos aprovadas",
        "basicInfo": "Complete as informações básicas",
        "location": "Defina localização e preferências de distância",
        "preferences": "Defina preferências de gênero",
        "lifestyle": "Complete as preferências de estilo de vida",
        "workEducation": "Adicione detalhes de trabalho e educação",
        "personality": "Complete os controles de personalidade",
        "funQuestions": "Responda perguntas divertidas",
        "interests": "Selecione pelo menos 3 interesses"
      }
    }
  },
  "zh": {
    "profile": {
      "yourDripLoveSummary": "您的DripLove摘要",
      "totalMatches": "总匹配数",
      "activeChats": "活跃聊天",
      "likesGiven": "点赞数",
      "moreItems": "更多项目",
      "completionCriteria": {
        "photos": "上传3张审核通过的照片",
        "basicInfo": "完成基本信息",
        "location": "设置位置和距离偏好",
        "preferences": "设置性别偏好",
        "lifestyle": "完成生活方式偏好",
        "workEducation": "添加工作和教育详情",
        "personality": "完成性格滑块",
        "funQuestions": "回答趣味问题",
        "interests": "至少选择3个兴趣"
      }
    }
  },
  "sw": {
    "profile": {
      "yourDripLoveSummary": "Muhtasari wako wa DripLove",
      "totalMatches": "Mechi Jumla",
      "activeChats": "Mazungumzo hai",
      "likesGiven": "Kupenda Kutolewa",
      "moreItems": "vitu zaidi",
      "completionCriteria": {
        "photos": "Pakia picha 3 zilizoidhinishwa",
        "basicInfo": "Kamilisha taarifa za msingi",
        "location": "Weka mahali na mapendeleo ya umbali",
        "preferences": "Weka mapendeleo ya jinsia",
        "lifestyle": "Kamilisha mapendeleo ya mtindo wa maisha",
        "workEducation": "Ongeza maelezo ya kazi na elimu",
        "personality": "Kamilisha sliders za tabia",
        "funQuestions": "Jibu maswali ya kufurahisha",
        "interests": "Chagua angalau mapendekezo 3"
      }
    }
  },
  "ar": {
    "profile": {
      "yourDripLoveSummary": "ملخص DripLove الخاص بك",
      "totalMatches": "إجمالي المطابقات",
      "activeChats": "الدردشات النشطة",
      "likesGiven": "الإعجابات المعطاة",
      "moreItems": "المزيد من العناصر",
      "completionCriteria": {
        "photos": "قم بتحميل 3 صور معتمدة",
        "basicInfo": "أكمل المعلومات الأساسية",
        "location": "حدد الموقع وتفضيلات المسافة",
        "preferences": "حدد تفضيلات الجنس",
        "lifestyle": "أكمل تفضيلات نمط الحياة",
        "workEducation": "أضف تفاصيل العمل والتعليم",
        "personality": "أكمل منزلقات الشخصية",
        "funQuestions": "أجب على الأسئلة الممتعة",
        "interests": "حدد 3 اهتمامات على الأقل"
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
    console.log(`✅ Updated ${lang}.json with header translations`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
}

console.log('\n✨ Header translations complete for all 7 languages!');
console.log('🎉 Now "Total Matches", "Active Chats", "Likes Given" and "Upload 3 approved photos" are translated!');
