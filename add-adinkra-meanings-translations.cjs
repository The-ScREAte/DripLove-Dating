const fs = require('fs');
const path = require('path');

// Adinkra symbol meanings to translate
const adinkraMeanings = {
  "Aya": "The fern. Symbol of endurance and resourcefulness.",
  "Nkyinkyim": "Twisting. Symbol of initiative, dynamism, and versatility.",
  "Eban": "Fence. Symbol of love, safety, and security.",
  "Fihankra": "House/compound. Symbol of security and safety.",
  "Gye Nyame": "Except for God. Symbol of the supremacy of God.",
  "Sankofa": "Go back and get it. Symbol of learning from the past.",
  "Duafe": "Wooden comb. Symbol of beauty, cleanliness, feminine qualities.",
  "Fawohodie": "Independence. Symbol of freedom, emancipation, independence.",
  "Akoma": "The heart. Symbol of patience and tolerance.",
  "Akoben": "War horn. Symbol of vigilance and wariness.",
  "Adinkrahene": "Chief of the adinkra symbols. Symbol of greatness, charisma, and leadership.",
  "Bese Saka": "Sack of cola nuts. Symbol of affluence, power, abundance, unity.",
  "Dame-Dame": "Checkerboard. Symbol of intelligence and ingenuity.",
  "Dwennimmen": "Ram's horns. Symbol of humility together with strength.",
  "Nyame Dua": "Tree of God. Symbol of God's presence and protection.",
  "Boa Me Na Me Mmoa Wo": "Help me and let me help you. Symbol of cooperation and interdependence."
};

