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
    privacyPolicy: {
      title: "DripLove Privacy Policy",
      lastUpdated: "Last Updated: July 13, 2025"
    },
    termsOfService: {
      title: "DripLove Terms of Service",
      lastUpdated: "Last Updated: July 13, 2025"
    }
  },
  fr: {
    privacyPolicy: {
      title: "Politique de Confidentialité DripLove",
      lastUpdated: "Dernière mise à jour : 13 juillet 2025"
    },
    termsOfService: {
      title: "Conditions d'Utilisation DripLove",
      lastUpdated: "Dernière mise à jour : 13 juillet 2025"
    }
  },
  de: {
    privacyPolicy: {
      title: "DripLove Datenschutzrichtlinie",
      lastUpdated: "Letzte Aktualisierung: 13. Juli 2025"
    },
    termsOfService: {
      title: "DripLove Nutzungsbedingungen",
      lastUpdated: "Letzte Aktualisierung: 13. Juli 2025"
    }
  },
  zh: {
    privacyPolicy: {
      title: "DripLove 隐私政策",
      lastUpdated: "最后更新：2025年7月13日"
    },
    termsOfService: {
      title: "DripLove 服务条款",
      lastUpdated: "最后更新：2025年7月13日"
    }
  },
  sw: {
    privacyPolicy: {
      title: "Sera ya Faragha ya DripLove",
      lastUpdated: "Imesasishwa Mwisho: Julai 13, 2025"
    },
    termsOfService: {
      title: "Masharti ya Huduma ya DripLove",
      lastUpdated: "Imesasishwa Mwisho: Julai 13, 2025"
    }
  },
  pt: {
    privacyPolicy: {
      title: "Política de Privacidade DripLove",
      lastUpdated: "Última atualização: 13 de julho de 2025"
    },
    termsOfService: {
      title: "Termos de Serviço DripLove",
      lastUpdated: "Última atualização: 13 de julho de 2025"
    }
  },
  ar: {
    privacyPolicy: {
      title: "سياسة الخصوصية DripLove",
      lastUpdated: "آخر تحديث: 13 يوليو 2025"
    },
    termsOfService: {
      title: "شروط الخدمة DripLove",
      lastUpdated: "آخر تحديث: 13 يوليو 2025"
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

console.log('✅ Updated en.json, fr.json, de.json, zh.json, sw.json, pt.json, ar.json with legal pages translations');
