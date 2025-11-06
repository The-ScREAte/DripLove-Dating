import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Add ALL missing keys to English first
const enFilePath = path.join(__dirname, 'src', 'i18n', 'locales', 'en.json');
const enData = JSON.parse(fs.readFileSync(enFilePath, 'utf8'));

// Add Personality keys
enData.profile.personality = "Personality";
enData.profile.personalityTraits = {
  introvertExtrovert: "Introvert vs Extrovert",
  introvert: "Introvert",
  extrovert: "Extrovert",
  spontaneousPlanner: "Spontaneous vs Planner",
  spontaneous: "Spontaneous",
  planner: "Planner",
  messyOrganized: "Messy vs Organized",
  messy: "Messy",
  organized: "Organized"
};

// Add Fun Questions keys
enData.profile.funQuestions = "Fun Questions";
enData.profile.funQuestionsDescription = "Share something interesting about yourself. You can use our suggestions or write your own!";
enData.profile.suggestions = "Suggestions";
enData.profile.selectSuggestion = "Select a suggestion or type your own:";
enData.profile.funFact = "Fun Fact";
enData.profile.funFactPlaceholder = "Share something interesting about yourself...";
enData.profile.perfectFirstDate = "Perfect First Date";
enData.profile.perfectFirstDatePlaceholder = "Describe your ideal first date...";
enData.profile.lastGoogled = "Last Googled";
enData.profile.lastGoogledPlaceholder = "What did you last search for?";

// Add Interests keys
enData.profile.interests = "Interests";
enData.profile.chooseInterests = "Choose your interests";

// Add Adinkra keys
enData.profile.adinkraDescription = "Your Adinkra Symbols (Select up to 10)";
enData.profile.selected = "Selected";
enData.profile.availableSymbols = "Available Symbols";
enData.profile.noAdinkraSelected = "No Adinkra symbols selected yet.";

// Add Account Actions keys
enData.settings.enjoyingDripLove = "⭐ Enjoying DripLove?";
enData.settings.rateExperience = "Rate your experience and help us grow!";
enData.settings.needHelp = "Need Help?";
enData.settings.contactSupport = "Contact our support team for any questions or assistance:";
enData.settings.termsOfService = "Terms of Service";
enData.settings.privacyPolicy = "Privacy Policy";
enData.settings.cancelSubscription = "Cancel Subscription";

fs.writeFileSync(enFilePath, JSON.stringify(enData, null, 2) + '\n');
console.log('✅ Updated en.json with all remaining keys');

