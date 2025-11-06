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

// New translations for ChatPage
const newTranslations = {
  en: {
    chat: {
      newMatches: "New Matches",
      noConversations: "No conversations yet",
      cannotSendToAdmin: "Cannot send message",
      cannotSendToAdminDesc: "You cannot send messages to admin accounts.",
      failedToSend: "Failed to send message. Please try again.",
      notSupported: "Not Supported",
      notSupportedDesc: "This browser does not support notifications.",
      permissionDenied: "Permission Denied",
      permissionDeniedDesc: "Notifications are blocked. Please enable them in your browser settings.",
      permissionRequired: "Permission Required",
      permissionRequiredDesc: "Please allow notifications to receive message alerts.",
      testSuccessful: "Test Successful! 🎉",
      testSuccessfulDesc: "You should see a notification. Message alerts are now enabled.",
      testFailed: "Test Failed",
      testFailedDesc: "Something went wrong testing notifications.",
      error: "Error",
      pullToRefresh: "Pull to refresh",
      releaseToRefresh: "Release to refresh",
      refreshing: "Refreshing..."
    }
  },
  fr: {
    chat: {
      newMatches: "Nouveaux Matchs",
      noConversations: "Aucune conversation pour le moment",
      cannotSendToAdmin: "Impossible d'envoyer un message",
      cannotSendToAdminDesc: "Vous ne pouvez pas envoyer de messages aux comptes administrateurs.",
      failedToSend: "Échec de l'envoi du message. Veuillez réessayer.",
      notSupported: "Non pris en charge",
      notSupportedDesc: "Ce navigateur ne prend pas en charge les notifications.",
      permissionDenied: "Permission refusée",
      permissionDeniedDesc: "Les notifications sont bloquées. Veuillez les activer dans les paramètres de votre navigateur.",
      permissionRequired: "Permission requise",
      permissionRequiredDesc: "Veuillez autoriser les notifications pour recevoir des alertes de messages.",
      testSuccessful: "Test réussi ! 🎉",
      testSuccessfulDesc: "Vous devriez voir une notification. Les alertes de messages sont maintenant activées.",
      testFailed: "Test échoué",
      testFailedDesc: "Une erreur s'est produite lors du test des notifications.",
      error: "Erreur",
      pullToRefresh: "Tirez pour actualiser",
      releaseToRefresh: "Relâchez pour actualiser",
      refreshing: "Actualisation..."
    }
  },
  de: {
    chat: {
      newMatches: "Neue Matches",
      noConversations: "Noch keine Gespräche",
      cannotSendToAdmin: "Nachricht kann nicht gesendet werden",
      cannotSendToAdminDesc: "Sie können keine Nachrichten an Admin-Konten senden.",
      failedToSend: "Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
      notSupported: "Nicht unterstützt",
      notSupportedDesc: "Dieser Browser unterstützt keine Benachrichtigungen.",
      permissionDenied: "Berechtigung verweigert",
      permissionDeniedDesc: "Benachrichtigungen sind blockiert. Bitte aktivieren Sie sie in Ihren Browsereinstellungen.",
      permissionRequired: "Berechtigung erforderlich",
      permissionRequiredDesc: "Bitte erlauben Sie Benachrichtigungen, um Nachrichtenalarme zu erhalten.",
      testSuccessful: "Test erfolgreich! 🎉",
      testSuccessfulDesc: "Sie sollten eine Benachrichtigung sehen. Nachrichtenalarme sind jetzt aktiviert.",
      testFailed: "Test fehlgeschlagen",
      testFailedDesc: "Beim Testen der Benachrichtigungen ist etwas schief gelaufen.",
      error: "Fehler",
      pullToRefresh: "Ziehen zum Aktualisieren",
      releaseToRefresh: "Loslassen zum Aktualisieren",
      refreshing: "Aktualisierung..."
    }
  },
  zh: {
    chat: {
      newMatches: "新配对",
      noConversations: "暂无对话",
      cannotSendToAdmin: "无法发送消息",
      cannotSendToAdminDesc: "您无法向管理员账户发送消息。",
      failedToSend: "发送消息失败。请重试。",
      notSupported: "不支持",
      notSupportedDesc: "此浏览器不支持通知。",
      permissionDenied: "权限被拒绝",
      permissionDeniedDesc: "通知已被屏蔽。请在浏览器设置中启用它们。",
      permissionRequired: "需要权限",
      permissionRequiredDesc: "请允许通知以接收消息提醒。",
      testSuccessful: "测试成功！🎉",
      testSuccessfulDesc: "您应该看到一个通知。消息提醒现已启用。",
      testFailed: "测试失败",
      testFailedDesc: "测试通知时出错。",
      error: "错误",
      pullToRefresh: "下拉刷新",
      releaseToRefresh: "释放以刷新",
      refreshing: "刷新中..."
    }
  },
  sw: {
    chat: {
      newMatches: "Mechi Mpya",
      noConversations: "Bado hakuna mazungumzo",
      cannotSendToAdmin: "Haiwezi kutuma ujumbe",
      cannotSendToAdminDesc: "Huwezi kutuma ujumbe kwa akaunti za msimamizi.",
      failedToSend: "Imeshindwa kutuma ujumbe. Tafadhali jaribu tena.",
      notSupported: "Haitumiki",
      notSupportedDesc: "Kivinjari hiki hakitumii arifa.",
      permissionDenied: "Ruhusa imekataliwa",
      permissionDeniedDesc: "Arifa zimezuiliwa. Tafadhali ziwezesha katika mipangilio ya kivinjari chako.",
      permissionRequired: "Ruhusa inahitajika",
      permissionRequiredDesc: "Tafadhali ruhusu arifa ili kupokea tahadhari za ujumbe.",
      testSuccessful: "Jaribio limefanikiwa! 🎉",
      testSuccessfulDesc: "Unapaswa kuona arifa. Tahadhari za ujumbe sasa zimewezesha.",
      testFailed: "Jaribio limeshindwa",
      testFailedDesc: "Kuna kitu kimeenda vibaya wakati wa kujaribu arifa.",
      error: "Hitilafu",
      pullToRefresh: "Vuta ili kuonyesha upya",
      releaseToRefresh: "Achia ili kuonyesha upya",
      refreshing: "Inaonyesha upya..."
    }
  },
  pt: {
    chat: {
      newMatches: "Novos Matches",
      noConversations: "Ainda não há conversas",
      cannotSendToAdmin: "Não é possível enviar mensagem",
      cannotSendToAdminDesc: "Você não pode enviar mensagens para contas de administrador.",
      failedToSend: "Falha ao enviar mensagem. Por favor, tente novamente.",
      notSupported: "Não suportado",
      notSupportedDesc: "Este navegador não suporta notificações.",
      permissionDenied: "Permissão negada",
      permissionDeniedDesc: "As notificações estão bloqueadas. Por favor, ative-as nas configurações do navegador.",
      permissionRequired: "Permissão necessária",
      permissionRequiredDesc: "Por favor, permita notificações para receber alertas de mensagens.",
      testSuccessful: "Teste bem-sucedido! 🎉",
      testSuccessfulDesc: "Você deve ver uma notificação. Alertas de mensagens agora estão ativados.",
      testFailed: "Teste falhou",
      testFailedDesc: "Algo deu errado ao testar notificações.",
      error: "Erro",
      pullToRefresh: "Puxe para atualizar",
      releaseToRefresh: "Solte para atualizar",
      refreshing: "Atualizando..."
    }
  },
  ar: {
    chat: {
      newMatches: "تطابقات جديدة",
      noConversations: "لا توجد محادثات بعد",
      cannotSendToAdmin: "لا يمكن إرسال رسالة",
      cannotSendToAdminDesc: "لا يمكنك إرسال رسائل إلى حسابات المسؤولين.",
      failedToSend: "فشل إرسال الرسالة. يرجى المحاولة مرة أخرى.",
      notSupported: "غير مدعوم",
      notSupportedDesc: "هذا المتصفح لا يدعم الإشعارات.",
      permissionDenied: "تم رفض الإذن",
      permissionDeniedDesc: "الإشعارات محظورة. يرجى تمكينها في إعدادات المتصفح.",
      permissionRequired: "مطلوب إذن",
      permissionRequiredDesc: "يرجى السماح بالإشعارات لتلقي تنبيهات الرسائل.",
      testSuccessful: "نجح الاختبار! 🎉",
      testSuccessfulDesc: "يجب أن ترى إشعارًا. تم تمكين تنبيهات الرسائل الآن.",
      testFailed: "فشل الاختبار",
      testFailedDesc: "حدث خطأ أثناء اختبار الإشعارات.",
      error: "خطأ",
      pullToRefresh: "اسحب للتحديث",
      releaseToRefresh: "حرر للتحديث",
      refreshing: "جاري التحديث..."
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
