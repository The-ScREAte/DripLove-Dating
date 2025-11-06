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

// New translations for chat components
const newTranslations = {
  en: {
    chat: {
      report: "Report",
      blockUser: "Block User",
      typeMessage: "Type a message...",
      deleteForMe: "Delete for me",
      deleteForEveryone: "Delete for everyone",
      activeOnDripLove: "Active on DripLove",
      inappropriateLanguage: "Your message contains inappropriate language. Please remove it.",
      addEmoji: "Add emoji",
      sendMessage: "Send message",
      moreOptions: "More options",
      goBack: "Go back to chat list"
    },
    common: {
      findYourPerfectMatch: "Find Your Perfect Match"
    }
  },
  fr: {
    chat: {
      report: "Signaler",
      blockUser: "Bloquer l'utilisateur",
      typeMessage: "Tapez un message...",
      deleteForMe: "Supprimer pour moi",
      deleteForEveryone: "Supprimer pour tout le monde",
      activeOnDripLove: "Actif sur DripLove",
      inappropriateLanguage: "Votre message contient un langage inapproprié. Veuillez le supprimer.",
      addEmoji: "Ajouter un emoji",
      sendMessage: "Envoyer le message",
      moreOptions: "Plus d'options",
      goBack: "Retour à la liste des conversations"
    },
    common: {
      findYourPerfectMatch: "Trouvez Votre Partenaire Parfait"
    }
  },
  de: {
    chat: {
      report: "Melden",
      blockUser: "Benutzer blockieren",
      typeMessage: "Nachricht eingeben...",
      deleteForMe: "Für mich löschen",
      deleteForEveryone: "Für alle löschen",
      activeOnDripLove: "Aktiv auf DripLove",
      inappropriateLanguage: "Ihre Nachricht enthält unangemessene Sprache. Bitte entfernen Sie sie.",
      addEmoji: "Emoji hinzufügen",
      sendMessage: "Nachricht senden",
      moreOptions: "Weitere Optionen",
      goBack: "Zurück zur Chat-Liste"
    },
    common: {
      findYourPerfectMatch: "Finden Sie Ihren Perfekten Partner"
    }
  },
  zh: {
    chat: {
      report: "举报",
      blockUser: "屏蔽用户",
      typeMessage: "输入消息...",
      deleteForMe: "为我删除",
      deleteForEveryone: "为所有人删除",
      activeOnDripLove: "在DripLove上活跃",
      inappropriateLanguage: "您的消息包含不当语言。请删除它。",
      addEmoji: "添加表情符号",
      sendMessage: "发送消息",
      moreOptions: "更多选项",
      goBack: "返回聊天列表"
    },
    common: {
      findYourPerfectMatch: "找到您的完美伴侣"
    }
  },
  sw: {
    chat: {
      report: "Ripoti",
      blockUser: "Zuia Mtumiaji",
      typeMessage: "Andika ujumbe...",
      deleteForMe: "Futa kwa ajili yangu",
      deleteForEveryone: "Futa kwa kila mtu",
      activeOnDripLove: "Hai kwenye DripLove",
      inappropriateLanguage: "Ujumbe wako una lugha isiyofaa. Tafadhali uondoe.",
      addEmoji: "Ongeza emoji",
      sendMessage: "Tuma ujumbe",
      moreOptions: "Chaguo zaidi",
      goBack: "Rudi kwenye orodha ya mazungumzo"
    },
    common: {
      findYourPerfectMatch: "Pata Mwenzi Wako Kamili"
    }
  },
  pt: {
    chat: {
      report: "Denunciar",
      blockUser: "Bloquear usuário",
      typeMessage: "Digite uma mensagem...",
      deleteForMe: "Excluir para mim",
      deleteForEveryone: "Excluir para todos",
      activeOnDripLove: "Ativo no DripLove",
      inappropriateLanguage: "Sua mensagem contém linguagem inapropriada. Por favor, remova-a.",
      addEmoji: "Adicionar emoji",
      sendMessage: "Enviar mensagem",
      moreOptions: "Mais opções",
      goBack: "Voltar à lista de conversas"
    },
    common: {
      findYourPerfectMatch: "Encontre Seu Par Perfeito"
    }
  },
  ar: {
    chat: {
      report: "إبلاغ",
      blockUser: "حظر المستخدم",
      typeMessage: "اكتب رسالة...",
      deleteForMe: "حذف بالنسبة لي",
      deleteForEveryone: "حذف للجميع",
      activeOnDripLove: "نشط على DripLove",
      inappropriateLanguage: "تحتوي رسالتك على لغة غير لائقة. يرجى إزالتها.",
      addEmoji: "إضافة رمز تعبيري",
      sendMessage: "إرسال رسالة",
      moreOptions: "المزيد من الخيارات",
      goBack: "العودة إلى قائمة الدردشة"
    },
    common: {
      findYourPerfectMatch: "ابحث عن شريكك المثالي"
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
