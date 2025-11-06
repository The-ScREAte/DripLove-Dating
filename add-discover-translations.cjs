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

// Define base translations for English
const enTranslations = {
  discover: {
    title: "DripCheck",  // NOT TRANSLATED - brand name stays in English across all languages
    // Loading states
    findingMatches: "Finding your matches...",
    loadingProfiles: "Loading profiles...",
    
    // Empty/no profiles states
    noMoreProfiles: "No more profiles",
    noProfilesDescription: "You've seen all available profiles. Check back later for new matches! or Adjust your preference in settings for more profiles.",
    checkBackLater: "Check back later for new matches",
    adjustPreferences: "Adjust your preference in settings for more profiles",
    refresh: "Refresh",
    
    // Swipe guide popup (for new users)
    swipeGuide: {
      title: "💕 Start Swiping! 💕",
      nope: "Nope",
      swipeLeft: "Swipe Left",
      like: "Like",
      swipeRight: "Swipe Right",
      tapToClose: "Tap anywhere to close"
    },
    
    // Swipe overlays
    likeOverlay: "LIKE",
    nopeOverlay: "NOPE",
    
    // Out of swipes modal
    outOfSwipes: {
      title: "You're out of swipes for today!",
      freeUserMessage: "Free users get 20 swipes per day. Come back tomorrow or upgrade to Premium for unlimited swipes!",
      premiumUserMessage: "Refreshing your matches...",
      upgradeButton: "Upgrade to Premium",
      okButton: "OK"
    },
    
    // Premium activation toast
    welcomeToPremium: {
      title: "Welcome to Premium!",
      description: "Your premium features are now active. Enjoy unlimited access!"
    },
    
    // Error messages
    errors: {
      loadFailed: "Failed to load potential matches. Please try again.",
      reverseFailed: "Could not reverse the dislike. Please try again.",
      likeFailed: "Failed to record like.",
      profileCompletionRequired: "Complete Your Profile",
      profileCompletionMessage: "You need {{percentage}}% more to continue swiping. Complete your profile to unlock more swipes!",
      dailyLimitReached: "Daily Limit Reached",
      dailyLimitMessage: "You have reached your swipe limit."
    },
    
    // Action buttons (in SwipeButtons component)
    actions: {
      pass: "Pass",
      reverse: "Undo",
      like: "Like",
      reversesLeft: "{{count}} undo left",
      reversesLeft_plural: "{{count}} undos left"
    }
  }
};

// Translations for French
const frTranslations = {
  discover: {
    title: "DripCheck",  // NOT TRANSLATED
    findingMatches: "Recherche de correspondances...",
    loadingProfiles: "Chargement des profils...",
    noMoreProfiles: "Plus de profils",
    noProfilesDescription: "Vous avez vu tous les profils disponibles. Revenez plus tard pour de nouvelles correspondances ! ou Ajustez vos préférences dans les paramètres pour plus de profils.",
    checkBackLater: "Revenez plus tard pour de nouvelles correspondances",
    adjustPreferences: "Ajustez vos préférences dans les paramètres pour plus de profils",
    refresh: "Actualiser",
    swipeGuide: {
      title: "💕 Commencez à swiper ! 💕",
      nope: "Non",
      swipeLeft: "Swiper à gauche",
      like: "J'aime",
      swipeRight: "Swiper à droite",
      tapToClose: "Appuyez n'importe où pour fermer"
    },
    likeOverlay: "J'AIME",
    nopeOverlay: "NON",
    outOfSwipes: {
      title: "Vous n'avez plus de swipes aujourd'hui !",
      freeUserMessage: "Les utilisateurs gratuits ont 20 swipes par jour. Revenez demain ou passez à Premium pour des swipes illimités !",
      premiumUserMessage: "Actualisation de vos correspondances...",
      upgradeButton: "Passer à Premium",
      okButton: "OK"
    },
    welcomeToPremium: {
      title: "Bienvenue à Premium !",
      description: "Vos fonctionnalités premium sont maintenant actives. Profitez d'un accès illimité !"
    },
    errors: {
      loadFailed: "Impossible de charger les correspondances potentielles. Veuillez réessayer.",
      reverseFailed: "Impossible d'annuler le refus. Veuillez réessayer.",
      likeFailed: "Impossible d'enregistrer le j'aime.",
      profileCompletionRequired: "Complétez votre profil",
      profileCompletionMessage: "Vous avez besoin de {{percentage}}% de plus pour continuer à swiper. Complétez votre profil pour débloquer plus de swipes !",
      dailyLimitReached: "Limite quotidienne atteinte",
      dailyLimitMessage: "Vous avez atteint votre limite de swipes."
    },
    actions: {
      pass: "Passer",
      reverse: "Annuler",
      like: "J'aime",
      reversesLeft: "{{count}} annulation restante",
      reversesLeft_plural: "{{count}} annulations restantes"
    }
  }
};

