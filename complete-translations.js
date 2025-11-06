import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Missing keys to add to each language
const missingKeys = {
  "pt": {
    "common": { "saving": "Salvando..." },
    "profile": {
      "bioPlaceholder": "Conte-nos sobre você...",
      "aiContentModeration": "Moderação de Conteúdo IA Ativa",
      "uploadImage": "Fazer Upload de Imagem",
      "chooseFile": "Escolher Arquivo"
    },
    "premium": { "getPremium": "Obter Premium" },
    "matches": { "title": "Matches", "liked": "Curtidas" },
    "chat": { "title": "Chat" },
    "settings": { "title": "Configurações", "accountActions": "Ações da Conta" },
    "errors": {
      "noUserData": "Sem Dados do Usuário",
      "unableToLoadUser": "Não foi possível carregar as informações do usuário. Faça login novamente."
    }
  },
  "de": {
    "common": { "saving": "Speichern..." },
    "profile": {
      "bioPlaceholder": "Erzählen Sie uns von sich...",
      "aiContentModeration": "KI-Inhaltsmoderation Aktiv",
      "uploadImage": "Bild hochladen",
      "chooseFile": "Datei auswählen"
    }
  },
  "zh": {
    "common": { "saving": "保存中..." },
    "auth": { "backToLogin": "返回登录" },
    "profile": {
      "title": "个人资料",
      "completeProfilePrompt": "完善您的个人资料以获得更好的匹配:",
      "bioPlaceholder": "告诉我们关于您自己...",
      "yourPhotos": "您的照片",
      "locationAndPreferences": "位置和匹配偏好",
      "workAndEducation": "工作和教育",
      "myAdinkra": "我的Adinkra",
      "aiContentModeration": "AI内容审核已激活",
      "uploadImage": "上传图片",
      "chooseFile": "选择文件"
    },
    "discover": { "title": "发现" },
    "matches": { "title": "配对", "liked": "喜欢" },
    "chat": { "title": "聊天" },
    "premium": { "upgrade": "升级", "getPremium": "获取高级版" },
    "settings": { "title": "设置", "accountActions": "账户操作" },
    "errors": {
      "noUserData": "没有用户数据",
      "unableToLoadUser": "无法加载用户信息。请重新登录。"
    }
  },
  "sw": {
    "common": { "saving": "Inahifadhi..." },
    "auth": { "backToLogin": "Rudi kwenye Kuingia" },
    "profile": {
      "title": "Wasifu",
      "completeProfilePrompt": "Kamilisha wasifu wako ili upate mechi bora:",
      "bioPlaceholder": "Tuambie kuhusu wewe...",
      "yourPhotos": "Picha Zako",
      "locationAndPreferences": "Mahali na Mapendekezo ya Kulinganisha",
      "workAndEducation": "Kazi na Elimu",
      "myAdinkra": "Adinkra Yangu",
      "aiContentModeration": "Usimamizi wa Maudhui ya AI Umeamilishwa",
      "uploadImage": "Pakia Picha",
      "chooseFile": "Chagua Faili"
    },
    "discover": { "title": "Gundua" },
    "matches": { "title": "Mechi", "liked": "Kupendwa" },
    "chat": { "title": "Mazungumzo" },
    "premium": { "upgrade": "Boresha", "getPremium": "Pata Premium" },
    "settings": { "title": "Mipangilio", "accountActions": "Vitendo vya Akaunti" },
    "errors": {
      "noUserData": "Hakuna Data ya Mtumiaji",
      "unableToLoadUser": "Haikuweza kupakia taarifa za mtumiaji. Tafadhali ingia tena."
    }
  },
  "ar": {
    "common": { "saving": "جارٍ الحفظ..." },
    "auth": { "backToLogin": "العودة إلى تسجيل الدخول" },
    "profile": {
      "title": "الملف الشخصي",
      "completeProfilePrompt": "أكمل ملفك الشخصي للحصول على تطابقات أفضل:",
      "bioPlaceholder": "أخبرنا عن نفسك...",
      "yourPhotos": "صورك",
      "locationAndPreferences": "الموقع وتفضيلات المطابقة",
      "workAndEducation": "العمل والتعليم",
      "myAdinkra": "أدينكرا الخاص بي",
      "aiContentModeration": "تعديل المحتوى بالذكاء الاصطناعي نشط",
      "uploadImage": "تحميل صورة",
      "chooseFile": "اختر ملف"
    },
    "discover": { "title": "اكتشف" },
    "matches": { "title": "المطابقات", "liked": "الإعجابات" },
    "chat": { "title": "الدردشة" },
    "premium": { "upgrade": "ترقية", "getPremium": "احصل على Premium" },
    "settings": { "title": "الإعدادات", "accountActions": "إجراءات الحساب" },
    "errors": {
      "noUserData": "لا توجد بيانات مستخدم",
      "unableToLoadUser": "غير قادر على تحميل معلومات المستخدم. يرجى تسجيل الدخول مرة أخرى."
    }
  }
};

// Update each language file
for (const [lang, sections] of Object.entries(missingKeys)) {
  const filePath = path.join(__dirname, 'src', 'i18n', 'locales', `${lang}.json`);
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Merge missing keys into existing sections
    for (const [section, keys] of Object.entries(sections)) {
      if (!data[section]) {
        data[section] = {};
      }
      Object.assign(data[section], keys);
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`✅ Updated ${lang}.json`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
}

console.log('\n✨ All translation files updated!');
