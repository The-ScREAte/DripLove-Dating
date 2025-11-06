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
    registration: {
      photosChecked: "All photos are automatically checked for appropriateness",
      uploadPhotosLabel: "Upload Photos (Minimum 2 required)",
      photoGuidelines: "Photo Guidelines:",
      clearPhotoFace: "Clear photo showing your face",
      appropriateClothing: "Appropriate clothing required",
      noExplicit: "No explicit or inappropriate content",
      borderlineMayReview: "Borderline content may require admin review",
      back: "Back",
      creatingAccount: "Creating Account...",
      continue: "Continue",
      addPhoto: "Add Photo",
      createAccount: "Create Account",
      alreadyHaveAccount: "Already have an account? Sign In",
      // Error messages for photo validation
      uploadAtLeastTwoPhotos: "Please upload at least 2 photos to complete registration.",
      removeRejectedImages: "Please remove rejected images before continuing.",
      reuploadTwoPhotos: "Please re-upload your 2 photos to complete registration."
    }
  },
  fr: {
    registration: {
      photosChecked: "Toutes les photos sont automatiquement vérifiées pour leur pertinence",
      uploadPhotosLabel: "Télécharger des Photos (Minimum 2 requis)",
      photoGuidelines: "Directives pour les photos :",
      clearPhotoFace: "Photo claire montrant votre visage",
      appropriateClothing: "Vêtements appropriés requis",
      noExplicit: "Aucun contenu explicite ou inapproprié",
      borderlineMayReview: "Le contenu limite peut nécessiter une révision par l'administrateur",
      back: "Retour",
      creatingAccount: "Création du compte...",
      continue: "Continuer",
      addPhoto: "Ajouter une photo",
      createAccount: "Créer un compte",
      alreadyHaveAccount: "Vous avez déjà un compte ? Connexion",
      uploadAtLeastTwoPhotos: "Veuillez télécharger au moins 2 photos pour terminer l'inscription.",
      removeRejectedImages: "Veuillez supprimer les images rejetées avant de continuer.",
      reuploadTwoPhotos: "Veuillez télécharger à nouveau vos 2 photos pour terminer l'inscription."
    }
  },
  de: {
    registration: {
      photosChecked: "Alle Fotos werden automatisch auf Angemessenheit überprüft",
      uploadPhotosLabel: "Fotos hochladen (Mindestens 2 erforderlich)",
      photoGuidelines: "Foto-Richtlinien:",
      clearPhotoFace: "Klares Foto, das Ihr Gesicht zeigt",
      appropriateClothing: "Angemessene Kleidung erforderlich",
      noExplicit: "Keine expliziten oder unangemessenen Inhalte",
      borderlineMayReview: "Grenzwertige Inhalte können eine Admin-Überprüfung erfordern",
      back: "Zurück",
      creatingAccount: "Konto wird erstellt...",
      continue: "Weiter",
      addPhoto: "Foto hinzufügen",
      createAccount: "Konto erstellen",
      alreadyHaveAccount: "Haben Sie bereits ein Konto? Anmelden",
      uploadAtLeastTwoPhotos: "Bitte laden Sie mindestens 2 Fotos hoch, um die Registrierung abzuschließen.",
      removeRejectedImages: "Bitte entfernen Sie abgelehnte Bilder, bevor Sie fortfahren.",
      reuploadTwoPhotos: "Bitte laden Sie Ihre 2 Fotos erneut hoch, um die Registrierung abzuschließen."
    }
  },
  zh: {
    registration: {
      photosChecked: "所有照片都会自动检查是否合适",
      uploadPhotosLabel: "上传照片（至少需要2张）",
      photoGuidelines: "照片指南：",
      clearPhotoFace: "清晰的面部照片",
      appropriateClothing: "需要穿着得体",
      noExplicit: "禁止露骨或不当内容",
      borderlineMayReview: "边缘内容可能需要管理员审核",
      back: "返回",
      creatingAccount: "正在创建账户...",
      continue: "继续",
      addPhoto: "添加照片",
      createAccount: "创建账户",
      alreadyHaveAccount: "已有账户？登录",
      uploadAtLeastTwoPhotos: "请至少上传2张照片以完成注册。",
      removeRejectedImages: "请在继续之前删除被拒绝的图片。",
      reuploadTwoPhotos: "请重新上传您的2张照片以完成注册。"
    }
  },
  sw: {
    registration: {
      photosChecked: "Picha zote zinakaguliwa kiotomatiki kwa ukweli",
      uploadPhotosLabel: "Pakia Picha (Angalau 2 zinahitajika)",
      photoGuidelines: "Miongozo ya Picha:",
      clearPhotoFace: "Picha wazi inayoonyesha uso wako",
      appropriateClothing: "Mavazi yanayofaa yanahitajika",
      noExplicit: "Hakuna maudhui ya wazi au yasiyo ya kufaa",
      borderlineMayReview: "Maudhui ya mpaka yanaweza kuhitaji ukaguzi wa msimamizi",
      back: "Rudi",
      creatingAccount: "Inaunda Akaunti...",
      continue: "Endelea",
      addPhoto: "Ongeza Picha",
      createAccount: "Unda Akaunti",
      alreadyHaveAccount: "Tayari una akaunti? Ingia",
      uploadAtLeastTwoPhotos: "Tafadhali pakia angalau picha 2 kukamilisha usajili.",
      removeRejectedImages: "Tafadhali ondoa picha zilizokataliwa kabla ya kuendelea.",
      reuploadTwoPhotos: "Tafadhali pakia tena picha zako 2 kukamilisha usajili."
    }
  },
  pt: {
    registration: {
      photosChecked: "Todas as fotos são verificadas automaticamente quanto à adequação",
      uploadPhotosLabel: "Carregar Fotos (Mínimo 2 necessário)",
      photoGuidelines: "Diretrizes para Fotos:",
      clearPhotoFace: "Foto clara mostrando seu rosto",
      appropriateClothing: "Roupas apropriadas necessárias",
      noExplicit: "Sem conteúdo explícito ou inadequado",
      borderlineMayReview: "Conteúdo limítrofe pode exigir revisão do administrador",
      back: "Voltar",
      creatingAccount: "Criando Conta...",
      continue: "Continuar",
      addPhoto: "Adicionar Foto",
      createAccount: "Criar Conta",
      alreadyHaveAccount: "Já tem uma conta? Entrar",
      uploadAtLeastTwoPhotos: "Por favor, carregue pelo menos 2 fotos para completar o registro.",
      removeRejectedImages: "Por favor, remova as imagens rejeitadas antes de continuar.",
      reuploadTwoPhotos: "Por favor, carregue novamente suas 2 fotos para completar o registro."
    }
  },
  ar: {
    registration: {
      photosChecked: "يتم فحص جميع الصور تلقائيًا للتأكد من ملاءمتها",
      uploadPhotosLabel: "تحميل الصور (الحد الأدنى 2 مطلوب)",
      photoGuidelines: "إرشادات الصور:",
      clearPhotoFace: "صورة واضحة تظهر وجهك",
      appropriateClothing: "الملابس المناسبة مطلوبة",
      noExplicit: "لا محتوى فاضح أو غير لائق",
      borderlineMayReview: "قد يتطلب المحتوى الحدي مراجعة المسؤول",
      back: "رجوع",
      creatingAccount: "جارٍ إنشاء الحساب...",
      continue: "متابعة",
      addPhoto: "إضافة صورة",
      createAccount: "إنشاء حساب",
      alreadyHaveAccount: "هل لديك حساب بالفعل؟ تسجيل الدخول",
      uploadAtLeastTwoPhotos: "يرجى تحميل صورتين على الأقل لإكمال التسجيل.",
      removeRejectedImages: "يرجى إزالة الصور المرفوضة قبل المتابعة.",
      reuploadTwoPhotos: "يرجى إعادة تحميل صورتيك لإكمال التسجيل."
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

console.log('✅ Updated en.json, fr.json, de.json, zh.json, sw.json, pt.json, ar.json with registration photo translations');
