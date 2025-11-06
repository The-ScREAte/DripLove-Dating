const fs = require('fs');
const path = require('path');

// Define the base translations (English)
const modalTranslations = {
  // Report Modal translations
  reportModal: {
    title: "Report Image",
    instruction: "Please select a reason for reporting this image:",
    reasons: {
      inappropriate: "Inappropriate content",
      fake: "Fake profile",
      spam: "Spam or scam",
      offensive: "Offensive language",
      harassment: "Harassment",
      other: "Other"
    },
    blockSection: {
      title: "Block this user (optional):",
      placeholder: "Reason for blocking (optional)",
      blockButton: "Block User",
      blocking: "Blocking..."
    },
    reportButton: "Report Image",
    reporting: "Reporting...",
    cancel: "Cancel",
    selectReason: "Please select a reason for reporting",
    error: "Failed to report. Please try again.",
    success: "Reported! Thank you.",
    blockSuccess: {
      title: "Blocked!",
      message: "Now swipe away and they won't show again."
    }
  },
  // User Profile Modal translations
  userProfileModal: {
    title: "{{name}}'s Profile",
    description: "View detailed profile information, photos, and interests.",
    yearsOld: "{{age}} years old",
    photos: "Photos ({{count}})",
    sections: {
      lookingFor: "Looking For",
      lifestyle: "Lifestyle",
      workEducation: "Work & Education",
      personality: "Personality",
      funFacts: "Fun Facts",
      interests: "Interests"
    },
    lookingFor: {
      interestedIn: "Interested in:",
      lookingFor: "Looking for:"
    },
    lifestyle: {
      smoking: "Smoking:",
      drinking: "Drinking:",
      exercise: "Exercise:",
      sleep: "Sleep:"
    },
    workEducation: {
      occupation: "Occupation:",
      industry: "Industry:",
      education: "Education:"
    },
    personality: {
      introvert: "Introvert",
      extrovert: "Extrovert",
      planner: "Planner",
      spontaneous: "Spontaneous",
      organized: "Organized",
      messy: "Messy"
    },
    funFacts: {
      funFact: "Fun fact about me:",
      perfectDate: "My perfect first date:",
      lastGoogled: "Last thing I googled:"
    },
    loading: "Loading profile...",
    notFound: "Profile not found",
    unavailable: "This user's profile is not available or has been removed."
  }
};