// Translations for German
const deTranslations = {
  discover: {
    title: "DripCheck",  // NOT TRANSLATED
    findingMatches: "Finde deine Übereinstimmungen...",
    loadingProfiles: "Profile werden geladen...",
    noMoreProfiles: "Keine weiteren Profile",
    noProfilesDescription: "Du hast alle verfügbaren Profile gesehen. Schau später für neue Übereinstimmungen vorbei! oder Passe deine Einstellungen an für mehr Profile.",
    checkBackLater: "Schau später für neue Übereinstimmungen vorbei",
    adjustPreferences: "Passe deine Einstellungen an für mehr Profile",
    refresh: "Aktualisieren",
    swipeGuide: {
      title: "💕 Fang an zu swipen! 💕",
      nope: "Nein",
      swipeLeft: "Nach links swipen",
      like: "Gefällt mir",
      swipeRight: "Nach rechts swipen",
      tapToClose: "Tippe irgendwo zum Schließen"
    },
    likeOverlay: "GEFÄLLT MIR",
    nopeOverlay: "NEIN",
    outOfSwipes: {
      title: "Du hast heute keine Swipes mehr!",
      freeUserMessage: "Kostenlose Nutzer erhalten 20 Swipes pro Tag. Komm morgen wieder oder upgrade auf Premium für unbegrenzte Swipes!",
      premiumUserMessage: "Aktualisiere deine Übereinstimmungen...",
      upgradeButton: "Auf Premium upgraden",
      okButton: "OK"
    },
    welcomeToPremium: {
      title: "Willkommen bei Premium!",
      description: "Deine Premium-Funktionen sind jetzt aktiv. Genieße unbegrenzten Zugang!"
    },
    errors: {
      loadFailed: "Potenzielle Übereinstimmungen konnten nicht geladen werden. Bitte versuche es erneut.",
      reverseFailed: "Ablehnung konnte nicht rückgängig gemacht werden. Bitte versuche es erneut.",
      likeFailed: "Like konnte nicht gespeichert werden.",
      profileCompletionRequired: "Vervollständige dein Profil",
      profileCompletionMessage: "Du brauchst {{percentage}}% mehr, um weiter zu swipen. Vervollständige dein Profil, um mehr Swipes freizuschalten!",
      dailyLimitReached: "Tageslimit erreicht",
      dailyLimitMessage: "Du hast dein Swipe-Limit erreicht."
    },
    actions: {
      pass: "Überspringen",
      reverse: "Rückgängig",
      like: "Gefällt mir",
      reversesLeft: "{{count}} Rückgängig übrig",
      reversesLeft_plural: "{{count}} Rückgängig übrig"
    }
  }
};

// Translations for Chinese
const zhTranslations = {
  discover: {
    title: "DripCheck",  // NOT TRANSLATED
    findingMatches: "正在寻找您的匹配...",
    loadingProfiles: "正在加载个人资料...",
    noMoreProfiles: "没有更多个人资料",
    noProfilesDescription: "您已查看所有可用个人资料。稍后再查看新的匹配！或在设置中调整您的偏好以获取更多个人资料。",
    checkBackLater: "稍后再查看新的匹配",
    adjustPreferences: "在设置中调整您的偏好以获取更多个人资料",
    refresh: "刷新",
    swipeGuide: {
      title: "💕 开始滑动！💕",
      nope: "不喜欢",
      swipeLeft: "向左滑动",
      like: "喜欢",
      swipeRight: "向右滑动",
      tapToClose: "点击任意位置关闭"
    },
    likeOverlay: "喜欢",
    nopeOverlay: "不喜欢",
    outOfSwipes: {
      title: "您今天的滑动次数已用完！",
      freeUserMessage: "免费用户每天有20次滑动。明天再来或升级到高级版以获得无限滑动！",
      premiumUserMessage: "正在刷新您的匹配...",
      upgradeButton: "升级到高级版",
      okButton: "确定"
    },
    welcomeToPremium: {
      title: "欢迎来到高级版！",
      description: "您的高级功能现已激活。享受无限访问！"
    },
    errors: {
      loadFailed: "无法加载潜在匹配。请重试。",
      reverseFailed: "无法撤销不喜欢。请重试。",
      likeFailed: "无法记录喜欢。",
      profileCompletionRequired: "完善您的个人资料",
      profileCompletionMessage: "您需要再完成{{percentage}}%才能继续滑动。完善您的个人资料以解锁更多滑动！",
      dailyLimitReached: "已达到每日限制",
      dailyLimitMessage: "您已达到滑动限制。"
    },
    actions: {
      pass: "跳过",
      reverse: "撤销",
      like: "喜欢",
      reversesLeft: "剩余{{count}}次撤销",
      reversesLeft_plural: "剩余{{count}}次撤销"
    }
  }
};

