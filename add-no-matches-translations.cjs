const fs = require('fs');
const path = require('path');

// Translations for "No Matches Yet" section
const translations = {
  en: {
    noMatchesYet: "No Matches Yet",
    swipeRightInDripCheck: "Swipe right on profiles in DripCheck to start matching!",
    moreYouSwipe: "The more you swipe, the more matches you'll get 💕",
    startSwipingInDripCheck: "Start swiping in DripCheck",
    newMatchesWaiting: "New Matches Waiting!",
    tapMatchToMessage: "Tap on a match above to send your first message"
  },
  fr: {
    noMatchesYet: "Pas encore de matchs",
    swipeRightInDripCheck: "Faites glisser vers la droite les profils dans DripCheck pour commencer à matcher !",
    moreYouSwipe: "Plus vous faites glisser, plus vous aurez de matchs 💕",
    startSwipingInDripCheck: "Commencer à faire glisser dans DripCheck",
    newMatchesWaiting: "Nouveaux matchs en attente !",
    tapMatchToMessage: "Appuyez sur un match ci-dessus pour envoyer votre premier message"
  },
  de: {
    noMatchesYet: "Noch keine Matches",
    swipeRightInDripCheck: "Wischen Sie Profile in DripCheck nach rechts, um mit dem Matching zu beginnen!",
    moreYouSwipe: "Je mehr Sie wischen, desto mehr Matches erhalten Sie 💕",
    startSwipingInDripCheck: "Beginnen Sie mit dem Wischen in DripCheck",
    newMatchesWaiting: "Neue Matches warten!",
    tapMatchToMessage: "Tippen Sie auf ein Match oben, um Ihre erste Nachricht zu senden"
  },
  zh: {
    noMatchesYet: "还没有匹配",
    swipeRightInDripCheck: "在DripCheck中向右滑动个人资料以开始匹配！",
    moreYouSwipe: "你滑动得越多，你会得到越多的匹配 💕",
    startSwipingInDripCheck: "在DripCheck中开始滑动",
    newMatchesWaiting: "新匹配等待中！",
    tapMatchToMessage: "点击上面的匹配以发送您的第一条消息"
  },
  sw: {
    noMatchesYet: "Hakuna Mechi Bado",
    swipeRightInDripCheck: "Swipe kulia kwenye wasifu katika DripCheck ili kuanza kulingana!",
    moreYouSwipe: "Kadiri unavyoswipe zaidi, ndivyo utapata mechi zaidi 💕",
    startSwipingInDripCheck: "Anza kuswipe katika DripCheck",
    newMatchesWaiting: "Mechi Mpya Zinasubiri!",
    tapMatchToMessage: "Gusa mechi hapo juu ili kutuma ujumbe wako wa kwanza"
  },
  pt: {
    noMatchesYet: "Ainda Sem Matches",
    swipeRightInDripCheck: "Deslize para a direita nos perfis no DripCheck para começar a combinar!",
    moreYouSwipe: "Quanto mais você desliza, mais matches você terá 💕",
    startSwipingInDripCheck: "Comece a deslizar no DripCheck",
    newMatchesWaiting: "Novos Matches Esperando!",
    tapMatchToMessage: "Toque em um match acima para enviar sua primeira mensagem"
  },
  ar: {
    noMatchesYet: "لا توجد مطابقات بعد",
    swipeRightInDripCheck: "اسحب لليمين على الملفات الشخصية في DripCheck لبدء المطابقة!",
    moreYouSwipe: "كلما قمت بالسحب أكثر، كلما حصلت على مطابقات أكثر 💕",
    startSwipingInDripCheck: "ابدأ السحب في DripCheck",
    newMatchesWaiting: "مطابقات جديدة في الانتظار!",
    tapMatchToMessage: "انقر على مطابقة أعلاه لإرسال رسالتك الأولى"
  }
};

// Add translations to each locale file
Object.keys(translations).forEach(lang => {
  const filePath = path.join(__dirname, `src/i18n/locales/${lang}.json`);
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Add to chat section
    if (!data.chat) {
      data.chat = {};
    }
    
    // Add the new translations
    Object.assign(data.chat, translations[lang]);
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated ${lang}.json with "No Matches Yet" translations`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
});

console.log('\n✨ All "No Matches Yet" translations added successfully!');