// Translations for all languages
const translations = {
  en: modalTranslations,
  
  fr: {
    reportModal: {
      title: "Signaler l'image",
      instruction: "Veuillez sélectionner une raison pour signaler cette image :",
      reasons: {
        inappropriate: "Contenu inapproprié",
        fake: "Faux profil",
        spam: "Spam ou arnaque",
        offensive: "Langage offensant",
        harassment: "Harcèlement",
        other: "Autre"
      },
      blockSection: {
        title: "Bloquer cet utilisateur (optionnel) :",
        placeholder: "Raison du blocage (optionnel)",
        blockButton: "Bloquer l'utilisateur",
        blocking: "Blocage en cours..."
      },
      reportButton: "Signaler l'image",
      reporting: "Signalement en cours...",
      cancel: "Annuler",
      selectReason: "Veuillez sélectionner une raison pour signaler",
      error: "Échec du signalement. Veuillez réessayer.",
      success: "Signalé ! Merci.",
      blockSuccess: {
        title: "Bloqué !",
        message: "Maintenant, balayez et ils ne s'afficheront plus."
      }
    },
    userProfileModal: {
      title: "Profil de {{name}}",
      description: "Voir les informations détaillées du profil, les photos et les intérêts.",
      yearsOld: "{{age}} ans",
      photos: "Photos ({{count}})",
      sections: {
        lookingFor: "Recherche",
        lifestyle: "Style de vie",
        workEducation: "Travail et éducation",
        personality: "Personnalité",
        funFacts: "Anecdotes amusantes",
        interests: "Intérêts"
      },
      lookingFor: {
        interestedIn: "Intéressé par :",
        lookingFor: "Recherche :"
      },
      lifestyle: {
        smoking: "Fumer :",
        drinking: "Boire :",
        exercise: "Exercice :",
        sleep: "Sommeil :"
      },
      workEducation: {
        occupation: "Profession :",
        industry: "Secteur :",
        education: "Éducation :"
      },
      personality: {
        introvert: "Introverti",
        extrovert: "Extraverti",
        planner: "Planificateur",
        spontaneous: "Spontané",
        organized: "Organisé",
        messy: "Désordonné"
      },
      funFacts: {
        funFact: "Fait amusant à mon sujet :",
        perfectDate: "Mon premier rendez-vous parfait :",
        lastGoogled: "Dernière chose que j'ai googlée :"
      },
      loading: "Chargement du profil...",
      notFound: "Profil non trouvé",
      unavailable: "Le profil de cet utilisateur n'est pas disponible ou a été supprimé."
    }
  },
  
  de: {
    reportModal: {
      title: "Bild melden",
      instruction: "Bitte wählen Sie einen Grund für die Meldung dieses Bildes:",
      reasons: {
        inappropriate: "Unangemessener Inhalt",
        fake: "Gefälschtes Profil",
        spam: "Spam oder Betrug",
        offensive: "Beleidigende Sprache",
        harassment: "Belästigung",
        other: "Andere"
      },
      blockSection: {
        title: "Diesen Benutzer blockieren (optional):",
        placeholder: "Grund für Blockierung (optional)",
        blockButton: "Benutzer blockieren",
        blocking: "Wird blockiert..."
      },
      reportButton: "Bild melden",
      reporting: "Wird gemeldet...",
      cancel: "Abbrechen",
      selectReason: "Bitte wählen Sie einen Grund für die Meldung",
      error: "Meldung fehlgeschlagen. Bitte versuchen Sie es erneut.",
      success: "Gemeldet! Vielen Dank.",
      blockSuccess: {
        title: "Blockiert!",
        message: "Wischen Sie jetzt weg und sie werden nicht mehr angezeigt."
      }
    },
    userProfileModal: {
      title: "{{name}}s Profil",
      description: "Detaillierte Profilinformationen, Fotos und Interessen anzeigen.",
      yearsOld: "{{age}} Jahre alt",
      photos: "Fotos ({{count}})",
      sections: {
        lookingFor: "Sucht",
        lifestyle: "Lebensstil",
        workEducation: "Arbeit und Bildung",
        personality: "Persönlichkeit",
        funFacts: "Lustige Fakten",
        interests: "Interessen"
      },
      lookingFor: {
        interestedIn: "Interessiert an:",
        lookingFor: "Sucht:"
      },
      lifestyle: {
        smoking: "Rauchen:",
        drinking: "Trinken:",
        exercise: "Bewegung:",
        sleep: "Schlaf:"
      },
      workEducation: {
        occupation: "Beruf:",
        industry: "Branche:",
        education: "Bildung:"
      },
      personality: {
        introvert: "Introvertiert",
        extrovert: "Extrovertiert",
        planner: "Planer",
        spontaneous: "Spontan",
        organized: "Organisiert",
        messy: "Unordentlich"
      },
      funFacts: {
        funFact: "Lustiger Fakt über mich:",
        perfectDate: "Mein perfektes erstes Date:",
        lastGoogled: "Zuletzt gegoogelt:"
      },
      loading: "Profil wird geladen...",
      notFound: "Profil nicht gefunden",
      unavailable: "Das Profil dieses Benutzers ist nicht verfügbar oder wurde entfernt."
    }
  },
  
  zh: {
    reportModal: {
      title: "举报图片",
      instruction: "请选择举报此图片的原因：",
      reasons: {
        inappropriate: "不当内容",
        fake: "虚假资料",
        spam: "垃圾邮件或诈骗",
        offensive: "冒犯性语言",
        harassment: "骚扰",
        other: "其他"
      },
      blockSection: {
        title: "屏蔽此用户（可选）：",
        placeholder: "屏蔽原因（可选）",
        blockButton: "屏蔽用户",
        blocking: "屏蔽中..."
      },
      reportButton: "举报图片",
      reporting: "举报中...",
      cancel: "取消",
      selectReason: "请选择举报原因",
      error: "举报失败。请重试。",
      success: "已举报！谢谢。",
      blockSuccess: {
        title: "已屏蔽！",
        message: "现在向左滑动，他们将不再显示。"
      }
    },
    userProfileModal: {
      title: "{{name}}的资料",
      description: "查看详细的个人资料信息、照片和兴趣。",
      yearsOld: "{{age}}岁",
      photos: "照片（{{count}}）",
      sections: {
        lookingFor: "寻找",
        lifestyle: "生活方式",
        workEducation: "工作与教育",
        personality: "性格",
        funFacts: "趣事",
        interests: "兴趣"
      },
      lookingFor: {
        interestedIn: "感兴趣：",
        lookingFor: "寻找："
      },
      lifestyle: {
        smoking: "吸烟：",
        drinking: "饮酒：",
        exercise: "运动：",
        sleep: "睡眠："
      },
      workEducation: {
        occupation: "职业：",
        industry: "行业：",
        education: "教育："
      },
      personality: {
        introvert: "内向",
        extrovert: "外向",
        planner: "计划型",
        spontaneous: "随性",
        organized: "有条理",
        messy: "凌乱"
      },
      funFacts: {
        funFact: "关于我的趣事：",
        perfectDate: "我的完美初次约会：",
        lastGoogled: "最后搜索的内容："
      },
      loading: "正在加载资料...",
      notFound: "未找到资料",
      unavailable: "此用户的资料不可用或已被删除。"
    }
  },
  
  sw: {
    reportModal: {
      title: "Ripoti Picha",
      instruction: "Tafadhali chagua sababu ya kuripoti picha hii:",
      reasons: {
        inappropriate: "Maudhui yasiyofaa",
        fake: "Wasifu wa uwongo",
        spam: "Taarifa za spam au ulaghai",
        offensive: "Lugha ya matukano",
        harassment: "Unyanyasaji",
        other: "Nyingine"
      },
      blockSection: {
        title: "Zuia mtumiaji huyu (hiari):",
        placeholder: "Sababu ya kuzuia (hiari)",
        blockButton: "Zuia Mtumiaji",
        blocking: "Inazuia..."
      },
      reportButton: "Ripoti Picha",
      reporting: "Inaripoti...",
      cancel: "Ghairi",
      selectReason: "Tafadhali chagua sababu ya kuripoti",
      error: "Imeshindwa kuripoti. Tafadhali jaribu tena.",
      success: "Imeripotiwa! Asante.",
      blockSuccess: {
        title: "Imezuiwa!",
        message: "Sasa piga kwa kuswipe na hawataonekana tena."
      }
    },
    userProfileModal: {
      title: "Wasifu wa {{name}}",
      description: "Angalia maelezo kamili ya wasifu, picha na mapendeleo.",
      yearsOld: "Miaka {{age}}",
      photos: "Picha ({{count}})",
      sections: {
        lookingFor: "Anatafuta",
        lifestyle: "Mtindo wa Maisha",
        workEducation: "Kazi na Elimu",
        personality: "Utu",
        funFacts: "Ukweli wa Kufurahisha",
        interests: "Mapendeleo"
      },
      lookingFor: {
        interestedIn: "Anavutiwa na:",
        lookingFor: "Anatafuta:"
      },
      lifestyle: {
        smoking: "Kuvuta sigara:",
        drinking: "Kunywa pombe:",
        exercise: "Mazoezi:",
        sleep: "Usingizi:"
      },
      workEducation: {
        occupation: "Kazi:",
        industry: "Sekta:",
        education: "Elimu:"
      },
      personality: {
        introvert: "Mtu wa ndani",
        extrovert: "Mtu wa nje",
        planner: "Mpanga",
        spontaneous: "Mtu wa ghafla",
        organized: "Aliyopangwa",
        messy: "Mchanganyiko"
      },
      funFacts: {
        funFact: "Ukweli wa kufurahisha kunihusu:",
        perfectDate: "Tarehe yangu kamili ya kwanza:",
        lastGoogled: "Kitu cha mwisho nilichotafuta kwenye Google:"
      },
      loading: "Inapakia wasifu...",
      notFound: "Wasifu haujapatikana",
      unavailable: "Wasifu wa mtumiaji huyu haupatikani au umeondolewa."
    }
  },
  
  pt: {
    reportModal: {
      title: "Denunciar Imagem",
      instruction: "Por favor, selecione um motivo para denunciar esta imagem:",
      reasons: {
        inappropriate: "Conteúdo inapropriado",
        fake: "Perfil falso",
        spam: "Spam ou golpe",
        offensive: "Linguagem ofensiva",
        harassment: "Assédio",
        other: "Outro"
      },
      blockSection: {
        title: "Bloquear este usuário (opcional):",
        placeholder: "Motivo do bloqueio (opcional)",
        blockButton: "Bloquear Usuário",
        blocking: "Bloqueando..."
      },
      reportButton: "Denunciar Imagem",
      reporting: "Denunciando...",
      cancel: "Cancelar",
      selectReason: "Por favor, selecione um motivo para denunciar",
      error: "Falha ao denunciar. Por favor, tente novamente.",
      success: "Denunciado! Obrigado.",
      blockSuccess: {
        title: "Bloqueado!",
        message: "Agora deslize para longe e eles não aparecerão novamente."
      }
    },
    userProfileModal: {
      title: "Perfil de {{name}}",
      description: "Ver informações detalhadas do perfil, fotos e interesses.",
      yearsOld: "{{age}} anos",
      photos: "Fotos ({{count}})",
      sections: {
        lookingFor: "Procurando",
        lifestyle: "Estilo de Vida",
        workEducation: "Trabalho e Educação",
        personality: "Personalidade",
        funFacts: "Curiosidades",
        interests: "Interesses"
      },
      lookingFor: {
        interestedIn: "Interessado em:",
        lookingFor: "Procurando:"
      },
      lifestyle: {
        smoking: "Fumar:",
        drinking: "Beber:",
        exercise: "Exercício:",
        sleep: "Sono:"
      },
      workEducation: {
        occupation: "Ocupação:",
        industry: "Indústria:",
        education: "Educação:"
      },
      personality: {
        introvert: "Introvertido",
        extrovert: "Extrovertido",
        planner: "Planejador",
        spontaneous: "Espontâneo",
        organized: "Organizado",
        messy: "Desorganizado"
      },
      funFacts: {
        funFact: "Fato divertido sobre mim:",
        perfectDate: "Meu primeiro encontro perfeito:",
        lastGoogled: "Última coisa que pesquisei no Google:"
      },
      loading: "Carregando perfil...",
      notFound: "Perfil não encontrado",
      unavailable: "O perfil deste usuário não está disponível ou foi removido."
    }
  },
  
  ar: {
    reportModal: {
      title: "الإبلاغ عن الصورة",
      instruction: "الرجاء تحديد سبب الإبلاغ عن هذه الصورة:",
      reasons: {
        inappropriate: "محتوى غير لائق",
        fake: "ملف تعريف مزيف",
        spam: "رسائل غير مرغوب فيها أو احتيال",
        offensive: "لغة مسيئة",
        harassment: "مضايقة",
        other: "أخرى"
      },
      blockSection: {
        title: "حظر هذا المستخدم (اختياري):",
        placeholder: "سبب الحظر (اختياري)",
        blockButton: "حظر المستخدم",
        blocking: "جاري الحظر..."
      },
      reportButton: "الإبلاغ عن الصورة",
      reporting: "جاري الإبلاغ...",
      cancel: "إلغاء",
      selectReason: "الرجاء تحديد سبب الإبلاغ",
      error: "فشل الإبلاغ. يرجى المحاولة مرة أخرى.",
      success: "تم الإبلاغ! شكراً لك.",
      blockSuccess: {
        title: "تم الحظر!",
        message: "الآن اسحب بعيداً ولن يظهروا مرة أخرى."
      }
    },
    userProfileModal: {
      title: "ملف {{name}} الشخصي",
      description: "عرض معلومات الملف الشخصي التفصيلية والصور والاهتمامات.",
      yearsOld: "{{age}} سنة",
      photos: "الصور ({{count}})",
      sections: {
        lookingFor: "يبحث عن",
        lifestyle: "نمط الحياة",
        workEducation: "العمل والتعليم",
        personality: "الشخصية",
        funFacts: "حقائق ممتعة",
        interests: "الاهتمامات"
      },
      lookingFor: {
        interestedIn: "مهتم بـ:",
        lookingFor: "يبحث عن:"
      },
      lifestyle: {
        smoking: "التدخين:",
        drinking: "الشرب:",
        exercise: "التمارين:",
        sleep: "النوم:"
      },
      workEducation: {
        occupation: "المهنة:",
        industry: "الصناعة:",
        education: "التعليم:"
      },
      personality: {
        introvert: "انطوائي",
        extrovert: "انبساطي",
        planner: "مخطط",
        spontaneous: "تلقائي",
        organized: "منظم",
        messy: "فوضوي"
      },
      funFacts: {
        funFact: "حقيقة ممتعة عني:",
        perfectDate: "موعدي الأول المثالي:",
        lastGoogled: "آخر شيء بحثت عنه في جوجل:"
      },
      loading: "جاري تحميل الملف الشخصي...",
      notFound: "الملف الشخصي غير موجود",
      unavailable: "ملف هذا المستخدم غير متاح أو تمت إزالته."
    }
  }
};

// Deep merge function
function deepMerge(target, source) {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// Process each language file
const localesDir = path.join(__dirname, 'src', 'i18n', 'locales');
const languages = ['en', 'fr', 'de', 'zh', 'sw', 'pt', 'ar'];

languages.forEach(lang => {
  const filePath = path.join(localesDir, `${lang}.json`);
  
  try {
    // Read existing translations
    const existingTranslations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Merge with new translations
    const updatedTranslations = deepMerge(existingTranslations, translations[lang]);
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(updatedTranslations, null, 2), 'utf8');
    console.log(`✅ Updated ${lang}.json with modal translations`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
});

console.log('\n✨ All language files updated successfully!');
