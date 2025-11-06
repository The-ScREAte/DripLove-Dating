const fs = require('fs');
const path = require('path');

function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const authExtras = {
  en: {
    auth: {
      sendResetEmail: "Send Reset Email",
      sendingResetEmail: "Sending Reset Email...",
      enterEmailForReset: "Enter your email to receive reset instructions",
      enterYourEmail: "Enter your email",
      enterYourPassword: "Enter your password",
      confirmYourPassword: "Confirm your password",
      processing: "Processing...",
      connecting: "Connecting...",
      continueWithGoogle: "Continue with Google",
      joinDripLoveToday: "Join DripLove today",
      accountAlreadyExists: "An account with this email already exists. Please sign in instead.",
      registrationFailed: "Registration Failed",
      loginError: "Login Error",
      registrationError: "Registration Error",
      unexpectedError: "An unexpected error occurred. Please try again.",
      accountBlocked: "Account Blocked",
      accountBlockedDesc: "Your account has been blocked.",
      accountOnHold: "Account On Hold",
      accountOnHoldDesc: "Your account is on hold. Please contact support.",
      authenticationCancelled: "Authentication Cancelled",
      googleSignInCancelled: "Google sign-in was cancelled.",
      authenticationError: "Authentication Error",
      failedToOpenGoogleSignIn: "Failed to open Google Sign-In popup",
      errors: {
        emailRequired: "Email is required",
        invalidEmail: "Please enter a valid email address",
        passwordRequired: "Password is required",
        passwordTooShort: "Password must be at least 6 characters long",
        confirmPasswordRequired: "Please confirm your password",
        passwordsDontMatch: "Passwords do not match",
        signInFailed: "Failed to sign in",
        signUpFailed: "Failed to create account",
        appleSignInFailed: "Failed to sign in with Apple",
        googleSignInFailed: "Failed to sign in with Google"
      }
    }
  },
  fr: {
    auth: {
      sendResetEmail: "Envoyer l'e-mail de réinitialisation",
      sendingResetEmail: "Envoi de l'e-mail de réinitialisation...",
      enterEmailForReset: "Entrez votre e-mail pour recevoir les instructions de réinitialisation",
      enterYourEmail: "Entrez votre e-mail",
      enterYourPassword: "Entrez votre mot de passe",
      confirmYourPassword: "Confirmez votre mot de passe",
      processing: "Traitement...",
      connecting: "Connexion...",
      continueWithGoogle: "Continuer avec Google",
      joinDripLoveToday: "Rejoignez DripLove aujourd'hui",
      accountAlreadyExists: "Un compte avec cet e-mail existe déjà. Veuillez vous connecter.",
      registrationFailed: "Échec de l'inscription",
      loginError: "Erreur de connexion",
      registrationError: "Erreur d'inscription",
      unexpectedError: "Une erreur inattendue s'est produite. Veuillez réessayer.",
      accountBlocked: "Compte bloqué",
      accountBlockedDesc: "Votre compte a été bloqué.",
      accountOnHold: "Compte en attente",
      accountOnHoldDesc: "Votre compte est en attente. Veuillez contacter le support.",
      authenticationCancelled: "Authentification annulée",
      googleSignInCancelled: "La connexion Google a été annulée.",
      authenticationError: "Erreur d'authentification",
      failedToOpenGoogleSignIn: "Échec de l'ouverture de la fenêtre de connexion Google",
      errors: {
        emailRequired: "L'e-mail est requis",
        invalidEmail: "Veuillez entrer une adresse e-mail valide",
        passwordRequired: "Le mot de passe est requis",
        passwordTooShort: "Le mot de passe doit contenir au moins 6 caractères",
        confirmPasswordRequired: "Veuillez confirmer votre mot de passe",
        passwordsDontMatch: "Les mots de passe ne correspondent pas",
        signInFailed: "Échec de la connexion",
        signUpFailed: "Échec de la création du compte",
        appleSignInFailed: "Échec de la connexion avec Apple",
        googleSignInFailed: "Échec de la connexion avec Google"
      }
    }
  },
  de: {
    auth: {
      sendResetEmail: "Zurücksetzen-E-Mail senden",
      sendingResetEmail: "Sende Zurücksetzen-E-Mail...",
      enterEmailForReset: "Geben Sie Ihre E-Mail-Adresse ein, um Anweisungen zum Zurücksetzen zu erhalten",
      enterYourEmail: "Geben Sie Ihre E-Mail ein",
      enterYourPassword: "Geben Sie Ihr Passwort ein",
      confirmYourPassword: "Bestätigen Sie Ihr Passwort",
      processing: "Verarbeitung...",
      connecting: "Verbindung...",
      continueWithGoogle: "Mit Google fortfahren",
      joinDripLoveToday: "Treten Sie DripLove heute bei",
      accountAlreadyExists: "Ein Konto mit dieser E-Mail existiert bereits. Bitte melden Sie sich an.",
      registrationFailed: "Registrierung fehlgeschlagen",
      loginError: "Anmeldefehler",
      registrationError: "Registrierungsfehler",
      unexpectedError: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
      accountBlocked: "Konto gesperrt",
      accountBlockedDesc: "Ihr Konto wurde gesperrt.",
      accountOnHold: "Konto zurückgestellt",
      accountOnHoldDesc: "Ihr Konto ist zurückgestellt. Bitte kontaktieren Sie den Support.",
      authenticationCancelled: "Authentifizierung abgebrochen",
      googleSignInCancelled: "Google-Anmeldung wurde abgebrochen.",
      authenticationError: "Authentifizierungsfehler",
      failedToOpenGoogleSignIn: "Google-Anmelde-Popup konnte nicht geöffnet werden",
      errors: {
        emailRequired: "E-Mail ist erforderlich",
        invalidEmail: "Bitte geben Sie eine gültige E-Mail-Adresse ein",
        passwordRequired: "Passwort ist erforderlich",
        passwordTooShort: "Das Passwort muss mindestens 6 Zeichen lang sein",
        confirmPasswordRequired: "Bitte bestätigen Sie Ihr Passwort",
        passwordsDontMatch: "Passwörter stimmen nicht überein",
        signInFailed: "Anmeldung fehlgeschlagen",
        signUpFailed: "Kontoerstellung fehlgeschlagen",
        appleSignInFailed: "Anmeldung mit Apple fehlgeschlagen",
        googleSignInFailed: "Anmeldung mit Google fehlgeschlagen"
      }
    }
  },
  zh: {
    auth: {
      sendResetEmail: "发送重置邮件",
      sendingResetEmail: "正在发送重置邮件...",
      enterEmailForReset: "输入您的电子邮件以接收重置说明",
      enterYourEmail: "输入您的电子邮件",
      enterYourPassword: "输入您的密码",
      confirmYourPassword: "确认您的密码",
      processing: "处理中...",
      connecting: "连接中...",
      continueWithGoogle: "使用 Google 继续",
      joinDripLoveToday: "立即加入 DripLove",
      accountAlreadyExists: "此电子邮件的帐户已存在。请登录。",
      registrationFailed: "注册失败",
      loginError: "登录错误",
      registrationError: "注册错误",
      unexpectedError: "发生意外错误。请重试。",
      accountBlocked: "帐户已被封锁",
      accountBlockedDesc: "您的帐户已被封锁。",
      accountOnHold: "帐户暂停",
      accountOnHoldDesc: "您的帐户已暂停。请联系支持。",
      authenticationCancelled: "身份验证已取消",
      googleSignInCancelled: "Google 登录已取消。",
      authenticationError: "身份验证错误",
      failedToOpenGoogleSignIn: "无法打开 Google 登录弹窗",
      errors: {
        emailRequired: "电子邮件是必需的",
        invalidEmail: "请输入有效的电子邮件地址",
        passwordRequired: "密码是必需的",
        passwordTooShort: "密码必须至少 6 个字符",
        confirmPasswordRequired: "请确认您的密码",
        passwordsDontMatch: "密码不匹配",
        signInFailed: "登录失败",
        signUpFailed: "创建帐户失败",
        appleSignInFailed: "使用 Apple 登录失败",
        googleSignInFailed: "使用 Google 登录失败"
      }
    }
  },
  sw: {
    auth: {
      sendResetEmail: "Tuma Barua pepe ya Kuweka Upya",
      sendingResetEmail: "Inatuma Barua pepe ya Kuweka Upya...",
      enterEmailForReset: "Ingiza barua pepe yako ili kupokea maagizo ya kuweka upya",
      enterYourEmail: "Ingiza barua pepe yako",
      enterYourPassword: "Ingiza nenosiri lako",
      confirmYourPassword: "Thibitisha nenosiri lako",
      processing: "Inachakata...",
      connecting: "Inaunganisha...",
      continueWithGoogle: "Endelea na Google",
      joinDripLoveToday: "Jiunge na DripLove leo",
      accountAlreadyExists: "Akaunti yenye barua pepe hii tayari ipo. Tafadhali ingia badala yake.",
      registrationFailed: "Usajili Umeshindikana",
      loginError: "Hitilafu ya Kuingia",
      registrationError: "Hitilafu ya Usajili",
      unexpectedError: "Hitilafu isiyotarajiwa imetokea. Tafadhali jaribu tena.",
      accountBlocked: "Akaunti Imezuiliwa",
      accountBlockedDesc: "Akaunti yako imezuiliwa.",
      accountOnHold: "Akaunti Imesimamishwa",
      accountOnHoldDesc: "Akaunti yako imesimamishwa. Tafadhali wasiliana na usaidizi.",
      authenticationCancelled: "Uthibitisho Umeghairiwa",
      googleSignInCancelled: "Kuingia kwa Google kumeghairiwa.",
      authenticationError: "Hitilafu ya Uthibitisho",
      failedToOpenGoogleSignIn: "Imeshindwa kufungua dirisha la kuingia kwa Google",
      errors: {
        emailRequired: "Barua pepe inahitajika",
        invalidEmail: "Tafadhali ingiza anwani halali ya barua pepe",
        passwordRequired: "Nenosiri linahitajika",
        passwordTooShort: "Nenosiri lazima liwe na angalau herufi 6",
        confirmPasswordRequired: "Tafadhali thibitisha nenosiri lako",
        passwordsDontMatch: "Nenosiri hazilingani",
        signInFailed: "Kuingia kumeshindikana",
        signUpFailed: "Kuunda akaunti kumeshindikana",
        appleSignInFailed: "Kuingia kwa Apple kumeshindikana",
        googleSignInFailed: "Kuingia kwa Google kumeshindikana"
      }
    }
  },
  pt: {
    auth: {
      sendResetEmail: "Enviar E-mail de Redefinição",
      sendingResetEmail: "Enviando E-mail de Redefinição...",
      enterEmailForReset: "Digite seu e-mail para receber instruções de redefinição",
      enterYourEmail: "Digite seu e-mail",
      enterYourPassword: "Digite sua senha",
      confirmYourPassword: "Confirme sua senha",
      processing: "Processando...",
      connecting: "Conectando...",
      continueWithGoogle: "Continuar com Google",
      joinDripLoveToday: "Junte-se ao DripLove hoje",
      accountAlreadyExists: "Uma conta com este e-mail já existe. Por favor, faça login.",
      registrationFailed: "Registro Falhou",
      loginError: "Erro de Login",
      registrationError: "Erro de Registro",
      unexpectedError: "Ocorreu um erro inesperado. Por favor, tente novamente.",
      accountBlocked: "Conta Bloqueada",
      accountBlockedDesc: "Sua conta foi bloqueada.",
      accountOnHold: "Conta Em Espera",
      accountOnHoldDesc: "Sua conta está em espera. Entre em contato com o suporte.",
      authenticationCancelled: "Autenticação Cancelada",
      googleSignInCancelled: "Login do Google foi cancelado.",
      authenticationError: "Erro de Autenticação",
      failedToOpenGoogleSignIn: "Falha ao abrir popup de login do Google",
      errors: {
        emailRequired: "E-mail é obrigatório",
        invalidEmail: "Por favor, insira um endereço de e-mail válido",
        passwordRequired: "Senha é obrigatória",
        passwordTooShort: "A senha deve ter pelo menos 6 caracteres",
        confirmPasswordRequired: "Por favor, confirme sua senha",
        passwordsDontMatch: "As senhas não correspondem",
        signInFailed: "Falha ao fazer login",
        signUpFailed: "Falha ao criar conta",
        appleSignInFailed: "Falha ao fazer login com Apple",
        googleSignInFailed: "Falha ao fazer login com Google"
      }
    }
  },
  ar: {
    auth: {
      sendResetEmail: "إرسال بريد إعادة التعيين",
      sendingResetEmail: "جارٍ إرسال بريد إعادة التعيين...",
      enterEmailForReset: "أدخل بريدك الإلكتروني لتلقي تعليمات إعادة التعيين",
      enterYourEmail: "أدخل بريدك الإلكتروني",
      enterYourPassword: "أدخل كلمة المرور",
      confirmYourPassword: "تأكيد كلمة المرور",
      processing: "جارٍ المعالجة...",
      connecting: "جارٍ الاتصال...",
      continueWithGoogle: "المتابعة مع Google",
      joinDripLoveToday: "انضم إلى DripLove اليوم",
      accountAlreadyExists: "يوجد حساب بهذا البريد الإلكتروني بالفعل. يرجى تسجيل الدخول بدلاً من ذلك.",
      registrationFailed: "فشل التسجيل",
      loginError: "خطأ في تسجيل الدخول",
      registrationError: "خطأ في التسجيل",
      unexpectedError: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
      accountBlocked: "الحساب محظور",
      accountBlockedDesc: "تم حظر حسابك.",
      accountOnHold: "الحساب معلق",
      accountOnHoldDesc: "حسابك معلق. يرجى الاتصال بالدعم.",
      authenticationCancelled: "تم إلغاء المصادقة",
      googleSignInCancelled: "تم إلغاء تسجيل الدخول بواسطة Google.",
      authenticationError: "خطأ في المصادقة",
      failedToOpenGoogleSignIn: "فشل فتح نافذة تسجيل الدخول بواسطة Google",
      errors: {
        emailRequired: "البريد الإلكتروني مطلوب",
        invalidEmail: "يرجى إدخال عنوان بريد إلكتروني صالح",
        passwordRequired: "كلمة المرور مطلوبة",
        passwordTooShort: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل",
        confirmPasswordRequired: "يرجى تأكيد كلمة المرور",
        passwordsDontMatch: "كلمات المرور غير متطابقة",
        signInFailed: "فشل تسجيل الدخول",
        signUpFailed: "فشل إنشاء الحساب",
        appleSignInFailed: "فشل تسجيل الدخول بواسطة Apple",
        googleSignInFailed: "فشل تسجيل الدخول بواسطة Google"
      }
    }
  }
};

const localesDir = path.join(__dirname, 'src', 'i18n', 'locales');

['en', 'fr', 'de', 'zh', 'sw', 'pt', 'ar'].forEach(lang => {
  const filePath = path.join(localesDir, `${lang}.json`);
  const existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  const updatedData = deepMerge(existingData, authExtras[lang]);
  
  fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2), 'utf8');
  console.log(`✅ Updated ${lang}.json with extra auth translations`);
});

console.log('\n✨ All language files updated successfully!');
