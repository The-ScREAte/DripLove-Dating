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

// New translations for dialogs and header
const newTranslations = {
  en: {
    common: {
      findYour: "Find Your",
      perfectMatch: "Perfect Match 💖",
      cancel: "Cancel",
      delete: "Delete"
    },
    report: {
      title: "Report",
      description: "Please select a reason and provide any details to help our moderation team.",
      reason: "Reason",
      selectReason: "Select reason",
      detailsOptional: "Details (optional)",
      addMoreInfo: "Add more info (optional)",
      submitReport: "Submit Report",
      reporting: "Reporting...",
      reasons: {
        spam: "Spam",
        nudity: "Nudity",
        abuse: "Abuse",
        hate: "Hate",
        harassment: "Harassment",
        fakeProfile: "Fake Profile",
        other: "Other"
      },
      submitted: "Report submitted",
      submittedDesc: "Thank you for helping keep the community safe.",
      errorMissingReporter: "Reporter id missing. Please sign in.",
      errorMissingReported: "Reported user id missing.",
      errorFailed: "Failed to submit report"
    },
    block: {
      title: "Block {{name}}?",
      description: "This user will no longer be able to see your profile or contact you. You won't see them in your discover feed either.",
      reasonOptional: "Reason (optional)",
      placeholder: "Tell us why you're blocking this user...",
      blockUser: "Block User",
      blocking: "Blocking...",
      blocked: "User blocked",
      blockedDesc: "{{name}} has been blocked",
      errorFailed: "Failed to block user"
    },
    deleteMessage: {
      confirmTitle: "Delete this message?",
      cancel: "Cancel",
      delete: "Delete"
    }
  },
  fr: {
    common: {
      findYour: "Trouvez Votre",
      perfectMatch: "Partenaire Parfait 💖",
      cancel: "Annuler",
      delete: "Supprimer"
    },
    report: {
      title: "Signaler",
      description: "Veuillez sélectionner une raison et fournir des détails pour aider notre équipe de modération.",
      reason: "Raison",
      selectReason: "Sélectionner une raison",
      detailsOptional: "Détails (facultatif)",
      addMoreInfo: "Ajouter plus d'informations (facultatif)",
      submitReport: "Envoyer le signalement",
      reporting: "Signalement en cours...",
      reasons: {
        spam: "Spam",
        nudity: "Nudité",
        abuse: "Abus",
        hate: "Haine",
        harassment: "Harcèlement",
        fakeProfile: "Faux profil",
        other: "Autre"
      },
      submitted: "Signalement envoyé",
      submittedDesc: "Merci d'aider à garder la communauté sûre.",
      errorMissingReporter: "ID du rapporteur manquant. Veuillez vous connecter.",
      errorMissingReported: "ID de l'utilisateur signalé manquant.",
      errorFailed: "Échec de l'envoi du signalement"
    },
    block: {
      title: "Bloquer {{name}} ?",
      description: "Cet utilisateur ne pourra plus voir votre profil ni vous contacter. Vous ne le verrez pas non plus dans votre fil de découverte.",
      reasonOptional: "Raison (facultatif)",
      placeholder: "Dites-nous pourquoi vous bloquez cet utilisateur...",
      blockUser: "Bloquer l'utilisateur",
      blocking: "Blocage en cours...",
      blocked: "Utilisateur bloqué",
      blockedDesc: "{{name}} a été bloqué",
      errorFailed: "Échec du blocage de l'utilisateur"
    },
    deleteMessage: {
      confirmTitle: "Supprimer ce message ?",
      cancel: "Annuler",
      delete: "Supprimer"
    }
  },
  de: {
    common: {
      findYour: "Finden Sie Ihren",
      perfectMatch: "Perfekten Partner 💖",
      cancel: "Abbrechen",
      delete: "Löschen"
    },
    report: {
      title: "Melden",
      description: "Bitte wählen Sie einen Grund und geben Sie Details an, um unserem Moderationsteam zu helfen.",
      reason: "Grund",
      selectReason: "Grund auswählen",
      detailsOptional: "Details (optional)",
      addMoreInfo: "Weitere Informationen hinzufügen (optional)",
      submitReport: "Meldung absenden",
      reporting: "Wird gemeldet...",
      reasons: {
        spam: "Spam",
        nudity: "Nacktheit",
        abuse: "Missbrauch",
        hate: "Hass",
        harassment: "Belästigung",
        fakeProfile: "Gefälschtes Profil",
        other: "Andere"
      },
      submitted: "Meldung eingereicht",
      submittedDesc: "Danke, dass Sie helfen, die Community sicher zu halten.",
      errorMissingReporter: "Reporter-ID fehlt. Bitte melden Sie sich an.",
      errorMissingReported: "ID des gemeldeten Benutzers fehlt.",
      errorFailed: "Meldung konnte nicht abgesendet werden"
    },
    block: {
      title: "{{name}} blockieren?",
      description: "Dieser Benutzer kann Ihr Profil nicht mehr sehen oder Sie kontaktieren. Sie werden ihn auch nicht in Ihrem Discover-Feed sehen.",
      reasonOptional: "Grund (optional)",
      placeholder: "Sagen Sie uns, warum Sie diesen Benutzer blockieren...",
      blockUser: "Benutzer blockieren",
      blocking: "Wird blockiert...",
      blocked: "Benutzer blockiert",
      blockedDesc: "{{name}} wurde blockiert",
      errorFailed: "Benutzer konnte nicht blockiert werden"
    },
    deleteMessage: {
      confirmTitle: "Diese Nachricht löschen?",
      cancel: "Abbrechen",
      delete: "Löschen"
    }
  },
  zh: {
    common: {
      findYour: "找到您的",
      perfectMatch: "完美伴侣 💖",
      cancel: "取消",
      delete: "删除"
    },
    report: {
      title: "举报",
      description: "请选择一个原因并提供任何详细信息以帮助我们的审核团队。",
      reason: "原因",
      selectReason: "选择原因",
      detailsOptional: "详情（可选）",
      addMoreInfo: "添加更多信息（可选）",
      submitReport: "提交举报",
      reporting: "正在举报...",
      reasons: {
        spam: "垃圾信息",
        nudity: "裸露",
        abuse: "滥用",
        hate: "仇恨",
        harassment: "骚扰",
        fakeProfile: "虚假个人资料",
        other: "其他"
      },
      submitted: "举报已提交",
      submittedDesc: "感谢您帮助保持社区安全。",
      errorMissingReporter: "举报者ID缺失。请登录。",
      errorMissingReported: "被举报用户ID缺失。",
      errorFailed: "提交举报失败"
    },
    block: {
      title: "屏蔽{{name}}？",
      description: "此用户将无法再查看您的个人资料或联系您。您也不会在发现页面中看到他们。",
      reasonOptional: "原因（可选）",
      placeholder: "告诉我们您为什么要屏蔽此用户...",
      blockUser: "屏蔽用户",
      blocking: "正在屏蔽...",
      blocked: "用户已屏蔽",
      blockedDesc: "{{name}}已被屏蔽",
      errorFailed: "屏蔽用户失败"
    },
    deleteMessage: {
      confirmTitle: "删除此消息？",
      cancel: "取消",
      delete: "删除"
    }
  },
  sw: {
    common: {
      findYour: "Pata",
      perfectMatch: "Mwenzi Wako Kamili 💖",
      cancel: "Ghairi",
      delete: "Futa"
    },
    report: {
      title: "Ripoti",
      description: "Tafadhali chagua sababu na utoe maelezo yoyote kusaidia timu yetu ya usimamizi.",
      reason: "Sababu",
      selectReason: "Chagua sababu",
      detailsOptional: "Maelezo (si lazima)",
      addMoreInfo: "Ongeza maelezo zaidi (si lazima)",
      submitReport: "Wasilisha Ripoti",
      reporting: "Inatuma ripoti...",
      reasons: {
        spam: "Spam",
        nudity: "Uchi",
        abuse: "Unyanyasaji",
        hate: "Chuki",
        harassment: "Udhia",
        fakeProfile: "Wasifu wa Uongo",
        other: "Nyingine"
      },
      submitted: "Ripoti imewasilishwa",
      submittedDesc: "Asante kwa kusaidia kuweka jumuiya salama.",
      errorMissingReporter: "Kitambulisho cha mripoti hakipatikani. Tafadhali ingia.",
      errorMissingReported: "Kitambulisho cha mtumiaji aliyeripotiwa hakipatikani.",
      errorFailed: "Imeshindwa kuwasilisha ripoti"
    },
    block: {
      title: "Zuia {{name}}?",
      description: "Mtumiaji huyu hataweza tena kuona wasifu wako au kuwasiliana nawe. Hutaweza kumwona katika ukurasa wako wa kugundua.",
      reasonOptional: "Sababu (si lazima)",
      placeholder: "Tuambie kwa nini unazuia mtumiaji huyu...",
      blockUser: "Zuia Mtumiaji",
      blocking: "Inazuia...",
      blocked: "Mtumiaji amezuiwa",
      blockedDesc: "{{name}} amezuiwa",
      errorFailed: "Imeshindwa kuzuia mtumiaji"
    },
    deleteMessage: {
      confirmTitle: "Futa ujumbe huu?",
      cancel: "Ghairi",
      delete: "Futa"
    }
  },
  pt: {
    common: {
      findYour: "Encontre Seu",
      perfectMatch: "Par Perfeito 💖",
      cancel: "Cancelar",
      delete: "Excluir"
    },
    report: {
      title: "Denunciar",
      description: "Por favor, selecione um motivo e forneça quaisquer detalhes para ajudar nossa equipe de moderação.",
      reason: "Motivo",
      selectReason: "Selecione o motivo",
      detailsOptional: "Detalhes (opcional)",
      addMoreInfo: "Adicione mais informações (opcional)",
      submitReport: "Enviar Denúncia",
      reporting: "Denunciando...",
      reasons: {
        spam: "Spam",
        nudity: "Nudez",
        abuse: "Abuso",
        hate: "Ódio",
        harassment: "Assédio",
        fakeProfile: "Perfil Falso",
        other: "Outro"
      },
      submitted: "Denúncia enviada",
      submittedDesc: "Obrigado por ajudar a manter a comunidade segura.",
      errorMissingReporter: "ID do denunciante ausente. Por favor, faça login.",
      errorMissingReported: "ID do usuário denunciado ausente.",
      errorFailed: "Falha ao enviar denúncia"
    },
    block: {
      title: "Bloquear {{name}}?",
      description: "Este usuário não poderá mais ver seu perfil ou entrar em contato com você. Você também não os verá em seu feed de descoberta.",
      reasonOptional: "Motivo (opcional)",
      placeholder: "Diga-nos por que você está bloqueando este usuário...",
      blockUser: "Bloquear Usuário",
      blocking: "Bloqueando...",
      blocked: "Usuário bloqueado",
      blockedDesc: "{{name}} foi bloqueado",
      errorFailed: "Falha ao bloquear usuário"
    },
    deleteMessage: {
      confirmTitle: "Excluir esta mensagem?",
      cancel: "Cancelar",
      delete: "Excluir"
    }
  },
  ar: {
    common: {
      findYour: "ابحث عن",
      perfectMatch: "شريكك المثالي 💖",
      cancel: "إلغاء",
      delete: "حذف"
    },
    report: {
      title: "إبلاغ",
      description: "يرجى تحديد سبب وتقديم أي تفاصيل لمساعدة فريق الإشراف لدينا.",
      reason: "السبب",
      selectReason: "اختر السبب",
      detailsOptional: "التفاصيل (اختياري)",
      addMoreInfo: "إضافة المزيد من المعلومات (اختياري)",
      submitReport: "إرسال البلاغ",
      reporting: "جاري الإبلاغ...",
      reasons: {
        spam: "بريد مزعج",
        nudity: "عري",
        abuse: "إساءة",
        hate: "كراهية",
        harassment: "مضايقة",
        fakeProfile: "ملف شخصي مزيف",
        other: "آخر"
      },
      submitted: "تم إرسال البلاغ",
      submittedDesc: "شكرًا لمساعدتك في الحفاظ على أمان المجتمع.",
      errorMissingReporter: "معرف المبلغ مفقود. يرجى تسجيل الدخول.",
      errorMissingReported: "معرف المستخدم المبلغ عنه مفقود.",
      errorFailed: "فشل إرسال البلاغ"
    },
    block: {
      title: "حظر {{name}}؟",
      description: "لن يتمكن هذا المستخدم بعد الآن من رؤية ملفك الشخصي أو الاتصال بك. لن تراهم أيضًا في خلاصة الاكتشاف الخاصة بك.",
      reasonOptional: "السبب (اختياري)",
      placeholder: "أخبرنا لماذا تحظر هذا المستخدم...",
      blockUser: "حظر المستخدم",
      blocking: "جاري الحظر...",
      blocked: "تم حظر المستخدم",
      blockedDesc: "تم حظر {{name}}",
      errorFailed: "فشل حظر المستخدم"
    },
    deleteMessage: {
      confirmTitle: "حذف هذه الرسالة؟",
      cancel: "إلغاء",
      delete: "حذف"
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
