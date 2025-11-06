const fs = require('fs');
const path = require('path');

// Read and update translation files
const localesDir = path.join(__dirname, 'src', 'i18n', 'locales');

const correctAboutUsStructures = {
  zh: {
    title: "关于DripLove",
    back: "返回",
    lastUpdated: "最后更新：2025年7月13日",
    sections: {
      mission: {
        title: "我们的使命",
        content: [
          "DripLove不仅仅是一个约会应用——我们是一个致力于帮助人们找到真实联系和有意义关系的全球社区。我们的使命是创建一个安全、包容和充满活力的平台，让爱没有界限。",
          "无论您是在寻找灵魂伴侣、终身伴侣还是新朋友，DripLove都能提供工具和社区，帮助您发现真正重要的真实联系。"
        ]
      },
      different: {
        title: "我们的与众不同之处",
        intro: "DripLove在拥挤的约会应用市场中脱颖而出，因为我们致力于：",
        points: [
          "基于共同价值观和兴趣的真实联系",
          "庆祝所有背景的多元化全球社区",
          "优先考虑兼容性的先进匹配算法",
          "安全、可靠和无骚扰的环境",
          "为每个人设计的包容性功能"
        ]
      },
      community: {
        title: "全球社区",
        content: [
          "从纽约到内罗毕，从伦敦到拉各斯，从东京到多伦多——DripLove连接跨越大陆的心灵。我们的平台汇集了来自各行各业的活力灵魂，创造真正全球化的约会体验。",
          "爱情不认边界，我们也不认。无论您是寻求本地联系还是国际浪漫，DripLove都能实现。"
        ]
      },
      values: {
        title: "我们的价值观",
        authenticity: {
          title: "真实性",
          description: "我们鼓励真诚的联系和真实的对话。"
        },
        inclusivity: {
          title: "包容性",
          description: "无论背景、身份或信仰如何，每个人都受欢迎。"
        },
        safety: {
          title: "安全",
          description: "您的安全和隐私是我们的首要任务。"
        },
        innovation: {
          title: "创新",
          description: "我们不断改进以提供最佳的约会体验。"
        }
      },
      journey: {
        title: "我们的旅程",
        content: "DripLove成立于2024年，源于一个简单的信念：每个人都值得找到爱情。我们的团队热衷于创造将人们聚集在一起而不是分开的技术。"
      },
      contact: {
        title: "联系我们",
        content: "我们很乐意听取我们社区的意见！无论您有问题、反馈，还是只是想打个招呼，我们都在这里为您服务。",
        email: "发送电子邮件至：",
        support: "如需支持咨询：",
        social: "在社交媒体上关注我们，了解最新功能和成功故事。"
      },
      company: {
        title: "关于 The ScREAte Ltd",
        content: [
          "DripLove由The ScREAte Ltd自豪地创建，这是一家致力于构建创新数字体验的科技公司，将人们聚集在一起。我们专注于创建促进真实人际联系的平台。",
          "我们的团队将技术专长与对人际关系的深刻理解相结合，创造出对人们生活产生有意义影响的产品。"
        ]
      },
      safety: {
        title: "安全与保障",
        intro: "您的安全对我们至关重要。DripLove实施全面的安全措施，包括：",
        points: [
          "个人资料验证系统",
          "高级举报和屏蔽功能",
          "全天候审核和支持",
          "私密消息的端到端加密",
          "严格的隐私控制"
        ]
      }
    }
  },
  sw: {
    title: "Kuhusu DripLove",
    back: "Rudi",
    lastUpdated: "Ilisasishwa Mwisho: Julai 13, 2025",
    sections: {
      mission: {
        title: "Dhamira Yetu",
        content: [
          "DripLove si programu ya kutafuta mapenzi tu – ni jumuiya ya kimataifa inayojitoa kusaidia watu kupata uhusiano wa kweli na wenye maana. Dhamira yetu ni kuunda jukwaa salama, la kujumuisha, na lenye nguvu ambapo mapenzi hayana mipaka.",
          "Iwe unatafuta mwenzi wako wa roho, mshirika wa maisha yote, au urafiki mpya, DripLove inatoa zana na jumuiya kukusaidia kugundua uhusiano wa kweli unaohusiana."
        ]
      },
      different: {
        title: "Kinachotufanya Kuwa Tofauti",
        intro: "DripLove inajitofautisha katika mazingira ya programu za kutafuta mapenzi kupitia kujitolea kwetu kwa:",
        points: [
          "Uhusiano wa kweli kulingana na maadili na maslahi ya pamoja",
          "Jumuiya ya kimataifa yenye utofauti unaofahamu asili zote",
          "Kanuni za juu za kuoanisha zinazoweka vipaumbele upatanisho",
          "Mazingira salama, yenye usalama, na bila unyanyasaji",
          "Vipengele vya kujumuisha vilivyoundwa kwa kila mtu"
        ]
      },
      community: {
        title: "Jumuiya ya Kimataifa",
        content: [
          "Kutoka New York hadi Nairobi, London hadi Lagos, Tokyo hadi Toronto – DripLove inaunganisha mioyo katika mabara. Jukwaa letu linaunganisha roho zenye nguvu kutoka nyanja zote za maisha, likifanya uzoefu wa kweli wa kimataifa wa kutafuta mapenzi.",
          "Mapenzi hayatambui mipaka, na sisi pia hatutambui. Iwe unatafuta uhusiano wa karibu au mapenzi ya kimataifa, DripLove inafanya iwe inawezekana."
        ]
      },
      values: {
        title: "Maadili Yetu",
        authenticity: {
          title: "Uhalali",
          description: "Tunachochea uhusiano wa kweli na mazungumzo halisi."
        },
        inclusivity: {
          title: "Ujumuishaji",
          description: "Kila mtu anakaribisha bila kujali asili, utambulisho, au imani."
        },
        safety: {
          title: "Usalama",
          description: "Usalama na faragha yako ni kipaumbele chetu cha juu."
        },
        innovation: {
          title: "Ubunifu",
          description: "Tunaboresha mara kwa mara ili kutoa uzoefu bora wa kutafuta mapenzi."
        }
      },
      journey: {
        title: "Safari Yetu",
        content: "Ilianzishwa mnamo 2024, DripLove ilizaliwa kutokana na imani rahisi: kila mtu anastahili kupata mapenzi. Timu yetu ina shauku ya kuunda teknolojia inayounganisha watu, sio kuwatenganisha."
      },
      contact: {
        title: "Wasiliana Nasi",
        content: "Tunapenda kusikia kutoka kwa jumuiya yetu! Iwe una maswali, maoni, au unataka kusema habari tu, tuko hapa kwa ajili yako.",
        email: "Tutumie barua pepe kwa:",
        support: "Kwa maswali ya usaidizi:",
        social: "Tufuate kwenye mitandao ya kijamii ili kupata habari za hivi karibuni kuhusu vipengele vipya na hadithi za mafanikio."
      },
      company: {
        title: "Kuhusu The ScREAte Ltd",
        content: [
          "DripLove imeundwa kwa fahari na The ScREAte Ltd, kampuni ya teknolojia inayojitoa kujenga uzoefu wa kidijitali wa ubunifu unaowaleta watu pamoja. Tunajisikitisha katika kuunda majukwaa yanayohimiza uhusiano wa kibinadamu halisi.",
          "Timu yetu inaunganisha ujuzi wa kiufundi na uelewa wa kina wa mahusiano ya kibinadamu ili kuunda bidhaa zinazofanya tofauti yenye maana katika maisha ya watu."
        ]
      },
      safety: {
        title: "Usalama na Ulinzi",
        intro: "Usalama wako ni muhimu sana kwetu. DripLove inatekeleza hatua za kina za usalama ikiwa ni pamoja na:",
        points: [
          "Mifumo ya uthibitishaji wa wasifu",
          "Vipengele vya juu vya kuripoti na kuzuia",
          "Usimamizi na usaidizi wa saa 24/7",
          "Usimbaji fiche wa mwisho hadi mwisho kwa ujumbe wa kibinafsi",
          "Udhibiti mkali wa faragha"
        ]
      }
    }
  },
  pt: {
    title: "Sobre o DripLove",
    back: "Voltar",
    lastUpdated: "Última Atualização: 13 de julho de 2025",
    sections: {
      mission: {
        title: "Nossa Missão",
        content: [
          "DripLove é mais do que apenas um aplicativo de namoro – somos uma comunidade global dedicada a ajudar as pessoas a encontrar conexões autênticas e relacionamentos significativos. Nossa missão é criar uma plataforma segura, inclusiva e vibrante onde o amor não conhece fronteiras.",
          "Seja procurando sua alma gêmea, parceiro para toda a vida ou novas amizades, o DripLove fornece as ferramentas e a comunidade para ajudá-lo a descobrir conexões genuínas que importam."
        ]
      },
      different: {
        title: "O Que Nos Torna Diferentes",
        intro: "O DripLove se destaca no cenário lotado de aplicativos de namoro através do nosso compromisso com:",
        points: [
          "Conexões autênticas baseadas em valores e interesses compartilhados",
          "Uma comunidade global diversa que celebra todas as origens",
          "Algoritmos de correspondência avançados que priorizam a compatibilidade",
          "Ambiente seguro, protegido e livre de assédio",
          "Recursos inclusivos projetados para todos"
        ]
      },
      community: {
        title: "Comunidade Global",
        content: [
          "De Nova York a Nairóbi, Londres a Lagos, Tóquio a Toronto – o DripLove conecta corações através dos continentes. Nossa plataforma reúne almas vibrantes de todos os estilos de vida, criando uma experiência de namoro verdadeiramente global.",
          "O amor não reconhece fronteiras, e nós também não. Seja buscando conexões locais ou romance internacional, o DripLove torna isso possível."
        ]
      },
      values: {
        title: "Nossos Valores",
        authenticity: {
          title: "Autenticidade",
          description: "Incentivamos conexões genuínas e conversas reais."
        },
        inclusivity: {
          title: "Inclusividade",
          description: "Todos são bem-vindos, independentemente de origem, identidade ou crenças."
        },
        safety: {
          title: "Segurança",
          description: "Sua segurança e privacidade são nossas principais prioridades."
        },
        innovation: {
          title: "Inovação",
          description: "Melhoramos continuamente para fornecer a melhor experiência de namoro."
        }
      },
      journey: {
        title: "Nossa Jornada",
        content: "Fundado em 2024, o DripLove nasceu de uma crença simples: todos merecem encontrar o amor. Nossa equipe é apaixonada por criar tecnologia que aproxima as pessoas, não as afasta."
      },
      contact: {
        title: "Entre em Contato",
        content: "Adoramos ouvir nossa comunidade! Seja com perguntas, feedback ou apenas para dizer oi, estamos aqui para você.",
        email: "Envie-nos um e-mail para:",
        support: "Para consultas de suporte:",
        social: "Siga-nos nas redes sociais para se manter atualizado com os recursos mais recentes e histórias de sucesso."
      },
      company: {
        title: "Sobre The ScREAte Ltd",
        content: [
          "DripLove é orgulhosamente criado pela The ScREAte Ltd, uma empresa de tecnologia dedicada a construir experiências digitais inovadoras que aproximam as pessoas. Somos especializados em criar plataformas que promovem conexões humanas genuínas.",
          "Nossa equipe combina expertise técnica com uma compreensão profunda dos relacionamentos humanos para criar produtos que fazem uma diferença significativa na vida das pessoas."
        ]
      },
      safety: {
        title: "Segurança e Proteção",
        intro: "Sua segurança é fundamental para nós. O DripLove implementa medidas de segurança abrangentes, incluindo:",
        points: [
          "Sistemas de verificação de perfil",
          "Recursos avançados de denúncia e bloqueio",
          "Moderação e suporte 24/7",
          "Criptografia de ponta a ponta para mensagens privadas",
          "Controles rígidos de privacidade"
        ]
      }
    }
  },
  ar: {
    title: "عن DripLove",
    back: "رجوع",
    lastUpdated: "آخر تحديث: 13 يوليو 2025",
    sections: {
      mission: {
        title: "مهمتنا",
        content: [
          "DripLove ليس مجرد تطبيق مواعدة - نحن مجتمع عالمي مكرس لمساعدة الناس في إيجاد اتصالات حقيقية وعلاقات ذات مغزى. مهمتنا هي إنشاء منصة آمنة وشاملة وحيوية حيث لا يعرف الحب حدودًا.",
          "سواء كنت تبحث عن توأم روحك أو شريك حياتك أو صداقات جديدة، يوفر DripLove الأدوات والمجتمع لمساعدتك في اكتشاف اتصالات حقيقية مهمة."
        ]
      },
      different: {
        title: "ما يجعلنا مختلفين",
        intro: "يتميز DripLove في مشهد تطبيقات المواعدة المزدحم من خلال التزامنا بـ:",
        points: [
          "اتصالات حقيقية مبنية على القيم والاهتمامات المشتركة",
          "مجتمع عالمي متنوع يحتفل بجميع الخلفيات",
          "خوارزميات مطابقة متقدمة تعطي الأولوية للتوافق",
          "بيئة آمنة ومأمونة وخالية من المضايقات",
          "ميزات شاملة مصممة للجميع"
        ]
      },
      community: {
        title: "المجتمع العالمي",
        content: [
          "من نيويورك إلى نيروبي، من لندن إلى لاغوس، من طوكيو إلى تورنتو - يربط DripLove القلوب عبر القارات. تجمع منصتنا أرواحًا نابضة بالحياة من جميع مناحي الحياة، مما يخلق تجربة مواعدة عالمية حقيقية.",
          "الحب لا يعترف بالحدود، ونحن أيضًا. سواء كنت تبحث عن اتصالات محلية أو رومانسية دولية، يجعل DripLove ذلك ممكنًا."
        ]
      },
      values: {
        title: "قيمنا",
        authenticity: {
          title: "الأصالة",
          description: "نشجع الاتصالات الحقيقية والمحادثات الواقعية."
        },
        inclusivity: {
          title: "الشمولية",
          description: "الجميع مرحب بهم بغض النظر عن الخلفية أو الهوية أو المعتقدات."
        },
        safety: {
          title: "السلامة",
          description: "أمنك وخصوصيتك هما أولوياتنا القصوى."
        },
        innovation: {
          title: "الابتكار",
          description: "نحسن باستمرار لتوفير أفضل تجربة مواعدة."
        }
      },
      journey: {
        title: "رحلتنا",
        content: "تأسس DripLove في عام 2024، ولد من اعتقاد بسيط: يستحق الجميع أن يجدوا الحب. فريقنا متحمس لإنشاء تقنية تجمع الناس معًا، وليس تفرقهم."
      },
      contact: {
        title: "ابق على تواصل",
        content: "نحب أن نسمع من مجتمعنا! سواء كانت لديك أسئلة أو ملاحظات أو تريد فقط أن تقول مرحبًا، نحن هنا من أجلك.",
        email: "راسلنا عبر البريد الإلكتروني على:",
        support: "لاستفسارات الدعم:",
        social: "تابعنا على وسائل التواصل الاجتماعي للبقاء على اطلاع بأحدث الميزات وقصص النجاح."
      },
      company: {
        title: "عن The ScREAte Ltd",
        content: [
          "تم إنشاء DripLove بفخر بواسطة The ScREAte Ltd، وهي شركة تكنولوجيا مكرسة لبناء تجارب رقمية مبتكرة تجمع الناس معًا. نحن متخصصون في إنشاء منصات تعزز الاتصالات الإنسانية الحقيقية.",
          "يجمع فريقنا بين الخبرة التقنية والفهم العميق للعلاقات الإنسانية لإنشاء منتجات تحدث فرقًا ذا مغزى في حياة الناس."
        ]
      },
      safety: {
        title: "السلامة والأمان",
        intro: "سلامتك لها أهمية قصوى بالنسبة لنا. ينفذ DripLove تدابير أمنية شاملة بما في ذلك:",
        points: [
          "أنظمة التحقق من الملف الشخصي",
          "ميزات متقدمة للإبلاغ والحظر",
          "الإشراف والدعم على مدار الساعة طوال أيام الأسبوع",
          "التشفير من طرف إلى طرف للرسائل الخاصة",
          "ضوابط خصوصية صارمة"
        ]
      }
    }
  }
};

// Update each language file
const languages = ['zh', 'sw', 'pt', 'ar'];

languages.forEach(lang => {
  const filePath = path.join(localesDir, `${lang}.json`);
  
  try {
    // Read existing file
    const content = fs.readFileSync(filePath, 'utf8');
    const translations = JSON.parse(content);
    
    // Replace aboutUs section
    translations.aboutUs = correctAboutUsStructures[lang];
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(translations, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated ${lang}.json with correct aboutUs structure`);
  } catch (error) {
    console.error(`❌ Error updating ${lang}.json:`, error.message);
  }
});

console.log('\n✨ All aboutUs sections have been updated!');