// Translations for Swahili
const swTranslations = {
  discover: {
    title: "DripCheck",  // NOT TRANSLATED
    findingMatches: "Kutafuta mechi zako...",
    loadingProfiles: "Inapakia wasifu...",
    noMoreProfiles: "Hakuna wasifu zaidi",
    noProfilesDescription: "Umeona wasifu zote zinazopatikana. Angalia tena baadaye kwa mechi mpya! au Rekebisha mapendeleo yako katika mipangilio kwa wasifu zaidi.",
    checkBackLater: "Angalia tena baadaye kwa mechi mpya",
    adjustPreferences: "Rekebisha mapendeleo yako katika mipangilio kwa wasifu zaidi",
    refresh: "Onyesha upya",
    swipeGuide: {
      title: "💕 Anza Kupapasa! 💕",
      nope: "Hapana",
      swipeLeft: "Papasa Kushoto",
      like: "Penda",
      swipeRight: "Papasa Kulia",
      tapToClose: "Gusa mahali popote kufunga"
    },
    likeOverlay: "PENDA",
    nopeOverlay: "HAPANA",
    outOfSwipes: {
      title: "Umekwisha kupapasa leo!",
      freeUserMessage: "Watumiaji wa bure wanapata kupapasa mara 20 kwa siku. Rudi kesho au boresha hadi Premium kwa kupapasa bila kikomo!",
      premiumUserMessage: "Kuonyesha upya mechi zako...",
      upgradeButton: "Boresha hadi Premium",
      okButton: "Sawa"
    },
    welcomeToPremium: {
      title: "Karibu kwa Premium!",
      description: "Huduma zako za premium sasa ni amilifu. Furahia ufikiaji usio na kikomo!"
    },
    errors: {
      loadFailed: "Imeshindwa kupakia mechi zinazowezekana. Tafadhali jaribu tena.",
      reverseFailed: "Haikuweza kurudisha kutopenda. Tafadhali jaribu tena.",
      likeFailed: "Imeshindwa kurekodi kupenda.",
      profileCompletionRequired: "Kamilisha Wasifu Wako",
      profileCompletionMessage: "Unahitaji {{percentage}}% zaidi kuendelea kupapasa. Kamilisha wasifu wako kufungua kupapasa zaidi!",
      dailyLimitReached: "Kikomo cha Kila Siku Kimefikiwa",
      dailyLimitMessage: "Umefikia kikomo chako cha kupapasa."
    },
    actions: {
      pass: "Ruka",
      reverse: "Rudisha",
      like: "Penda",
      reversesLeft: "{{count}} kurudisha iliyobaki",
      reversesLeft_plural: "{{count}} kurudisha zilizobaki"
    }
  }
};

