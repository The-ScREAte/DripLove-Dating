const fs = require('fs');
const path = require('path');

// Deep merge function
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

const extraTranslations = {
  en: {
    match: {
      itsAMatch: "It's a Match! 🎉",
      youAndLikedEachOther: "You and {{name}} liked each other!",
      startChatting: "Start Chatting",
      keepSwiping: "Keep Swiping"
    }
  },
  fr: {
    match: {
      itsAMatch: "C'est un Match ! 🎉",
      youAndLikedEachOther: "Vous et {{name}} vous êtes aimés !",
      startChatting: "Commencer à Discuter",
      keepSwiping: "Continuer à Swiper"
    }
  },
  de: {
    match: {
      itsAMatch: "Es ist ein Match! 🎉",
      youAndLikedEachOther: "Du und {{name}} mögen sich gegenseitig!",
      startChatting: "Chat Starten",
      keepSwiping: "Weiter Swipen"
    }
  },
  zh: {
    match: {
      itsAMatch: "配对成功！🎉",
      youAndLikedEachOther: "你和{{name}}互相喜欢！",
      startChatting: "开始聊天",
      keepSwiping: "继续滑动"
    }
  },
  sw: {
    match: {
      itsAMatch: "Ni Mechi! 🎉",
      youAndLikedEachOther: "Wewe na {{name}} mmependana!",
      startChatting: "Anza Kuzungumza",
      keepSwiping: "Endelea Kuswipe"
    }
  },
  pt: {
    match: {
      itsAMatch: "É um Match! 🎉",
      youAndLikedEachOther: "Você e {{name}} gostaram um do outro!",
      startChatting: "Começar a Conversar",
      keepSwiping: "Continuar Deslizando"
    }
  },
  ar: {
    match: {
      itsAMatch: "إنها مطابقة! 🎉",
      youAndLikedEachOther: "أنت و{{name}} أعجبتما ببعضكما البعض!",
      startChatting: "بدء الدردشة",
      keepSwiping: "مواصلة التمرير"
    }
  }
};

const locales = ['en', 'fr', 'de', 'zh', 'sw', 'pt', 'ar'];
const localesDir = path.join(__dirname, 'src', 'i18n', 'locales');

locales.forEach(locale => {
  const filePath = path.join(localesDir, `${locale}.json`);
  const existingContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const updatedContent = deepMerge(existingContent, extraTranslations[locale]);
  fs.writeFileSync(filePath, JSON.stringify(updatedContent, null, 2), 'utf8');
});

console.log('✅ Updated en.json, fr.json, de.json, zh.json, sw.json, pt.json, ar.json with match animation translations');
