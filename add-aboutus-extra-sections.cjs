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

const extraSections = {
  en: {
    aboutUs: {
      sections: {
        company: {
          title: "About The ScREAte Ltd",
          content: [
            "DripLove is proudly created by The ScREAte Ltd, a technology company dedicated to building innovative digital experiences that bring people together. We specialize in creating platforms that foster genuine human connections.",
            "Our team combines technical expertise with a deep understanding of human relationships to create products that make a meaningful difference in people's lives."
          ]
        },
        safety: {
          title: "Safety & Security",
          intro: "Your safety is paramount to us. DripLove implements comprehensive security measures including:",
          points: [
            "Profile verification systems",
            "Advanced reporting and blocking features",
            "24/7 moderation and support",
            "End-to-end encryption for private messages",
            "Strict privacy controls"
          ]
        }
      }
    }
  },
  fr: {
    aboutUs: {
      sections: {
        company: {
          title: "À propos de The ScREAte Ltd",
          content: [
            "DripLove est fièrement créé par The ScREAte Ltd, une entreprise technologique dédiée à la création d'expériences numériques innovantes qui rapprochent les gens. Nous nous spécialisons dans la création de plateformes qui favorisent de véritables connexions humaines.",
            "Notre équipe combine expertise technique et compréhension approfondie des relations humaines pour créer des produits qui font une différence significative dans la vie des gens."
          ]
        },
        safety: {
          title: "Sécurité et Protection",
          intro: "Votre sécurité est primordiale pour nous. DripLove met en œuvre des mesures de sécurité complètes comprenant:",
          points: [
            "Systèmes de vérification de profil",
            "Fonctionnalités avancées de signalement et de blocage",
            "Modération et support 24/7",
            "Chiffrement de bout en bout pour les messages privés",
            "Contrôles de confidentialité stricts"
          ]
        }
      }
    }
  },
  de: {
    aboutUs: {
      sections: {
        company: {
          title: "Über The ScREAte Ltd",
          content: [
            "DripLove wird stolz von The ScREAte Ltd erstellt, einem Technologieunternehmen, das sich der Entwicklung innovativer digitaler Erlebnisse widmet, die Menschen zusammenbringen. Wir sind spezialisiert auf die Entwicklung von Plattformen, die echte menschliche Verbindungen fördern.",
            "Unser Team kombiniert technisches Fachwissen mit einem tiefen Verständnis menschlicher Beziehungen, um Produkte zu schaffen, die einen bedeutenden Unterschied im Leben der Menschen machen."
          ]
        },
        safety: {
          title: "Sicherheit und Schutz",
          intro: "Ihre Sicherheit hat für uns höchste Priorität. DripLove implementiert umfassende Sicherheitsmaßnahmen einschließlich:",
          points: [
            "Profilverifizierungssysteme",
            "Erweiterte Melde- und Blockierungsfunktionen",
            "24/7 Moderation und Support",
            "Ende-zu-Ende-Verschlüsselung für private Nachrichten",
            "Strenge Datenschutzkontrollen"
          ]
        }
      }
    }
  },
  zh: {
    aboutUs: {
      sections: {
        company: {
          title: "关于 The ScREAte Ltd",
          content: [
            "DripLove 由 The ScREAte Ltd 自豪地创建，这是一家致力于构建创新数字体验的科技公司，将人们聚集在一起。我们专注于创建促进真实人际联系的平台。",
            "我们的团队将技术专长与对人际关系的深刻理解相结合，创造出对人们生活产生有意义影响的产品。"
          ]
        },
        safety: {
          title: "安全与保障",
          intro: "您的安全对我们至关重要。DripLove 实施全面的安全措施，包括：",
          points: [
            "个人资料验证系统",
            "高级举报和屏蔽功能",
            "全天候审核和支持",
            "私密消息的端到端加密",
            "严格的隐私控制"
          ]
        }
      }
    }
  },
  sw: {
    aboutUs: {
      sections: {
        company: {
          title: "Kuhusu The ScREAte Ltd",
          content: [
            "DripLove imeundwa kwa fahari na The ScREAte Ltd, kampuni ya teknolojia iliyojitolea kujenga uzoefu wa kisasa wa kidijitali unaoleta watu pamoja. Tunataalam katika kuunda majukwaa yanayohamasisha uhusiano wa kweli wa kibinadamu.",
            "Timu yetu inachanganya utaalamu wa kiufundi na uelewa wa kina wa mahusiano ya kibinadamu ili kuunda bidhaa zinazofanya tofauti muhimu katika maisha ya watu."
          ]
        },
        safety: {
          title: "Usalama na Ulinzi",
          intro: "Usalama wako ni muhimu kwetu. DripLove inatekeleza hatua za kina za usalama ikijumuisha:",
          points: [
            "Mifumo ya uthibitishaji wa wasifu",
            "Vipengele vya hali ya juu vya kuripoti na kuzuia",
            "Usimamizi na usaidizi wa saa 24/7",
            "Usimbaji wa mwisho-hadi-mwisho kwa ujumbe wa faragha",
            "Udhibiti mkali wa faragha"
          ]
        }
      }
    }
  },
  pt: {
    aboutUs: {
      sections: {
        company: {
          title: "Sobre The ScREAte Ltd",
          content: [
            "DripLove é orgulhosamente criado pela The ScREAte Ltd, uma empresa de tecnologia dedicada a construir experiências digitais inovadoras que aproximam as pessoas. Somos especializados na criação de plataformas que promovem conexões humanas genuínas.",
            "Nossa equipe combina expertise técnica com profundo entendimento de relacionamentos humanos para criar produtos que fazem uma diferença significativa na vida das pessoas."
          ]
        },
        safety: {
          title: "Segurança e Proteção",
          intro: "Sua segurança é primordial para nós. DripLove implementa medidas de segurança abrangentes incluindo:",
          points: [
            "Sistemas de verificação de perfil",
            "Recursos avançados de denúncia e bloqueio",
            "Moderação e suporte 24/7",
            "Criptografia de ponta a ponta para mensagens privadas",
            "Controles rígidos de privacidade"
          ]
        }
      }
    }
  },
  ar: {
    aboutUs: {
      sections: {
        company: {
          title: "حول The ScREAte Ltd",
          content: [
            "تم إنشاء DripLove بفخر بواسطة The ScREAte Ltd، وهي شركة تكنولوجيا مكرسة لبناء تجارب رقمية مبتكرة تجمع الناس معًا. نحن متخصصون في إنشاء منصات تعزز الاتصالات البشرية الحقيقية.",
            "يجمع فريقنا بين الخبرة التقنية والفهم العميق للعلاقات الإنسانية لإنشاء منتجات تحدث فرقًا ذا معنى في حياة الناس."
          ]
        },
        safety: {
          title: "الأمان والحماية",
          intro: "سلامتك هي أولويتنا القصوى. ينفذ DripLove تدابير أمان شاملة بما في ذلك:",
          points: [
            "أنظمة التحقق من الملف الشخصي",
            "ميزات الإبلاغ والحظر المتقدمة",
            "المراقبة والدعم على مدار الساعة طوال أيام الأسبوع",
            "التشفير من طرف إلى طرف للرسائل الخاصة",
            "ضوابط خصوصية صارمة"
          ]
        }
      }
    }
  }
};

const localesDir = path.join(__dirname, 'src', 'i18n', 'locales');

['en', 'fr', 'de', 'zh', 'sw', 'pt', 'ar'].forEach(lang => {
  const filePath = path.join(localesDir, `${lang}.json`);
  const existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  const updatedData = deepMerge(existingData, extraSections[lang]);
  
  fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2), 'utf8');
  console.log(`✅ Updated ${lang}.json with extra AboutUs sections`);
});

console.log('\n✨ All language files updated successfully!');