// Translations for Portuguese
const ptTranslations = {
  discover: {
    title: "DripCheck",  // NOT TRANSLATED
    findingMatches: "Procurando suas correspondências...",
    loadingProfiles: "Carregando perfis...",
    noMoreProfiles: "Sem mais perfis",
    noProfilesDescription: "Você viu todos os perfis disponíveis. Volte mais tarde para novas correspondências! ou Ajuste suas preferências nas configurações para mais perfis.",
    checkBackLater: "Volte mais tarde para novas correspondências",
    adjustPreferences: "Ajuste suas preferências nas configurações para mais perfis",
    refresh: "Atualizar",
    swipeGuide: {
      title: "💕 Comece a deslizar! 💕",
      nope: "Não",
      swipeLeft: "Deslize para a esquerda",
      like: "Curtir",
      swipeRight: "Deslize para a direita",
      tapToClose: "Toque em qualquer lugar para fechar"
    },
    likeOverlay: "CURTIR",
    nopeOverlay: "NÃO",
    outOfSwipes: {
      title: "Você ficou sem deslizes para hoje!",
      freeUserMessage: "Usuários gratuitos têm 20 deslizes por dia. Volte amanhã ou atualize para Premium para deslizes ilimitados!",
      premiumUserMessage: "Atualizando suas correspondências...",
      upgradeButton: "Atualizar para Premium",
      okButton: "OK"
    },
    welcomeToPremium: {
      title: "Bem-vindo ao Premium!",
      description: "Seus recursos premium estão ativos agora. Aproveite o acesso ilimitado!"
    },
    errors: {
      loadFailed: "Falha ao carregar correspondências potenciais. Tente novamente.",
      reverseFailed: "Não foi possível reverter a rejeição. Tente novamente.",
      likeFailed: "Falha ao registrar curtida.",
      profileCompletionRequired: "Complete Seu Perfil",
      profileCompletionMessage: "Você precisa de mais {{percentage}}% para continuar deslizando. Complete seu perfil para desbloquear mais deslizes!",
      dailyLimitReached: "Limite Diário Atingido",
      dailyLimitMessage: "Você atingiu seu limite de deslizes."
    },
    actions: {
      pass: "Pular",
      reverse: "Desfazer",
      like: "Curtir",
      reversesLeft: "{{count}} desfazer restante",
      reversesLeft_plural: "{{count}} desfazeres restantes"
    }
  }
};

// Translations for Arabic
const arTranslations = {
  discover: {
    title: "DripCheck",  // NOT TRANSLATED
    findingMatches: "البحث عن تطابقاتك...",
    loadingProfiles: "تحميل الملفات الشخصية...",
    noMoreProfiles: "لا مزيد من الملفات الشخصية",
    noProfilesDescription: "لقد شاهدت جميع الملفات الشخصية المتاحة. تحقق لاحقًا للحصول على تطابقات جديدة! أو اضبط تفضيلاتك في الإعدادات للحصول على المزيد من الملفات الشخصية.",
    checkBackLater: "تحقق لاحقًا للحصول على تطابقات جديدة",
    adjustPreferences: "اضبط تفضيلاتك في الإعدادات للحصول على المزيد من الملفات الشخصية",
    refresh: "تحديث",
    swipeGuide: {
      title: "💕 ابدأ التمرير! 💕",
      nope: "لا",
      swipeLeft: "مرر لليسار",
      like: "أعجبني",
      swipeRight: "مرر لليمين",
      tapToClose: "اضغط في أي مكان للإغلاق"
    },
    likeOverlay: "أعجبني",
    nopeOverlay: "لا",
    outOfSwipes: {
      title: "انتهت عمليات التمرير لهذا اليوم!",
      freeUserMessage: "يحصل المستخدمون المجانيون على 20 تمريرة يوميًا. عد غدًا أو قم بالترقية إلى بريميوم للحصول على تمريرات غير محدودة!",
      premiumUserMessage: "تحديث تطابقاتك...",
      upgradeButton: "الترقية إلى بريميوم",
      okButton: "حسنًا"
    },
    welcomeToPremium: {
      title: "مرحبًا بك في بريميوم!",
      description: "ميزات بريميوم الخاصة بك نشطة الآن. استمتع بالوصول غير المحدود!"
    },
    errors: {
      loadFailed: "فشل تحميل التطابقات المحتملة. يرجى المحاولة مرة أخرى.",
      reverseFailed: "تعذر التراجع عن عدم الإعجاب. يرجى المحاولة مرة أخرى.",
      likeFailed: "فشل تسجيل الإعجاب.",
      profileCompletionRequired: "أكمل ملفك الشخصي",
      profileCompletionMessage: "تحتاج إلى {{percentage}}٪ أخرى للمتابعة في التمرير. أكمل ملفك الشخصي لفتح المزيد من التمريرات!",
      dailyLimitReached: "تم الوصول إلى الحد اليومي",
      dailyLimitMessage: "لقد وصلت إلى حد التمرير الخاص بك."
    },
    actions: {
      pass: "تخطي",
      reverse: "تراجع",
      like: "أعجبني",
      reversesLeft: "{{count}} تراجع متبقي",
      reversesLeft_plural: "{{count}} تراجعات متبقية"
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
    
    console.log(`✅ Updated ${code}.json with discover page translations`);
  } catch (error) {
    console.error(`❌ Error updating ${code}.json:`, error.message);
  }
});

console.log('\n🎉 All language files updated successfully!');
console.log('📌 Note: discover.title is set to "DripCheck" (NOT translated) in ALL languages');
