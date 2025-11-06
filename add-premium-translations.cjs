const fs = require('fs');
const path = require('path');

// Define the base translations (English)
const premiumTranslations = {
  premium: {
    back: "Back",
    premiumPlan: "Premium Plan",
    freePlan: "Free Plan",
    mostPopular: "⭐ MOST POPULAR",
    oneTimePayment: "One-time payment - Lifetime access",
    monthlySubscription: "Monthly subscription - Cancel anytime",
    basicFeaturesOnly: "Basic features only",
    features: {
      unlimitedSwipes: {
        name: "Unlimited Daily Swipes",
        free: "12 per day",
        premium: "Unlimited"
      },
      reverseDislikes: {
        name: "Reverse Dislikes",
        free: "2 per day",
        premium: "Unlimited"
      },
      seeWhoLiked: {
        name: "See All Who Liked You",
        free: "1 visible",
        premium: "All visible"
      },
      prioritySupport: {
        name: "Priority Support",
        free: "Standard",
        premium: "Priority"
      },
      allFutureFeatures: {
        name: "All Future Features",
        premium: "Included forever!"
      }
    },
    upgradeButton: "Upgrade to Premium Now",
    restorePurchases: "Already purchased? Restore",
    restoringPurchases: "Restoring purchases...",
    limitedFeatures: "Limited features • Basic support",
    trustIndicators: {
      joinMembers: "✨ Join 10,000+ happy premium members",
      sslSecured: "🔒 SSL Secured",
      safePayments: "💳 Safe Payments",
      mobileOptimized: "📱 Mobile Optimized"
    },
    paymentOptions: {
      title: "Choose Payment Option",
      iap: {
        button: "🍎 Subscribe Now",
        processing: "🍎 Processing...",
        subtitle: "In-App Purchase • Secure & Fast",
        disclosure: "Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Payment will be charged to your Apple ID account at confirmation of purchase. You can manage and cancel your subscription in your account settings on the App Store after purchase."
      },
      loading: {
        title: "Connecting to App Store...",
        message: "Please wait while we check for in-app purchases."
      },
      unavailable: {
        title: "In-App Purchase Temporarily Unavailable",
        message: "We're having trouble connecting right now. Please try again in a moment, or contact support if the issue persists."
      },
      monthly: {
        button: "💳 Monthly Subscription",
        subtitle: "Cancel anytime"
      },
      oneTime: {
        button: "🎯 One-Time Payment",
        subtitle: "No auto-renewal"
      }
    }
  }
};