// Translation for each language
const translations = {
  en: adinkraMeanings,
  
  fr: {
    "Aya": "La fougère. Symbole d'endurance et de débrouillardise.",
    "Nkyinkyim": "Torsion. Symbole d'initiative, de dynamisme et de polyvalence.",
    "Eban": "Clôture. Symbole d'amour, de sûreté et de sécurité.",
    "Fihankra": "Maison/enceinte. Symbole de sécurité et de sûreté.",
    "Gye Nyame": "Sauf Dieu. Symbole de la suprématie de Dieu.",
    "Sankofa": "Retourne et prends-le. Symbole d'apprendre du passé.",
    "Duafe": "Peigne en bois. Symbole de beauté, de propreté, de qualités féminines.",
    "Fawohodie": "Indépendance. Symbole de liberté, d'émancipation, d'indépendance.",
    "Akoma": "Le cœur. Symbole de patience et de tolérance.",
    "Akoben": "Corne de guerre. Symbole de vigilance et de prudence.",
    "Adinkrahene": "Chef des symboles adinkra. Symbole de grandeur, de charisme et de leadership.",
    "Bese Saka": "Sac de noix de cola. Symbole d'affluence, de pouvoir, d'abondance, d'unité.",
    "Dame-Dame": "Damier. Symbole d'intelligence et d'ingéniosité.",
    "Dwennimmen": "Cornes de bélier. Symbole d'humilité associée à la force.",
    "Nyame Dua": "Arbre de Dieu. Symbole de la présence et de la protection de Dieu.",
    "Boa Me Na Me Mmoa Wo": "Aide-moi et laisse-moi t'aider. Symbole de coopération et d'interdépendance."
  },
  
  de: {
    "Aya": "Der Farn. Symbol für Ausdauer und Einfallsreichtum.",
    "Nkyinkyim": "Verdrehen. Symbol für Initiative, Dynamik und Vielseitigkeit.",
    "Eban": "Zaun. Symbol für Liebe, Geborgenheit und Sicherheit.",
    "Fihankra": "Haus/Anlage. Symbol für Geborgenheit und Sicherheit.",
    "Gye Nyame": "Außer Gott. Symbol für die Vorherrschaft Gottes.",
    "Sankofa": "Geh zurück und hol es. Symbol für das Lernen aus der Vergangenheit.",
    "Duafe": "Holzkamm. Symbol für Schönheit, Sauberkeit, weibliche Qualitäten.",
    "Fawohodie": "Unabhängigkeit. Symbol für Freiheit, Emanzipation, Unabhängigkeit.",
    "Akoma": "Das Herz. Symbol für Geduld und Toleranz.",
    "Akoben": "Kriegshorn. Symbol für Wachsamkeit und Vorsicht.",
    "Adinkrahene": "Chef der Adinkra-Symbole. Symbol für Größe, Charisma und Führung.",
    "Bese Saka": "Sack Kolanüsse. Symbol für Wohlstand, Macht, Überfluss, Einheit.",
    "Dame-Dame": "Schachbrett. Symbol für Intelligenz und Einfallsreichtum.",
    "Dwennimmen": "Widderhörner. Symbol für Demut zusammen mit Stärke.",
    "Nyame Dua": "Baum Gottes. Symbol für Gottes Gegenwart und Schutz.",
    "Boa Me Na Me Mmoa Wo": "Hilf mir und lass mich dir helfen. Symbol für Zusammenarbeit und gegenseitige Abhängigkeit."
  },
  
  zh: {
    "Aya": "蕨类植物。耐力和足智多谋的象征。",
    "Nkyinkyim": "扭曲。主动性、活力和多才多艺的象征。",
    "Eban": "围栏。爱、安全和保障的象征。",
    "Fihankra": "房屋/院落。安全和保障的象征。",
    "Gye Nyame": "除了上帝。上帝至高无上的象征。",
    "Sankofa": "回去拿它。从过去学习的象征。",
    "Duafe": "木梳。美丽、清洁、女性特质的象征。",
    "Fawohodie": "独立。自由、解放、独立的象征。",
    "Akoma": "心。耐心和宽容的象征。",
    "Akoben": "战争号角。警惕和谨慎的象征。",
    "Adinkrahene": "阿丁克拉符号之首。伟大、魅力和领导力的象征。",
    "Bese Saka": "可乐果袋。富裕、权力、丰富、团结的象征。",
    "Dame-Dame": "棋盘。智慧和独创性的象征。",
    "Dwennimmen": "公羊角。谦逊与力量的象征。",
    "Nyame Dua": "神之树。上帝的存在和保护的象征。",
    "Boa Me Na Me Mmoa Wo": "帮助我，让我帮助你。合作和相互依存的象征。"
  },
  
  sw: {
    "Aya": "Ufunguo. Ishara ya uvumilivu na ustadi.",
    "Nkyinkyim": "Kusonga. Ishara ya uanzilishi, nguvu na ustadi.",
    "Eban": "Uzio. Ishara ya upendo, usalama na usalama.",
    "Fihankra": "Nyumba/makao. Ishara ya usalama na usalama.",
    "Gye Nyame": "Isipokuwa Mungu. Ishara ya ukuu wa Mungu.",
    "Sankofa": "Rudi uichukue. Ishara ya kujifunza kutoka wakati uliopita.",
    "Duafe": "Kitana cha mbao. Ishara ya uzuri, usafi, sifa za kike.",
    "Fawohodie": "Uhuru. Ishara ya uhuru, ukombozi, uhuru.",
    "Akoma": "Moyo. Ishara ya uvumilivu na uvumilivu.",
    "Akoben": "Baragumu wa vita. Ishara ya uangalifu na tahadhari.",
    "Adinkrahene": "Mkuu wa alama za adinkra. Ishara ya ukuu, mvuto na uongozi.",
    "Bese Saka": "Gunia la korosho. Ishara ya utajiri, nguvu, wingi, umoja.",
    "Dame-Dame": "Ubao wa checkers. Ishara ya akili na ubunifu.",
    "Dwennimmen": "Pembe za kondoo dume. Ishara ya unyenyekevu pamoja na nguvu.",
    "Nyame Dua": "Mti wa Mungu. Ishara ya uwepo na ulinzi wa Mungu.",
    "Boa Me Na Me Mmoa Wo": "Nisaidie na nikuruhusu nikusaidie. Ishara ya ushirikiano na utegemezano."
  },
  
  pt: {
    "Aya": "A samambaia. Símbolo de resistência e desenvoltura.",
    "Nkyinkyim": "Torção. Símbolo de iniciativa, dinamismo e versatilidade.",
    "Eban": "Cerca. Símbolo de amor, segurança e proteção.",
    "Fihankra": "Casa/recinto. Símbolo de segurança e proteção.",
    "Gye Nyame": "Exceto Deus. Símbolo da supremacia de Deus.",
    "Sankofa": "Volte e pegue. Símbolo de aprender com o passado.",
    "Duafe": "Pente de madeira. Símbolo de beleza, limpeza, qualidades femininas.",
    "Fawohodie": "Independência. Símbolo de liberdade, emancipação, independência.",
    "Akoma": "O coração. Símbolo de paciência e tolerância.",
    "Akoben": "Chifre de guerra. Símbolo de vigilância e cautela.",
    "Adinkrahene": "Chefe dos símbolos adinkra. Símbolo de grandeza, carisma e liderança.",
    "Bese Saka": "Saco de nozes de cola. Símbolo de riqueza, poder, abundância, unidade.",
    "Dame-Dame": "Tabuleiro de damas. Símbolo de inteligência e engenhosidade.",
    "Dwennimmen": "Chifres de carneiro. Símbolo de humildade junto com força.",
    "Nyame Dua": "Árvore de Deus. Símbolo da presença e proteção de Deus.",
    "Boa Me Na Me Mmoa Wo": "Ajude-me e deixe-me ajudá-lo. Símbolo de cooperação e interdependência."
  },
  
  ar: {
    "Aya": "السرخس. رمز للتحمل والبراعة.",
    "Nkyinkyim": "الالتواء. رمز للمبادرة والديناميكية والتنوع.",
    "Eban": "السياج. رمز للحب والأمان والحماية.",
    "Fihankra": "المنزل/المجمع. رمز للأمان والحماية.",
    "Gye Nyame": "ما عدا الله. رمز لسيادة الله.",
    "Sankofa": "عد وخذها. رمز للتعلم من الماضي.",
    "Duafe": "مشط خشبي. رمز للجمال والنظافة والصفات الأنثوية.",
    "Fawohodie": "الاستقلال. رمز للحرية والتحرر والاستقلال.",
    "Akoma": "القلب. رمز للصبر والتسامح.",
    "Akoben": "بوق الحرب. رمز لليقظة والحذر.",
    "Adinkrahene": "رئيس رموز أدينكرا. رمز للعظمة والكاريزما والقيادة.",
    "Bese Saka": "كيس من جوز الكولا. رمز للثراء والقوة والوفرة والوحدة.",
    "Dame-Dame": "رقعة الشطرنج. رمز للذكاء والإبداع.",
    "Dwennimmen": "قرون الكبش. رمز للتواضع مع القوة.",
    "Nyame Dua": "شجرة الله. رمز لحضور الله وحمايته.",
    "Boa Me Na Me Mmoa Wo": "ساعدني ودعني أساعدك. رمز للتعاون والترابط."
  }
};

// Add translations to each locale file
Object.keys(translations).forEach(lang => {
  const filePath = path.join(__dirname, `src/i18n/locales/${lang}.json`);
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Add adinkraMeanings section
    data.adinkraMeanings = translations[lang];
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated ${lang}.json with Adinkra meanings`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
});

console.log('\n✨ All Adinkra meaning translations added successfully!');