// Now add translations for all other languages
const updates = {
  "fr": {
    "profile": {
      "personality": "Personnalité",
      "personalityTraits": {
        "introvertExtrovert": "Introverti vs Extraverti",
        "introvert": "Introverti",
        "extrovert": "Extraverti",
        "spontaneousPlanner": "Spontané vs Planificateur",
        "spontaneous": "Spontané",
        "planner": "Planificateur",
        "messyOrganized": "Désordonné vs Organisé",
        "messy": "Désordonné",
        "organized": "Organisé"
      },
      "funQuestions": "Questions amusantes",
      "funQuestionsDescription": "Partagez quelque chose d'intéressant sur vous. Vous pouvez utiliser nos suggestions ou écrire les vôtres!",
      "suggestions": "Suggestions",
      "selectSuggestion": "Sélectionnez une suggestion ou saisissez la vôtre:",
      "funFact": "Fait amusant",
      "funFactPlaceholder": "Partagez quelque chose d'intéressant sur vous...",
      "perfectFirstDate": "Premier rendez-vous parfait",
      "perfectFirstDatePlaceholder": "Décrivez votre premier rendez-vous idéal...",
      "lastGoogled": "Dernière recherche",
      "lastGoogledPlaceholder": "Qu'avez-vous recherché en dernier?",
      "interests": "Intérêts",
      "chooseInterests": "Choisissez vos intérêts",
      "adinkraDescription": "Vos symboles Adinkra (Sélectionnez jusqu'à 10)",
      "selected": "Sélectionné",
      "availableSymbols": "Symboles disponibles",
      "noAdinkraSelected": "Aucun symbole Adinkra sélectionné pour le moment."
    },
    "settings": {
      "enjoyingDripLove": "⭐ Vous aimez DripLove?",
      "rateExperience": "Évaluez votre expérience et aidez-nous à grandir!",
      "needHelp": "Besoin d'aide?",
      "contactSupport": "Contactez notre équipe d'assistance pour toute question ou aide:",
      "termsOfService": "Conditions d'utilisation",
      "privacyPolicy": "Politique de confidentialité",
      "cancelSubscription": "Annuler l'abonnement"
    }
  },
  "de": {
    "profile": {
      "personality": "Persönlichkeit",
      "personalityTraits": {
        "introvertExtrovert": "Introvertiert vs Extrovertiert",
        "introvert": "Introvertiert",
        "extrovert": "Extrovertiert",
        "spontaneousPlanner": "Spontan vs Planer",
        "spontaneous": "Spontan",
        "planner": "Planer",
        "messyOrganized": "Unordentlich vs Organisiert",
        "messy": "Unordentlich",
        "organized": "Organisiert"
      },
      "funQuestions": "Lustige Fragen",
      "funQuestionsDescription": "Teilen Sie etwas Interessantes über sich mit. Sie können unsere Vorschläge verwenden oder Ihre eigenen schreiben!",
      "suggestions": "Vorschläge",
      "selectSuggestion": "Wählen Sie einen Vorschlag oder geben Sie Ihren eigenen ein:",
      "funFact": "Lustige Tatsache",
      "funFactPlaceholder": "Teilen Sie etwas Interessantes über sich mit...",
      "perfectFirstDate": "Perfektes erstes Date",
      "perfectFirstDatePlaceholder": "Beschreiben Sie Ihr ideales erstes Date...",
      "lastGoogled": "Zuletzt gegoogelt",
      "lastGoogledPlaceholder": "Wonach haben Sie zuletzt gesucht?",
      "interests": "Interessen",
      "chooseInterests": "Wählen Sie Ihre Interessen",
      "adinkraDescription": "Ihre Adinkra-Symbole (Wählen Sie bis zu 10)",
      "selected": "Ausgewählt",
      "availableSymbols": "Verfügbare Symbole",
      "noAdinkraSelected": "Noch keine Adinkra-Symbole ausgewählt."
    },
    "settings": {
      "enjoyingDripLove": "⭐ Gefällt Ihnen DripLove?",
      "rateExperience": "Bewerten Sie Ihre Erfahrung und helfen Sie uns zu wachsen!",
      "needHelp": "Brauchen Sie Hilfe?",
      "contactSupport": "Kontaktieren Sie unser Support-Team bei Fragen oder Hilfe:",
      "termsOfService": "Nutzungsbedingungen",
      "privacyPolicy": "Datenschutzrichtlinie",
      "cancelSubscription": "Abonnement kündigen"
    }
  },
  "pt": {
    "profile": {
      "personality": "Personalidade",
      "personalityTraits": {
        "introvertExtrovert": "Introvertido vs Extrovertido",
        "introvert": "Introvertido",
        "extrovert": "Extrovertido",
        "spontaneousPlanner": "Espontâneo vs Planejador",
        "spontaneous": "Espontâneo",
        "planner": "Planejador",
        "messyOrganized": "Desorganizado vs Organizado",
        "messy": "Desorganizado",
        "organized": "Organizado"
      },
      "funQuestions": "Perguntas divertidas",
      "funQuestionsDescription": "Compartilhe algo interessante sobre você. Você pode usar nossas sugestões ou escrever as suas próprias!",
      "suggestions": "Sugestões",
      "selectSuggestion": "Selecione uma sugestão ou digite a sua própria:",
      "funFact": "Fato curioso",
      "funFactPlaceholder": "Compartilhe algo interessante sobre você...",
      "perfectFirstDate": "Primeiro encontro perfeito",
      "perfectFirstDatePlaceholder": "Descreva seu primeiro encontro ideal...",
      "lastGoogled": "Última pesquisa",
      "lastGoogledPlaceholder": "O que você pesquisou por último?",
      "interests": "Interesses",
      "chooseInterests": "Escolha seus interesses",
      "adinkraDescription": "Seus símbolos Adinkra (Selecione até 10)",
      "selected": "Selecionado",
      "availableSymbols": "Símbolos disponíveis",
      "noAdinkraSelected": "Nenhum símbolo Adinkra selecionado ainda."
    },
    "settings": {
      "enjoyingDripLove": "⭐ Curtindo o DripLove?",
      "rateExperience": "Avalie sua experiência e nos ajude a crescer!",
      "needHelp": "Precisa de ajuda?",
      "contactSupport": "Entre em contato com nossa equipe de suporte para qualquer dúvida ou assistência:",
      "termsOfService": "Termos de serviço",
      "privacyPolicy": "Política de privacidade",
      "cancelSubscription": "Cancelar assinatura"
    }
  },
  "zh": {
    "profile": {
      "personality": "性格",
      "personalityTraits": {
        "introvertExtrovert": "内向 vs 外向",
        "introvert": "内向",
        "extrovert": "外向",
        "spontaneousPlanner": "自发 vs 计划者",
        "spontaneous": "自发",
        "planner": "计划者",
        "messyOrganized": "凌乱 vs 有序",
        "messy": "凌乱",
        "organized": "有序"
      },
      "funQuestions": "趣味问题",
      "funQuestionsDescription": "分享一些关于您自己的有趣信息。您可以使用我们的建议或编写自己的！",
      "suggestions": "建议",
      "selectSuggestion": "选择一个建议或输入您自己的：",
      "funFact": "趣味事实",
      "funFactPlaceholder": "分享一些关于您自己的有趣信息...",
      "perfectFirstDate": "完美的第一次约会",
      "perfectFirstDatePlaceholder": "描述您理想的第一次约会...",
      "lastGoogled": "最后搜索",
      "lastGoogledPlaceholder": "您最后搜索了什么？",
      "interests": "兴趣",
      "chooseInterests": "选择您的兴趣",
      "adinkraDescription": "您的Adinkra符号（最多选择10个）",
      "selected": "已选择",
      "availableSymbols": "可用符号",
      "noAdinkraSelected": "尚未选择Adinkra符号。"
    },
    "settings": {
      "enjoyingDripLove": "⭐ 喜欢DripLove吗？",
      "rateExperience": "评价您的体验并帮助我们成长！",
      "needHelp": "需要帮助？",
      "contactSupport": "如有任何问题或需要帮助，请联系我们的支持团队：",
      "termsOfService": "服务条款",
      "privacyPolicy": "隐私政策",
      "cancelSubscription": "取消订阅"
    }
  },
  "sw": {
    "profile": {
      "personality": "Tabia",
      "personalityTraits": {
        "introvertExtrovert": "Mtu wa ndani vs Mtu wa nje",
        "introvert": "Mtu wa ndani",
        "extrovert": "Mtu wa nje",
        "spontaneousPlanner": "Wa ghafla vs Mpangaji",
        "spontaneous": "Wa ghafla",
        "planner": "Mpangaji",
        "messyOrganized": "Uchafu vs Mpangilio",
        "messy": "Uchafu",
        "organized": "Mpangilio"
      },
      "funQuestions": "Maswali ya kufurahisha",
      "funQuestionsDescription": "Shiriki kitu cha kuvutia kuhusu wewe. Unaweza kutumia mapendekezo yetu au kuandika yako mwenyewe!",
      "suggestions": "Mapendekezo",
      "selectSuggestion": "Chagua pendekezo au andika lako mwenyewe:",
      "funFact": "Ukweli wa kufurahisha",
      "funFactPlaceholder": "Shiriki kitu cha kuvutia kuhusu wewe...",
      "perfectFirstDate": "Tarehe kamili ya kwanza",
      "perfectFirstDatePlaceholder": "Eleza tarehe yako bora ya kwanza...",
      "lastGoogled": "Uliyotafuta mwisho",
      "lastGoogledPlaceholder": "Ulitafuta nini mwishoni?",
      "interests": "Mapendekezo",
      "chooseInterests": "Chagua mapendekezo yako",
      "adinkraDescription": "Alama zako za Adinkra (Chagua hadi 10)",
      "selected": "Imechaguliwa",
      "availableSymbols": "Alama zinazopatikana",
      "noAdinkraSelected": "Hakuna alama za Adinkra zilizochaguliwa bado."
    },
    "settings": {
      "enjoyingDripLove": "⭐ Unafurahia DripLove?",
      "rateExperience": "Tathmini uzoefu wako na tusaidie kukua!",
      "needHelp": "Unahitaji msaada?",
      "contactSupport": "Wasiliana na timu yetu ya usaidizi kwa maswali yoyote au msaada:",
      "termsOfService": "Masharti ya Huduma",
      "privacyPolicy": "Sera ya Faragha",
      "cancelSubscription": "Ghairi usajili"
    }
  },
  "ar": {
    "profile": {
      "personality": "الشخصية",
      "personalityTraits": {
        "introvertExtrovert": "انطوائي مقابل منفتح",
        "introvert": "انطوائي",
        "extrovert": "منفتح",
        "spontaneousPlanner": "عفوي مقابل مخطط",
        "spontaneous": "عفوي",
        "planner": "مخطط",
        "messyOrganized": "فوضوي مقابل منظم",
        "messy": "فوضوي",
        "organized": "منظم"
      },
      "funQuestions": "أسئلة ممتعة",
      "funQuestionsDescription": "شارك شيئًا مثيرًا للاهتمام عن نفسك. يمكنك استخدام اقتراحاتنا أو كتابة اقتراحاتك الخاصة!",
      "suggestions": "الاقتراحات",
      "selectSuggestion": "حدد اقتراحًا أو اكتب اقتراحك الخاص:",
      "funFact": "حقيقة ممتعة",
      "funFactPlaceholder": "شارك شيئًا مثيرًا للاهتمام عن نفسك...",
      "perfectFirstDate": "الموعد الأول المثالي",
      "perfectFirstDatePlaceholder": "صف موعدك الأول المثالي...",
      "lastGoogled": "آخر بحث",
      "lastGoogledPlaceholder": "ماذا بحثت مؤخرًا؟",
      "interests": "الاهتمامات",
      "chooseInterests": "اختر اهتماماتك",
      "adinkraDescription": "رموز Adinkra الخاصة بك (حدد حتى 10)",
      "selected": "المحدد",
      "availableSymbols": "الرموز المتاحة",
      "noAdinkraSelected": "لم يتم تحديد رموز Adinkra بعد."
    },
    "settings": {
      "enjoyingDripLove": "⭐ تستمتع بـ DripLove؟",
      "rateExperience": "قيّم تجربتك وساعدنا على النمو!",
      "needHelp": "تحتاج مساعدة؟",
      "contactSupport": "اتصل بفريق الدعم لدينا لأي أسئلة أو مساعدة:",
      "termsOfService": "شروط الخدمة",
      "privacyPolicy": "سياسة الخصوصية",
      "cancelSubscription": "إلغاء الاشتراك"
    }
  }
};

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

for (const [lang, sections] of Object.entries(updates)) {
  const filePath = path.join(__dirname, 'src', 'i18n', 'locales', `${lang}.json`);
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    deepMerge(data, sections);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`✅ Updated ${lang}.json with ALL remaining translations`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
}

console.log('\n✨ ALL translations complete for all 7 languages!');
console.log('\n🎉 Profile page is now FULLY translated!');