// Translations for all languages
const translations = {
  en: premiumTranslations,
  
  fr: {
    premium: {
      back: "Retour",
      premiumPlan: "Plan Premium",
      freePlan: "Plan Gratuit",
      mostPopular: "⭐ LE PLUS POPULAIRE",
      oneTimePayment: "Paiement unique - Accès à vie",
      monthlySubscription: "Abonnement mensuel - Annuler à tout moment",
      basicFeaturesOnly: "Fonctionnalités de base uniquement",
      features: {
        unlimitedSwipes: {
          name: "Swipes quotidiens illimités",
          free: "12 par jour",
          premium: "Illimité"
        },
        reverseDislikes: {
          name: "Inverser les rejets",
          free: "2 par jour",
          premium: "Illimité"
        },
        seeWhoLiked: {
          name: "Voir tous ceux qui vous ont aimé",
          free: "1 visible",
          premium: "Tous visibles"
        },
        prioritySupport: {
          name: "Support prioritaire",
          free: "Standard",
          premium: "Prioritaire"
        },
        allFutureFeatures: {
          name: "Toutes les fonctionnalités futures",
          premium: "Inclus pour toujours !"
        }
      },
      upgradeButton: "Passer au Premium maintenant",
      restorePurchases: "Déjà acheté ? Restaurer",
      restoringPurchases: "Restauration des achats...",
      limitedFeatures: "Fonctionnalités limitées • Support de base",
      trustIndicators: {
        joinMembers: "✨ Rejoignez plus de 10 000 membres premium satisfaits",
        sslSecured: "🔒 SSL sécurisé",
        safePayments: "💳 Paiements sécurisés",
        mobileOptimized: "📱 Optimisé pour mobile"
      },
      paymentOptions: {
        title: "Choisir l'option de paiement",
        iap: {
          button: "🍎 S'abonner maintenant",
          processing: "🍎 Traitement...",
          subtitle: "Achat intégré • Sécurisé et rapide",
          disclosure: "L'abonnement se renouvelle automatiquement sauf si le renouvellement automatique est désactivé au moins 24 heures avant la fin de la période en cours. Le paiement sera débité de votre compte Apple ID lors de la confirmation de l'achat. Vous pouvez gérer et annuler votre abonnement dans les paramètres de votre compte sur l'App Store après l'achat."
        },
        loading: {
          title: "Connexion à l'App Store...",
          message: "Veuillez patienter pendant que nous vérifions les achats intégrés."
        },
        unavailable: {
          title: "Achat intégré temporairement indisponible",
          message: "Nous avons des difficultés à nous connecter. Veuillez réessayer dans un instant ou contacter le support si le problème persiste."
        },
        monthly: {
          button: "💳 Abonnement mensuel",
          subtitle: "Annuler à tout moment"
        },
        oneTime: {
          button: "🎯 Paiement unique",
          subtitle: "Pas de renouvellement automatique"
        }
      }
    }
  },
  
  de: {
    premium: {
      back: "Zurück",
      premiumPlan: "Premium-Plan",
      freePlan: "Kostenloser Plan",
      mostPopular: "⭐ AM BELIEBTESTEN",
      oneTimePayment: "Einmalige Zahlung - Lebenslanger Zugang",
      monthlySubscription: "Monatliches Abonnement - Jederzeit kündbar",
      basicFeaturesOnly: "Nur Basisfunktionen",
      features: {
        unlimitedSwipes: {
          name: "Unbegrenzte tägliche Swipes",
          free: "12 pro Tag",
          premium: "Unbegrenzt"
        },
        reverseDislikes: {
          name: "Dislikes rückgängig machen",
          free: "2 pro Tag",
          premium: "Unbegrenzt"
        },
        seeWhoLiked: {
          name: "Alle sehen, die dich gemocht haben",
          free: "1 sichtbar",
          premium: "Alle sichtbar"
        },
        prioritySupport: {
          name: "Vorrangiger Support",
          free: "Standard",
          premium: "Vorrangig"
        },
        allFutureFeatures: {
          name: "Alle zukünftigen Funktionen",
          premium: "Für immer inklusive!"
        }
      },
      upgradeButton: "Jetzt auf Premium upgraden",
      restorePurchases: "Bereits gekauft? Wiederherstellen",
      restoringPurchases: "Käufe werden wiederhergestellt...",
      limitedFeatures: "Eingeschränkte Funktionen • Basis-Support",
      trustIndicators: {
        joinMembers: "✨ Schließen Sie sich über 10.000 zufriedenen Premium-Mitgliedern an",
        sslSecured: "🔒 SSL-gesichert",
        safePayments: "💳 Sichere Zahlungen",
        mobileOptimized: "📱 Für Mobilgeräte optimiert"
      },
      paymentOptions: {
        title: "Zahlungsoption wählen",
        iap: {
          button: "🍎 Jetzt abonnieren",
          processing: "🍎 Verarbeitung...",
          subtitle: "In-App-Kauf • Sicher und schnell",
          disclosure: "Das Abonnement verlängert sich automatisch, es sei denn, die automatische Verlängerung wird mindestens 24 Stunden vor Ende des aktuellen Zeitraums deaktiviert. Die Zahlung wird bei Kaufbestätigung Ihrem Apple ID-Konto belastet. Sie können Ihr Abonnement nach dem Kauf in Ihren Kontoeinstellungen im App Store verwalten und kündigen."
        },
        loading: {
          title: "Verbindung zum App Store...",
          message: "Bitte warten Sie, während wir In-App-Käufe prüfen."
        },
        unavailable: {
          title: "In-App-Kauf vorübergehend nicht verfügbar",
          message: "Wir haben momentan Verbindungsprobleme. Bitte versuchen Sie es in einem Moment erneut oder kontaktieren Sie den Support, wenn das Problem weiterhin besteht."
        },
        monthly: {
          button: "💳 Monatliches Abonnement",
          subtitle: "Jederzeit kündbar"
        },
        oneTime: {
          button: "🎯 Einmalige Zahlung",
          subtitle: "Keine automatische Verlängerung"
        }
      }
    }
  },
  
  zh: {
    premium: {
      back: "返回",
      premiumPlan: "高级套餐",
      freePlan: "免费套餐",
      mostPopular: "⭐ 最受欢迎",
      oneTimePayment: "一次性付款 - 终身访问",
      monthlySubscription: "月度订阅 - 随时取消",
      basicFeaturesOnly: "仅基本功能",
      features: {
        unlimitedSwipes: {
          name: "每日无限滑动",
          free: "每天12次",
          premium: "无限"
        },
        reverseDislikes: {
          name: "撤销不喜欢",
          free: "每天2次",
          premium: "无限"
        },
        seeWhoLiked: {
          name: "查看所有喜欢你的人",
          free: "1人可见",
          premium: "全部可见"
        },
        prioritySupport: {
          name: "优先支持",
          free: "标准",
          premium: "优先"
        },
        allFutureFeatures: {
          name: "所有未来功能",
          premium: "永久包含！"
        }
      },
      upgradeButton: "立即升级到高级版",
      restorePurchases: "已购买？恢复",
      restoringPurchases: "正在恢复购买...",
      limitedFeatures: "功能受限 • 基本支持",
      trustIndicators: {
        joinMembers: "✨ 加入10,000+满意的高级会员",
        sslSecured: "🔒 SSL加密",
        safePayments: "💳 安全支付",
        mobileOptimized: "📱 移动优化"
      },
      paymentOptions: {
        title: "选择支付方式",
        iap: {
          button: "🍎 立即订阅",
          processing: "🍎 处理中...",
          subtitle: "应用内购买 • 安全快捷",
          disclosure: "订阅将自动续订，除非在当前期间结束前至少24小时关闭自动续订。确认购买时，将向您的Apple ID账户收费。购买后，您可以在App Store的账户设置中管理和取消订阅。"
        },
        loading: {
          title: "正在连接App Store...",
          message: "请稍候，我们正在检查应用内购买。"
        },
        unavailable: {
          title: "应用内购买暂时不可用",
          message: "我们目前无法连接。请稍后重试，如果问题持续存在，请联系支持。"
        },
        monthly: {
          button: "💳 月度订阅",
          subtitle: "随时取消"
        },
        oneTime: {
          button: "🎯 一次性付款",
          subtitle: "不自动续订"
        }
      }
    }
  },
  
  sw: {
    premium: {
      back: "Rudi",
      premiumPlan: "Mpango wa Premium",
      freePlan: "Mpango wa Bure",
      mostPopular: "⭐ INAYOPENDELEWA ZAIDI",
      oneTimePayment: "Malipo ya mara moja - Ufikiaji wa maisha",
      monthlySubscription: "Usajili wa kila mwezi - Futa wakati wowote",
      basicFeaturesOnly: "Vipengele vya msingi pekee",
      features: {
        unlimitedSwipes: {
          name: "Swipe za Kila Siku Bila Kikomo",
          free: "12 kwa siku",
          premium: "Bila kikomo"
        },
        reverseDislikes: {
          name: "Rudisha Usipendeze",
          free: "2 kwa siku",
          premium: "Bila kikomo"
        },
        seeWhoLiked: {
          name: "Ona Wote Waliokupenda",
          free: "1 inaonekana",
          premium: "Zote zinaonekana"
        },
        prioritySupport: {
          name: "Msaada wa Kipaumbele",
          free: "Wastani",
          premium: "Kipaumbele"
        },
        allFutureFeatures: {
          name: "Vipengele Vyote vya Baadaye",
          premium: "Vimejumuishwa milele!"
        }
      },
      upgradeButton: "Boresha Hadi Premium Sasa",
      restorePurchases: "Tayari umenunua? Rudisha",
      restoringPurchases: "Inarudisha manunuzi...",
      limitedFeatures: "Vipengele vimepunguzwa • Msaada wa msingi",
      trustIndicators: {
        joinMembers: "✨ Jiunge na wanachama 10,000+ wa premium wenye furaha",
        sslSecured: "🔒 SSL Imeaminishwa",
        safePayments: "💳 Malipo Salama",
        mobileOptimized: "📱 Imebolezwa kwa Simu"
      },
      paymentOptions: {
        title: "Chagua Chaguo la Malipo",
        iap: {
          button: "🍎 Jisajili Sasa",
          processing: "🍎 Inachakata...",
          subtitle: "Ununuzi wa Ndani ya Programu • Salama na Haraka",
          disclosure: "Usajili unajifanya kiotomatiki isipokuwa kujifanya kiotomatiki kumezimwa angalau masaa 24 kabla ya mwisho wa kipindi cha sasa. Malipo yatalipwa kwa akaunti yako ya Apple ID wakati wa kuthibitisha ununuzi. Unaweza kudhibiti na kufuta usajili wako katika mipangilio ya akaunti yako kwenye App Store baada ya ununuzi."
        },
        loading: {
          title: "Inaunganisha na App Store...",
          message: "Tafadhali subiri tunapoangalia manunuzi ya ndani ya programu."
        },
        unavailable: {
          title: "Ununuzi wa Ndani ya Programu Haupatikani Kwa Muda",
          message: "Tuna shida ya kuunganisha sasa hivi. Tafadhali jaribu tena baada ya muda mfupi, au wasiliana na msaada ikiwa tatizo linaendelea."
        },
        monthly: {
          button: "💳 Usajili wa Kila Mwezi",
          subtitle: "Futa wakati wowote"
        },
        oneTime: {
          button: "🎯 Malipo ya Mara Moja",
          subtitle: "Hakuna kujifanya tena kiotomatiki"
        }
      }
    }
  },
  
  pt: {
    premium: {
      back: "Voltar",
      premiumPlan: "Plano Premium",
      freePlan: "Plano Gratuito",
      mostPopular: "⭐ MAIS POPULAR",
      oneTimePayment: "Pagamento único - Acesso vitalício",
      monthlySubscription: "Assinatura mensal - Cancele a qualquer momento",
      basicFeaturesOnly: "Apenas recursos básicos",
      features: {
        unlimitedSwipes: {
          name: "Deslizes Diários Ilimitados",
          free: "12 por dia",
          premium: "Ilimitado"
        },
        reverseDislikes: {
          name: "Reverter Rejeições",
          free: "2 por dia",
          premium: "Ilimitado"
        },
        seeWhoLiked: {
          name: "Ver Todos Que Gostaram de Você",
          free: "1 visível",
          premium: "Todos visíveis"
        },
        prioritySupport: {
          name: "Suporte Prioritário",
          free: "Padrão",
          premium: "Prioritário"
        },
        allFutureFeatures: {
          name: "Todos os Recursos Futuros",
          premium: "Incluído para sempre!"
        }
      },
      upgradeButton: "Atualize para Premium Agora",
      restorePurchases: "Já comprou? Restaurar",
      restoringPurchases: "Restaurando compras...",
      limitedFeatures: "Recursos limitados • Suporte básico",
      trustIndicators: {
        joinMembers: "✨ Junte-se a mais de 10.000 membros premium satisfeitos",
        sslSecured: "🔒 SSL Protegido",
        safePayments: "💳 Pagamentos Seguros",
        mobileOptimized: "📱 Otimizado para Celular"
      },
      paymentOptions: {
        title: "Escolha a Opção de Pagamento",
        iap: {
          button: "🍎 Assinar Agora",
          processing: "🍎 Processando...",
          subtitle: "Compra no Aplicativo • Seguro e Rápido",
          disclosure: "A assinatura é renovada automaticamente, a menos que a renovação automática seja desativada pelo menos 24 horas antes do final do período atual. O pagamento será cobrado da sua conta Apple ID na confirmação da compra. Você pode gerenciar e cancelar sua assinatura nas configurações da sua conta na App Store após a compra."
        },
        loading: {
          title: "Conectando à App Store...",
          message: "Aguarde enquanto verificamos as compras no aplicativo."
        },
        unavailable: {
          title: "Compra no Aplicativo Temporariamente Indisponível",
          message: "Estamos com problemas de conexão no momento. Tente novamente em instantes ou entre em contato com o suporte se o problema persistir."
        },
        monthly: {
          button: "💳 Assinatura Mensal",
          subtitle: "Cancele a qualquer momento"
        },
        oneTime: {
          button: "🎯 Pagamento Único",
          subtitle: "Sem renovação automática"
        }
      }
    }
  },
  
  ar: {
    premium: {
      back: "رجوع",
      premiumPlan: "الخطة المميزة",
      freePlan: "الخطة المجانية",
      mostPopular: "⭐ الأكثر شعبية",
      oneTimePayment: "دفعة واحدة - وصول مدى الحياة",
      monthlySubscription: "اشتراك شهري - إلغاء في أي وقت",
      basicFeaturesOnly: "الميزات الأساسية فقط",
      features: {
        unlimitedSwipes: {
          name: "تمريرات يومية غير محدودة",
          free: "12 في اليوم",
          premium: "غير محدود"
        },
        reverseDislikes: {
          name: "عكس عدم الإعجاب",
          free: "2 في اليوم",
          premium: "غير محدود"
        },
        seeWhoLiked: {
          name: "رؤية كل من أعجب بك",
          free: "1 مرئي",
          premium: "الكل مرئي"
        },
        prioritySupport: {
          name: "دعم ذو أولوية",
          free: "قياسي",
          premium: "ذو أولوية"
        },
        allFutureFeatures: {
          name: "جميع الميزات المستقبلية",
          premium: "مشمول للأبد!"
        }
      },
      upgradeButton: "الترقية إلى المميز الآن",
      restorePurchases: "اشتريت بالفعل؟ استعادة",
      restoringPurchases: "جاري استعادة المشتريات...",
      limitedFeatures: "ميزات محدودة • دعم أساسي",
      trustIndicators: {
        joinMembers: "✨ انضم إلى أكثر من 10,000 عضو مميز سعيد",
        sslSecured: "🔒 محمي بـ SSL",
        safePayments: "💳 مدفوعات آمنة",
        mobileOptimized: "📱 محسّن للجوال"
      },
      paymentOptions: {
        title: "اختر خيار الدفع",
        iap: {
          button: "🍎 اشترك الآن",
          processing: "🍎 جاري المعالجة...",
          subtitle: "الشراء داخل التطبيق • آمن وسريع",
          disclosure: "يتم تجديد الاشتراك تلقائيًا ما لم يتم إيقاف التجديد التلقائي قبل 24 ساعة على الأقل من نهاية الفترة الحالية. سيتم تحصيل الدفع من حساب Apple ID الخاص بك عند تأكيد الشراء. يمكنك إدارة وإلغاء اشتراكك في إعدادات حسابك على App Store بعد الشراء."
        },
        loading: {
          title: "جاري الاتصال بـ App Store...",
          message: "يرجى الانتظار بينما نتحقق من عمليات الشراء داخل التطبيق."
        },
        unavailable: {
          title: "الشراء داخل التطبيق غير متاح مؤقتًا",
          message: "نواجه مشكلة في الاتصال الآن. يرجى المحاولة مرة أخرى بعد لحظة، أو الاتصال بالدعم إذا استمرت المشكلة."
        },
        monthly: {
          button: "💳 اشتراك شهري",
          subtitle: "إلغاء في أي وقت"
        },
        oneTime: {
          button: "🎯 دفعة واحدة",
          subtitle: "لا يوجد تجديد تلقائي"
        }
      }
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
    console.log(`✅ Updated ${lang}.json with premium translations`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
});

console.log('\n✨ All language files updated with premium translations!');
