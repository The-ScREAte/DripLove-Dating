const fs = require('fs');
const path = require('path');

// Translations for the "Start the Conversation" empty state
const translations = {
  en: {
    startConversation: "Start the Conversation!",
    sayHelloTo: "Say hello to {name}! Break the ice and start chatting 💬",
    conversationTip: "Tip: Ask about their interests or share something fun!"
  },
  fr: {
    startConversation: "Commencez la Conversation !",
    sayHelloTo: "Dites bonjour à {name} ! Brisez la glace et commencez à discuter 💬",
    conversationTip: "Astuce : Posez des questions sur leurs centres d'intérêt ou partagez quelque chose d'amusant !"
  },
  de: {
    startConversation: "Starte das Gespräch!",
    sayHelloTo: "Sag Hallo zu {name}! Brich das Eis und fang an zu chatten 💬",
    conversationTip: "Tipp: Frag nach ihren Interessen oder teile etwas Lustiges!"
  },
  zh: {
    startConversation: "开始对话！",
    sayHelloTo: "向{name}打个招呼！破冰开始聊天 💬",
    conversationTip: "提示：询问他们的兴趣或分享有趣的事情！"
  },
  sw: {
    startConversation: "Anza Mazungumzo!",
    sayHelloTo: "Sema habari kwa {name}! Vunja barafu na uanze kuzungumza 💬",
    conversationTip: "Kidokezo: Uliza kuhusu mapenzi yao au shiriki kitu cha kufurahisha!"
  },
  pt: {
    startConversation: "Inicie a Conversa!",
    sayHelloTo: "Diga olá para {name}! Quebre o gelo e comece a conversar 💬",
    conversationTip: "Dica: Pergunte sobre os interesses deles ou compartilhe algo divertido!"
  },
  ar: {
    startConversation: "ابدأ المحادثة!",
    sayHelloTo: "قل مرحبا لـ {name}! اكسر الجليد وابدأ الدردشة 💬",
    conversationTip: "نصيحة: اسأل عن اهتماماتهم أو شارك شيئًا ممتعًا!"
  }
};

// Add translations to each locale file
Object.keys(translations).forEach(lang => {
  const filePath = path.join(__dirname, `src/i18n/locales/${lang}.json`);
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Add chat section if it doesn't exist
    if (!data.chat) {
      data.chat = {};
    }
    
    // Add the empty state translations
    data.chat.startConversation = translations[lang].startConversation;
    data.chat.sayHelloTo = translations[lang].sayHelloTo;
    data.chat.conversationTip = translations[lang].conversationTip;
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated ${lang}.json with chat empty state translations`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
});

console.log('\n✨ All chat empty state translations added successfully!');
