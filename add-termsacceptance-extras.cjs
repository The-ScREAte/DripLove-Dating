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
    termsAcceptance: {
      title: "Terms & Conditions",
      cardTitle: "Terms and Conditions",
      cardDescription: "Please review and accept our terms and conditions to continue using our service",
      subtitle: "Please review and accept our terms",
      iAgree: "I agree to the",
      termsOfService: "Terms of Service",
      and: "and",
      privacyPolicy: "Privacy Policy",
      mustAccept: "Agreement Required",
      accept: "Accept Terms & Continue",
      decline: "Decline",
      processing: "Processing...",
      agreementText: "I have read and understand the Terms and Conditions above. I agree to comply with all terms and acknowledge that violation of these terms may result in account suspension or termination. I am at least 18 years old and legally able to enter into this agreement.",
      acknowledgment: "By clicking \"Accept Terms & Continue\", you acknowledge that you have read, understood, and agree to be bound by these terms and conditions.",
      termsAccepted: "Terms Accepted",
      thankYou: "Thank you for accepting our terms of service. You may now proceed to use our platform.",
      error: "Error",
      failedToSave: "Failed to save your agreement. Please try again."
    }
  },
  fr: {
    termsAcceptance: {
      title: "Termes & Conditions",
      cardTitle: "Termes et Conditions",
      cardDescription: "Veuillez consulter et accepter nos termes et conditions pour continuer à utiliser notre service",
      subtitle: "Veuillez consulter et accepter nos termes",
      iAgree: "J'accepte les",
      termsOfService: "Conditions d'Utilisation",
      and: "et",
      privacyPolicy: "Politique de Confidentialité",
      mustAccept: "Accord Requis",
      accept: "Accepter les Conditions & Continuer",
      decline: "Refuser",
      processing: "Traitement en cours...",
      agreementText: "J'ai lu et compris les Termes et Conditions ci-dessus. J'accepte de me conformer à tous les termes et reconnais que la violation de ces termes peut entraîner la suspension ou la résiliation du compte. J'ai au moins 18 ans et je suis juridiquement capable de conclure cet accord.",
      acknowledgment: "En cliquant sur \"Accepter les Conditions & Continuer\", vous reconnaissez avoir lu, compris et accepté d'être lié par ces termes et conditions.",
      termsAccepted: "Conditions Acceptées",
      thankYou: "Merci d'avoir accepté nos conditions d'utilisation. Vous pouvez maintenant utiliser notre plateforme.",
      error: "Erreur",
      failedToSave: "Échec de l'enregistrement de votre accord. Veuillez réessayer."
    }
  },
  de: {
    termsAcceptance: {
      title: "Geschäftsbedingungen",
      cardTitle: "Geschäftsbedingungen",
      cardDescription: "Bitte lesen und akzeptieren Sie unsere Geschäftsbedingungen, um unseren Service weiterhin nutzen zu können",
      subtitle: "Bitte lesen und akzeptieren Sie unsere Bedingungen",
      iAgree: "Ich stimme den",
      termsOfService: "Nutzungsbedingungen",
      and: "und",
      privacyPolicy: "Datenschutzrichtlinie",
      mustAccept: "Zustimmung Erforderlich",
      accept: "Bedingungen Akzeptieren & Fortfahren",
      decline: "Ablehnen",
      processing: "Wird verarbeitet...",
      agreementText: "Ich habe die oben genannten Geschäftsbedingungen gelesen und verstanden. Ich stimme zu, alle Bedingungen einzuhalten und erkenne an, dass die Verletzung dieser Bedingungen zur Sperrung oder Kündigung des Kontos führen kann. Ich bin mindestens 18 Jahre alt und rechtlich in der Lage, diese Vereinbarung abzuschließen.",
      acknowledgment: "Durch Klicken auf \"Bedingungen Akzeptieren & Fortfahren\" bestätigen Sie, dass Sie diese Geschäftsbedingungen gelesen, verstanden und akzeptiert haben.",
      termsAccepted: "Bedingungen Akzeptiert",
      thankYou: "Vielen Dank für die Annahme unserer Nutzungsbedingungen. Sie können nun unsere Plattform nutzen.",
      error: "Fehler",
      failedToSave: "Ihre Zustimmung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut."
    }
  },
  zh: {
    termsAcceptance: {
      title: "条款与条件",
      cardTitle: "条款与条件",
      cardDescription: "请查看并接受我们的条款和条件以继续使用我们的服务",
      subtitle: "请查看并接受我们的条款",
      iAgree: "我同意",
      termsOfService: "服务条款",
      and: "和",
      privacyPolicy: "隐私政策",
      mustAccept: "需要同意",
      accept: "接受条款并继续",
      decline: "拒绝",
      processing: "处理中...",
      agreementText: "我已阅读并理解上述条款与条件。我同意遵守所有条款，并承认违反这些条款可能导致账户暂停或终止。我至少年满18岁，并且在法律上有能力签订此协议。",
      acknowledgment: '点击"接受条款并继续"即表示您确认已阅读、理解并同意受这些条款和条件的约束。',
      termsAccepted: "条款已接受",
      thankYou: "感谢您接受我们的服务条款。您现在可以继续使用我们的平台。",
      error: "错误",
      failedToSave: "无法保存您的同意。请重试。"
    }
  },
  sw: {
    termsAcceptance: {
      title: "Masharti na Masharti",
      cardTitle: "Masharti na Masharti",
      cardDescription: "Tafadhali soma na ukubali masharti na masharti yetu ili kuendelea kutumia huduma yetu",
      subtitle: "Tafadhali soma na ukubali masharti yetu",
      iAgree: "Ninakubali",
      termsOfService: "Masharti ya Huduma",
      and: "na",
      privacyPolicy: "Sera ya Faragha",
      mustAccept: "Makubaliano Yanahitajika",
      accept: "Kubali Masharti & Endelea",
      decline: "Kataa",
      processing: "Inachakata...",
      agreementText: "Nimesoma na kuelewa Masharti na Masharti hapo juu. Ninakubali kuzingatia masharti yote na nikakiri kwamba kuvunja masharti haya kunaweza kusababisha kusimamishwa au kufutwa kwa akaunti. Nina angalau umri wa miaka 18 na ninaweza kisheria kuingia mkataba huu.",
      acknowledgment: "Kwa kubofya \"Kubali Masharti & Endelea\", unakiri kuwa umesoma, umeelewa, na unakubali kufungwa na masharti na masharti haya.",
      termsAccepted: "Masharti Yamekubaliwa",
      thankYou: "Asante kwa kukubali masharti yetu ya huduma. Sasa unaweza kuendelea kutumia jukwaa letu.",
      error: "Kosa",
      failedToSave: "Imeshindwa kuhifadhi makubaliano yako. Tafadhali jaribu tena."
    }
  },
  pt: {
    termsAcceptance: {
      title: "Termos & Condições",
      cardTitle: "Termos e Condições",
      cardDescription: "Por favor, revise e aceite nossos termos e condições para continuar usando nosso serviço",
      subtitle: "Por favor, revise e aceite nossos termos",
      iAgree: "Eu concordo com os",
      termsOfService: "Termos de Serviço",
      and: "e",
      privacyPolicy: "Política de Privacidade",
      mustAccept: "Acordo Necessário",
      accept: "Aceitar Termos & Continuar",
      decline: "Recusar",
      processing: "Processando...",
      agreementText: "Li e entendi os Termos e Condições acima. Concordo em cumprir todos os termos e reconheço que a violação destes termos pode resultar na suspensão ou encerramento da conta. Tenho pelo menos 18 anos e sou legalmente capaz de celebrar este acordo.",
      acknowledgment: "Ao clicar em \"Aceitar Termos & Continuar\", você reconhece que leu, entendeu e concorda em estar vinculado por estes termos e condições.",
      termsAccepted: "Termos Aceitos",
      thankYou: "Obrigado por aceitar nossos termos de serviço. Você agora pode usar nossa plataforma.",
      error: "Erro",
      failedToSave: "Falha ao salvar seu acordo. Por favor, tente novamente."
    }
  },
  ar: {
    termsAcceptance: {
      title: "الشروط والأحكام",
      cardTitle: "الشروط والأحكام",
      cardDescription: "يرجى مراجعة وقبول شروطنا وأحكامنا لمواصلة استخدام خدمتنا",
      subtitle: "يرجى مراجعة وقبول شروطنا",
      iAgree: "أوافق على",
      termsOfService: "شروط الخدمة",
      and: "و",
      privacyPolicy: "سياسة الخصوصية",
      mustAccept: "الموافقة مطلوبة",
      accept: "قبول الشروط والمتابعة",
      decline: "رفض",
      processing: "جارٍ المعالجة...",
      agreementText: "لقد قرأت وفهمت الشروط والأحكام أعلاه. أوافق على الالتزام بجميع الشروط وأقر بأن انتهاك هذه الشروط قد يؤدي إلى تعليق الحساب أو إنهائه. أنا على الأقل 18 عامًا وقادر قانونيًا على الدخول في هذا الاتفاق.",
      acknowledgment: "بالنقر على \"قبول الشروط والمتابعة\"، فإنك تقر بأنك قد قرأت وفهمت ووافقت على الالتزام بهذه الشروط والأحكام.",
      termsAccepted: "تم قبول الشروط",
      thankYou: "شكرًا لك على قبول شروط خدمتنا. يمكنك الآن المتابعة لاستخدام منصتنا.",
      error: "خطأ",
      failedToSave: "فشل في حفظ موافقتك. يرجى المحاولة مرة أخرى."
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

console.log('✅ Updated en.json, fr.json, de.json, zh.json, sw.json, pt.json, ar.json with extra terms acceptance translations');
