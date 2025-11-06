const fs = require('fs');
const path = require('path');

// Deep merge function to preserve existing translations
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

// New translations for LikedMePage
const newTranslations = {
  en: {
    matches: {
      peopleWhoLikedYou: "People who liked you",
      peopleCount: "{{count}} people",
      upgrade: "Upgrade",
      upgradeToPremium: "Upgrade to Premium to see who liked you and interact with them",
      noNewLikes: "No new likes",
      keepSwiping: "Keep swiping! Someone special is waiting to find you.",
      back: "Back",
      showMore: "Show More",
      showLess: "Show Less",
      about: "About",
      interests: "Interests",
      yearsOld: "years old",
      pullToRefresh: "Pull to refresh",
      releaseToRefresh: "Release to refresh",
      refreshing: "Refreshing...",
      error: "Error",
      failedToRefresh: "Failed to refresh people who liked you"
    }
  },
  fr: {
    matches: {
      peopleWhoLikedYou: "Personnes qui vous ont aimé",
      peopleCount: "{{count}} personnes",
      upgrade: "Améliorer",
      upgradeToPremium: "Passez à Premium pour voir qui vous a aimé et interagir avec eux",
      noNewLikes: "Aucun nouveau j'aime",
      keepSwiping: "Continuez à swiper ! Quelqu'un de spécial vous attend.",
      back: "Retour",
      showMore: "Afficher plus",
      showLess: "Afficher moins",
      about: "À propos",
      interests: "Intérêts",
      yearsOld: "ans",
      pullToRefresh: "Tirez pour actualiser",
      releaseToRefresh: "Relâchez pour actualiser",
      refreshing: "Actualisation...",
      error: "Erreur",
      failedToRefresh: "Échec de l'actualisation des personnes qui vous ont aimé"
    }
  },
  de: {
    matches: {
      peopleWhoLikedYou: "Personen, die dich geliked haben",
      peopleCount: "{{count}} Personen",
      upgrade: "Upgrade",
      upgradeToPremium: "Upgrade auf Premium, um zu sehen, wer dich geliked hat und mit ihnen zu interagieren",
      noNewLikes: "Keine neuen Likes",
      keepSwiping: "Weiter swipen! Jemand Besonderes wartet darauf, dich zu finden.",
      back: "Zurück",
      showMore: "Mehr anzeigen",
      showLess: "Weniger anzeigen",
      about: "Über mich",
      interests: "Interessen",
      yearsOld: "Jahre alt",
      pullToRefresh: "Ziehen zum Aktualisieren",
      releaseToRefresh: "Loslassen zum Aktualisieren",
      refreshing: "Aktualisierung...",
      error: "Fehler",
      failedToRefresh: "Aktualisierung der Personen, die dich geliked haben, fehlgeschlagen"
    }
  },
  zh: {
    matches: {
      peopleWhoLikedYou: "喜欢你的人",
      peopleCount: "{{count}} 人",
      upgrade: "升级",
      upgradeToPremium: "升级到高级版以查看谁喜欢你并与他们互动",
      noNewLikes: "没有新的喜欢",
      keepSwiping: "继续滑动！有人正在等待找到你。",
      back: "返回",
      showMore: "显示更多",
      showLess: "显示更少",
      about: "关于",
      interests: "兴趣",
      yearsOld: "岁",
      pullToRefresh: "下拉刷新",
      releaseToRefresh: "释放以刷新",
      refreshing: "刷新中...",
      error: "错误",
      failedToRefresh: "刷新喜欢你的人失败"
    }
  },
  sw: {
    matches: {
      peopleWhoLikedYou: "Watu waliokupenda",
      peopleCount: "Watu {{count}}",
      upgrade: "Boresha",
      upgradeToPremium: "Boresha hadi Premium ili kuona ni nani alikupenda na kuwasiliana nao",
      noNewLikes: "Hakuna kupenda mpya",
      keepSwiping: "Endelea kupapasa! Mtu maalum anakungoja kukutafuta.",
      back: "Rudi",
      showMore: "Onyesha Zaidi",
      showLess: "Onyesha Kidogo",
      about: "Kuhusu",
      interests: "Mapenzi",
      yearsOld: "miaka",
      pullToRefresh: "Vuta ili kuonyesha upya",
      releaseToRefresh: "Achia ili kuonyesha upya",
      refreshing: "Inaonyesha upya...",
      error: "Hitilafu",
      failedToRefresh: "Imeshindwa kuonyesha upya watu waliokupenda"
    }
  },
  pt: {
    matches: {
      peopleWhoLikedYou: "Pessoas que gostaram de você",
      peopleCount: "{{count}} pessoas",
      upgrade: "Atualizar",
      upgradeToPremium: "Atualize para Premium para ver quem gostou de você e interagir com eles",
      noNewLikes: "Sem novas curtidas",
      keepSwiping: "Continue deslizando! Alguém especial está esperando para encontrá-lo.",
      back: "Voltar",
      showMore: "Mostrar Mais",
      showLess: "Mostrar Menos",
      about: "Sobre",
      interests: "Interesses",
      yearsOld: "anos",
      pullToRefresh: "Puxe para atualizar",
      releaseToRefresh: "Solte para atualizar",
      refreshing: "Atualizando...",
      error: "Erro",
      failedToRefresh: "Falha ao atualizar pessoas que gostaram de você"
    }
  },
  ar: {
    matches: {
      peopleWhoLikedYou: "الأشخاص الذين أعجبوا بك",
      peopleCount: "{{count}} شخص",
      upgrade: "ترقية",
      upgradeToPremium: "قم بالترقية إلى بريميوم لترى من أعجب بك وتتفاعل معهم",
      noNewLikes: "لا توجد إعجابات جديدة",
      keepSwiping: "استمر في التمرير! شخص مميز ينتظر العثور عليك.",
      back: "رجوع",
      showMore: "عرض المزيد",
      showLess: "عرض أقل",
      about: "نبذة",
      interests: "الاهتمامات",
      yearsOld: "سنة",
      pullToRefresh: "اسحب للتحديث",
      releaseToRefresh: "حرر للتحديث",
      refreshing: "جاري التحديث...",
      error: "خطأ",
      failedToRefresh: "فشل تحديث الأشخاص الذين أعجبوا بك"
    }
  }
};

// Update all language files
const localesDir = path.join(__dirname, 'src', 'i18n', 'locales');

Object.keys(newTranslations).forEach(lang => {
  const filePath = path.join(localesDir, `${lang}.json`);
  const existingTranslations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const updatedTranslations = deepMerge(existingTranslations, newTranslations[lang]);
  fs.writeFileSync(filePath, JSON.stringify(updatedTranslations, null, 2) + '\n', 'utf8');
  console.log(`✅ Updated ${lang}.json`);
});

console.log('\n✨ All language files updated successfully!');
