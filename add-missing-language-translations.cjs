const fs = require('fs');
const path = require('path');

// Deep merge function to preserve existing translations
function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] instanceof Object && key in target) {
      Object.assign(source[key], deepMerge(target[key], source[key]));
    }
  }
  return Object.assign(target || {}, source);
}

// Translations for each language
const translations = {
  zh: {
    welcome: {
      tagline: "感受火花，坠入爱河",
      subtitle: "真实的共鸣。真实的人。真实的爱。",
      getStarted: "开始使用",
      joinThousands: "加入成千上万跨越大陆寻找爱情的人",
      aboutLink: "关于DripLove",
      termsLink: "服务条款",
      privacyLink: "隐私政策"
    },
    registration: {
      title: "创建您的个人资料",
      subtitle: "告诉我们关于您的信息",
      firstName: "名字",
      lastName: "姓氏",
      dateOfBirth: "出生日期",
      gender: "性别",
      male: "男",
      female: "女",
      nonBinary: "非二元",
      preferNotToSay: "不愿透露",
      interestedIn: "感兴趣的对象",
      location: "位置",
      city: "城市",
      country: "国家",
      continue: "继续",
      skip: "暂时跳过",
      errors: {
        firstNameRequired: "名字为必填项",
        lastNameRequired: "姓氏为必填项",
        dobRequired: "出生日期为必填项",
        mustBe18: "您必须年满18岁",
        genderRequired: "请选择您的性别",
        preferenceRequired: "请选择您的偏好"
      },
      createAccount: "创建账户",
      tellUsMore: "告诉我们更多",
      addPhotos: "添加您的照片",
      step1Description: "只需一些基本信息即可开始。您可以稍后完善个人资料以获得更好的匹配！",
      step2Description: "通过一些额外的细节帮助我们找到您的理想伴侣！",
      step3Description: "上传至少2张照片以完成您的个人资料",
      iAm: "我是",
      lookingFor: "我在寻找",
      selectGender: "选择性别",
      selectPreference: "选择偏好",
      everyone: "所有人",
      other: "其他",
      relationshipIntent: "关系意向",
      whatLookingFor: "您在寻找什么？",
      casual: "随意",
      serious: "认真",
      openToAnything: "开放态度",
      workEducation: "工作和教育",
      selectOccupation: "选择您的职业",
      selectIndustry: "选择您的行业",
      educationLevel: "教育水平",
      selectEducation: "选择您的教育水平",
      highSchool: "高中",
      someCollege: "大学在读",
      associateDegree: "副学士学位",
      bachelorsDegree: "学士学位",
      mastersDegree: "硕士学位",
      doctorate: "博士学位",
      photoVerification: "照片验证",
      photoVerificationDesc: "所有照片均由AI自动验证以确保真实性和安全性。",
      photosChecked: "所有照片都会自动检查是否合适",
      uploadPhotosLabel: "上传照片（至少需要2张）",
      photoGuidelines: "照片指南：",
      clearPhotoFace: "清晰显示您的脸部",
      appropriateClothing: "穿着得体",
      noExplicit: "无明确或冒犯性内容",
      borderlineMayReview: "边缘内容可能需要审核",
      back: "返回",
      addPhoto: "添加照片",
      creatingAccount: "正在创建账户...",
      alreadyHaveAccount: "已有账户？登录",
      uploadAtLeastTwoPhotos: "请至少上传2张照片",
      removeRejectedImages: "请删除被拒绝的图片",
      reuploadTwoPhotos: "请重新上传至少2张新照片"
    },
    profileCompletion: {
      title: "完善您的个人资料",
      subtitle: "添加更多细节以获得更好的匹配",
      completeProfile: "完成个人资料",
      completingProfile: "正在完成...",
      cancel: "取消",
      firstName: "名字",
      lastName: "姓氏",
      dateOfBirth: "出生日期",
      location: "位置",
      occupation: "职业",
      industry: "行业",
      education: "教育",
      profilePhotos: "个人资料照片",
      uploadPhotosHeading: "上传您的照片",
      uploadPhotosText: "至少上传2张照片以展示您的个性",
      uploadPhotoGuidelines: "照片指南：",
      clearFacePhoto: "清晰显示您的脸部",
      appropriateClothing: "穿着得体",
      noExplicitContent: "无明确内容",
      borderlineReview: "边缘内容可能需要审核",
      moderating: "审核中",
      pending: "待定",
      approved: "已批准",
      rejected: "已拒绝"
    },
    termsAcceptance: {
      cardTitle: "服务条款",
      cardDescription: "在继续之前请查看并接受我们的条款",
      termsOfService: "服务条款",
      agreementText: "我已阅读并同意DripLove的服务条款和隐私政策。我确认我至少18岁，并将负责任地使用该平台。",
      accept: "接受并继续",
      processing: "处理中...",
      acknowledgment: "感谢您接受我们的条款",
      mustAccept: "您必须接受条款才能继续",
      termsAccepted: "条款已接受",
      thankYou: "谢谢！",
      error: "错误",
      failedToSave: "保存失败"
    },
    match: {
      itsAMatch: "匹配成功！🎉",
      youAndLikedEachOther: "您和{{name}}互相喜欢！",
      startChatting: "开始聊天",
      keepSwiping: "继续滑动"
    },
    privacyPolicy: {
      title: "隐私政策",
      lastUpdated: "最后更新：2025年7月13日"
    },
    termsOfService: {
      title: "服务条款",
      lastUpdated: "最后更新：2025年7月13日"
    },
    aboutUs: {
      title: "关于DripLove",
      subtitle: "连接跨越大陆的心灵",
      ourStory: {
        heading: "我们的故事",
        description: "DripLove诞生于一个简单的信念：爱不应该受到边界的限制。我们创建了一个平台，庆祝多样性，促进真实的联系，并帮助人们找到他们的完美伴侣，无论他们身在何处。"
      },
      ourMission: {
        heading: "我们的使命",
        description: "通过尖端技术和真正关心用户体验，使有意义的关系成为可能。我们致力于创建一个安全、包容和充满活力的社区，让爱情可以跨越文化和距离蓬勃发展。"
      },
      whatMakesUsDifferent: {
        heading: "我们的与众不同之处",
        globalReach: "全球覆盖，本地化体验",
        globalReachDesc: "在多个国家和城市连接，同时尊重当地文化和偏好。",
        authenticProfiles: "真实个人资料",
        authenticProfilesDesc: "高级验证系统确保真实的联系和安全的约会环境。",
        smartMatching: "智能匹配",
        smartMatchingDesc: "我们的AI驱动算法考虑兴趣、价值观和兼容性以找到您的完美匹配。",
        culturalSensitivity: "文化敏感性",
        culturalSensitivityDesc: "我们理解并尊重不同的约会规范和文化偏好。"
      },
      safetyFirst: {
        heading: "安全第一",
        description: "您的安全是我们的首要任务。我们采用行业领先的安全措施、照片验证和24/7审核团队，以确保积极和安全的约会体验。"
      },
      joinOurCommunity: {
        heading: "加入我们的社区",
        description: "成为成千上万找到爱情、友谊和有意义联系的人之一。无论您是在寻找认真的关系还是遇见新朋友，DripLove都是您开始旅程的地方。"
      },
      contactUs: {
        heading: "联系我们",
        description: "有问题或反馈？我们很乐意听取您的意见。"
      }
    }
  },
  sw: {
    welcome: {
      tagline: "Hisi Cheche. Anguka Mapenzi",
      subtitle: "Mzunguko wa kweli. Watu wa kweli. Upendo wa kweli.",
      getStarted: "Anza",
      joinThousands: "Jiunge na maelfu wanaopata upendo kote ulimwenguni",
      aboutLink: "Kuhusu DripLove",
      termsLink: "Masharti ya Huduma",
      privacyLink: "Sera ya Faragha"
    },
    registration: {
      title: "Unda Wasifu Wako",
      subtitle: "Tuambie kuhusu wewe",
      firstName: "Jina la Kwanza",
      lastName: "Jina la Ukoo",
      dateOfBirth: "Tarehe ya Kuzaliwa",
      gender: "Jinsia",
      male: "Mwanaume",
      female: "Mwanamke",
      nonBinary: "Si Binary",
      preferNotToSay: "Sipendelei Kusema",
      interestedIn: "Nimependezwa na",
      location: "Mahali",
      city: "Jiji",
      country: "Nchi",
      continue: "Endelea",
      skip: "Ruka Kwa Sasa",
      errors: {
        firstNameRequired: "Jina la kwanza linahitajika",
        lastNameRequired: "Jina la ukoo linahitajika",
        dobRequired: "Tarehe ya kuzaliwa inahitajika",
        mustBe18: "Lazima uwe na umri wa miaka 18",
        genderRequired: "Tafadhali chagua jinsia yako",
        preferenceRequired: "Tafadhali chagua mapendeleo yako"
      },
      createAccount: "Unda Akaunti",
      tellUsMore: "Tuambie Zaidi",
      addPhotos: "Ongeza Picha Zako",
      step1Description: "Maelezo machache tu kuanza. Unaweza kukamilisha wasifu wako baadaye kwa mechi bora!",
      step2Description: "Tusaidie kupata mwenzi wako bora na maelezo machache zaidi!",
      step3Description: "Pakia angalau picha 2 kukamilisha wasifu wako",
      iAm: "Mimi ni",
      lookingFor: "Ninatafuta",
      selectGender: "Chagua Jinsia",
      selectPreference: "Chagua Mapendeleo",
      everyone: "Kila Mtu",
      other: "Nyingine",
      relationshipIntent: "Nia ya Mahusiano",
      whatLookingFor: "Unatafuta nini?",
      casual: "Kawaida",
      serious: "Makini",
      openToAnything: "Wazi kwa Chochote",
      workEducation: "Kazi na Elimu",
      selectOccupation: "Chagua Kazi Yako",
      selectIndustry: "Chagua Sekta Yako",
      educationLevel: "Kiwango cha Elimu",
      selectEducation: "Chagua Kiwango chako cha Elimu",
      highSchool: "Shule ya Sekondari",
      someCollege: "Chuo Kidogo",
      associateDegree: "Shahada ya Associate",
      bachelorsDegree: "Shahada ya Kwanza",
      mastersDegree: "Shahada ya Uzamili",
      doctorate: "Shahada ya Uzamivu",
      photoVerification: "Uthibitishaji wa Picha",
      photoVerificationDesc: "Picha zote zinakaguliwa kiotomatiki na AI kuhakikisha uhalisi na usalama.",
      photosChecked: "Picha zote zinakaguliwa kiotomatiki kwa kufaa",
      uploadPhotosLabel: "Pakia Picha (Angalau 2 zinahitajika)",
      photoGuidelines: "Miongozo ya Picha:",
      clearPhotoFace: "Onyesha uso wako wazi",
      appropriateClothing: "Vaa mavazi yanayofaa",
      noExplicit: "Hakuna maudhui wazi au ya kukera",
      borderlineMayReview: "Maudhui ya borderline yanaweza kuhitaji ukaguzi",
      back: "Rudi",
      addPhoto: "Ongeza Picha",
      creatingAccount: "Kuunda Akaunti...",
      alreadyHaveAccount: "Tayari una akaunti? Ingia",
      uploadAtLeastTwoPhotos: "Tafadhali pakia angalau picha 2",
      removeRejectedImages: "Tafadhali ondoa picha zilizokataliwa",
      reuploadTwoPhotos: "Tafadhali pakia tena angalau picha 2 mpya"
    },
    profileCompletion: {
      title: "Kamilisha Wasifu Wako",
      subtitle: "Ongeza maelezo zaidi kwa mechi bora",
      completeProfile: "Kamilisha Wasifu",
      completingProfile: "Inakamilisha...",
      cancel: "Ghairi",
      firstName: "Jina la Kwanza",
      lastName: "Jina la Ukoo",
      dateOfBirth: "Tarehe ya Kuzaliwa",
      location: "Mahali",
      occupation: "Kazi",
      industry: "Sekta",
      education: "Elimu",
      profilePhotos: "Picha za Wasifu",
      uploadPhotosHeading: "Pakia Picha Zako",
      uploadPhotosText: "Pakia angalau picha 2 kuonyesha utu wako",
      uploadPhotoGuidelines: "Miongozo ya Picha:",
      clearFacePhoto: "Onyesha uso wako wazi",
      appropriateClothing: "Vaa mavazi yanayofaa",
      noExplicitContent: "Hakuna maudhui wazi",
      borderlineReview: "Maudhui ya borderline yanaweza kuhitaji ukaguzi",
      moderating: "Inakaguliwa",
      pending: "Inasubiri",
      approved: "Imeidhinishwa",
      rejected: "Imekataliwa"
    },
    termsAcceptance: {
      cardTitle: "Masharti ya Huduma",
      cardDescription: "Tafadhali kagua na ukubali masharti yetu kabla ya kuendelea",
      termsOfService: "Masharti ya Huduma",
      agreementText: "Nimesoma na kukubali Masharti ya Huduma na Sera ya Faragha ya DripLove. Ninathibitisha kuwa nina umri wa angalau miaka 18 na nitatumia jukwaa hili kwa uwajibikaji.",
      accept: "Kubali na Endelea",
      processing: "Inashughulikia...",
      acknowledgment: "Asante kwa kukubali masharti yetu",
      mustAccept: "Lazima ukubali masharti ili kuendelea",
      termsAccepted: "Masharti yamekubaliwa",
      thankYou: "Asante!",
      error: "Hitilafu",
      failedToSave: "Imeshindwa kuhifadhi"
    },
    match: {
      itsAMatch: "Ni Mechi! 🎉",
      youAndLikedEachOther: "Wewe na {{name}} mmependana!",
      startChatting: "Anza Kugonga",
      keepSwiping: "Endelea Kupiga"
    },
    privacyPolicy: {
      title: "Sera ya Faragha",
      lastUpdated: "Imesasishwa mwisho: Julai 13, 2025"
    },
    termsOfService: {
      title: "Masharti ya Huduma",
      lastUpdated: "Imesasishwa mwisho: Julai 13, 2025"
    },
    aboutUs: {
      title: "Kuhusu DripLove",
      subtitle: "Kuunganisha mioyo kote bara",
      ourStory: {
        heading: "Hadithi Yetu",
        description: "DripLove ilizaliwa kutokana na imani rahisi: upendo haupaswi kuwekwa mipaka. Tumeunda jukwaa linalosherehekea utofauti, kukuza uhusiano wa kweli, na kusaidia watu kupata mwenzi wao kamilifu, bila kujali wapo wapi."
      },
      ourMission: {
        heading: "Dhamira Yetu",
        description: "Kufanya mahusiano yenye maana yawezekaneavyo kupitia teknolojia ya kisasa na kujali uzoefu wa watumiaji. Tumejitolea kuunda jamii salama, ya pamoja na yenye nguvu ambapo upendo unaweza kustawi kote tamaduni na umbali."
      },
      whatMakesUsDifferent: {
        heading: "Kinachotufanya Tofauti",
        globalReach: "Fikio la Kimataifa, Uzoefu wa Kikanda",
        globalReachDesc: "Unganisha katika nchi na miji mingi huku ukiheshimu tamaduni za kikanda na mapendeleo.",
        authenticProfiles: "Wasifu Halisi",
        authenticProfilesDesc: "Mfumo wa juu wa uthibitishaji unahakikisha miunganisho halisi na mazingira salama ya kutembelea.",
        smartMatching: "Ulinganifu Mahiri",
        smartMatchingDesc: "Algoriti yetu inayoendeshwa na AI inazingatia maslahi, maadili na upatanisho kupata mechi yako kamilifu.",
        culturalSensitivity: "Unyeti wa Kitamaduni",
        culturalSensitivityDesc: "Tunaelewa na kuheshimu miiko tofauti ya kutembelea na mapendeleo ya kitamaduni."
      },
      safetyFirst: {
        heading: "Usalama Kwanza",
        description: "Usalama wako ni kipaumbele chetu cha juu. Tunatumia hatua za usalama za kiwango cha sekta, uthibitishaji wa picha, na timu ya kusimamia 24/7 kuhakikisha uzoefu chanya na salama wa kutembelea."
      },
      joinOurCommunity: {
        heading: "Jiunge na Jamii Yetu",
        description: "Kuwa mmoja wa maelfu waliokuta upendo, urafiki, na uhusiano wenye maana. Iwe unatafuta mahusiano makini au kukutana na marafiki wapya, DripLove ndipo safari yako inapoanza."
      },
      contactUs: {
        heading: "Wasiliana Nasi",
        description: "Una maswali au maoni? Tungependa kusikia kutoka kwako."
      }
    }
  },
  pt: {
    welcome: {
      tagline: "Sinta a Faísca. Apaixone-se",
      subtitle: "Vibrações reais. Pessoas reais. Amor real.",
      getStarted: "Começar",
      joinThousands: "Junte-se a milhares encontrando amor através dos continentes",
      aboutLink: "Sobre o DripLove",
      termsLink: "Termos de Serviço",
      privacyLink: "Política de Privacidade"
    },
    registration: {
      title: "Crie Seu Perfil",
      subtitle: "Conte-nos sobre você",
      firstName: "Nome",
      lastName: "Sobrenome",
      dateOfBirth: "Data de Nascimento",
      gender: "Gênero",
      male: "Masculino",
      female: "Feminino",
      nonBinary: "Não-binário",
      preferNotToSay: "Prefiro não dizer",
      interestedIn: "Interessado(a) em",
      location: "Localização",
      city: "Cidade",
      country: "País",
      continue: "Continuar",
      skip: "Pular por enquanto",
      errors: {
        firstNameRequired: "Nome é obrigatório",
        lastNameRequired: "Sobrenome é obrigatório",
        dobRequired: "Data de nascimento é obrigatória",
        mustBe18: "Você deve ter pelo menos 18 anos",
        genderRequired: "Por favor, selecione seu gênero",
        preferenceRequired: "Por favor, selecione sua preferência"
      },
      createAccount: "Criar Conta",
      tellUsMore: "Conte-nos Mais",
      addPhotos: "Adicione Suas Fotos",
      step1Description: "Apenas alguns detalhes para começar. Você pode completar seu perfil mais tarde para melhores combinações!",
      step2Description: "Ajude-nos a encontrar seu par ideal com alguns detalhes adicionais!",
      step3Description: "Envie pelo menos 2 fotos para completar seu perfil",
      iAm: "Eu sou",
      lookingFor: "Estou procurando",
      selectGender: "Selecionar Gênero",
      selectPreference: "Selecionar Preferência",
      everyone: "Todos",
      other: "Outro",
      relationshipIntent: "Intenção de Relacionamento",
      whatLookingFor: "O que você está procurando?",
      casual: "Casual",
      serious: "Sério",
      openToAnything: "Aberto a Qualquer Coisa",
      workEducation: "Trabalho e Educação",
      selectOccupation: "Selecione Sua Ocupação",
      selectIndustry: "Selecione Seu Setor",
      educationLevel: "Nível de Educação",
      selectEducation: "Selecione Seu Nível de Educação",
      highSchool: "Ensino Médio",
      someCollege: "Alguma Faculdade",
      associateDegree: "Grau Associado",
      bachelorsDegree: "Bacharelado",
      mastersDegree: "Mestrado",
      doctorate: "Doutorado",
      photoVerification: "Verificação de Fotos",
      photoVerificationDesc: "Todas as fotos são verificadas automaticamente por IA para garantir autenticidade e segurança.",
      photosChecked: "Todas as fotos são verificadas automaticamente quanto à adequação",
      uploadPhotosLabel: "Enviar Fotos (Mínimo de 2 necessárias)",
      photoGuidelines: "Diretrizes de Fotos:",
      clearPhotoFace: "Mostre seu rosto claramente",
      appropriateClothing: "Vista roupas apropriadas",
      noExplicit: "Sem conteúdo explícito ou ofensivo",
      borderlineMayReview: "Conteúdo limítrofe pode precisar de revisão",
      back: "Voltar",
      addPhoto: "Adicionar Foto",
      creatingAccount: "Criando Conta...",
      alreadyHaveAccount: "Já tem uma conta? Entrar",
      uploadAtLeastTwoPhotos: "Por favor, envie pelo menos 2 fotos",
      removeRejectedImages: "Por favor, remova imagens rejeitadas",
      reuploadTwoPhotos: "Por favor, reenvie pelo menos 2 novas fotos"
    },
    profileCompletion: {
      title: "Complete Seu Perfil",
      subtitle: "Adicione mais detalhes para melhores combinações",
      completeProfile: "Completar Perfil",
      completingProfile: "Completando...",
      cancel: "Cancelar",
      firstName: "Nome",
      lastName: "Sobrenome",
      dateOfBirth: "Data de Nascimento",
      location: "Localização",
      occupation: "Ocupação",
      industry: "Setor",
      education: "Educação",
      profilePhotos: "Fotos do Perfil",
      uploadPhotosHeading: "Envie Suas Fotos",
      uploadPhotosText: "Envie pelo menos 2 fotos para mostrar sua personalidade",
      uploadPhotoGuidelines: "Diretrizes de Fotos:",
      clearFacePhoto: "Mostre seu rosto claramente",
      appropriateClothing: "Vista roupas apropriadas",
      noExplicitContent: "Sem conteúdo explícito",
      borderlineReview: "Conteúdo limítrofe pode precisar de revisão",
      moderating: "Moderando",
      pending: "Pendente",
      approved: "Aprovado",
      rejected: "Rejeitado"
    },
    termsAcceptance: {
      cardTitle: "Termos de Serviço",
      cardDescription: "Por favor, revise e aceite nossos termos antes de continuar",
      termsOfService: "Termos de Serviço",
      agreementText: "Li e concordo com os Termos de Serviço e Política de Privacidade do DripLove. Confirmo que tenho pelo menos 18 anos e usarei a plataforma com responsabilidade.",
      accept: "Aceitar e Continuar",
      processing: "Processando...",
      acknowledgment: "Obrigado por aceitar nossos termos",
      mustAccept: "Você deve aceitar os termos para continuar",
      termsAccepted: "Termos aceitos",
      thankYou: "Obrigado!",
      error: "Erro",
      failedToSave: "Falha ao salvar"
    },
    match: {
      itsAMatch: "É um Match! 🎉",
      youAndLikedEachOther: "Você e {{name}} curtiram um ao outro!",
      startChatting: "Começar a Conversar",
      keepSwiping: "Continuar Deslizando"
    },
    privacyPolicy: {
      title: "Política de Privacidade",
      lastUpdated: "Última atualização: 13 de julho de 2025"
    },
    termsOfService: {
      title: "Termos de Serviço",
      lastUpdated: "Última atualização: 13 de julho de 2025"
    },
    aboutUs: {
      title: "Sobre o DripLove",
      subtitle: "Conectando corações através dos continentes",
      ourStory: {
        heading: "Nossa História",
        description: "DripLove nasceu de uma crença simples: o amor não deve ser limitado por fronteiras. Criamos uma plataforma que celebra a diversidade, promove conexões genuínas e ajuda as pessoas a encontrarem seu par perfeito, não importa onde estejam."
      },
      ourMission: {
        heading: "Nossa Missão",
        description: "Tornar relacionamentos significativos possíveis através de tecnologia de ponta e um cuidado genuíno pela experiência do usuário. Estamos comprometidos em criar uma comunidade segura, inclusiva e vibrante onde o amor pode florescer através de culturas e distâncias."
      },
      whatMakesUsDifferent: {
        heading: "O Que Nos Torna Diferentes",
        globalReach: "Alcance Global, Experiência Local",
        globalReachDesc: "Conecte-se em vários países e cidades enquanto respeita culturas e preferências locais.",
        authenticProfiles: "Perfis Autênticos",
        authenticProfilesDesc: "Sistemas de verificação avançados garantem conexões genuínas e um ambiente de namoro seguro.",
        smartMatching: "Combinação Inteligente",
        smartMatchingDesc: "Nossos algoritmos movidos a IA consideram interesses, valores e compatibilidade para encontrar seu par perfeito.",
        culturalSensitivity: "Sensibilidade Cultural",
        culturalSensitivityDesc: "Entendemos e respeitamos diferentes normas de namoro e preferências culturais."
      },
      safetyFirst: {
        heading: "Segurança em Primeiro Lugar",
        description: "Sua segurança é nossa principal prioridade. Empregamos medidas de segurança líderes do setor, verificação de fotos e uma equipe de moderação 24/7 para garantir uma experiência de namoro positiva e segura."
      },
      joinOurCommunity: {
        heading: "Junte-se à Nossa Comunidade",
        description: "Seja um dos milhares que encontraram amor, amizade e conexões significativas. Esteja você procurando um relacionamento sério ou conhecer novos amigos, DripLove é onde sua jornada começa."
      },
      contactUs: {
        heading: "Entre em Contato",
        description: "Tem perguntas ou feedback? Adoraríamos ouvir de você."
      }
    }
  },
  ar: {
    welcome: {
      tagline: "اشعر بالشرارة. اقع في الحب",
      subtitle: "ذبذبات حقيقية. أشخاص حقيقيون. حب حقيقي.",
      getStarted: "ابدأ",
      joinThousands: "انضم إلى الآلاف الذين يجدون الحب عبر القارات",
      aboutLink: "عن DripLove",
      termsLink: "شروط الخدمة",
      privacyLink: "سياسة الخصوصية"
    },
    registration: {
      title: "أنشئ ملفك الشخصي",
      subtitle: "أخبرنا عن نفسك",
      firstName: "الاسم الأول",
      lastName: "اسم العائلة",
      dateOfBirth: "تاريخ الميلاد",
      gender: "الجنس",
      male: "ذكر",
      female: "أنثى",
      nonBinary: "غير ثنائي",
      preferNotToSay: "أفضل عدم القول",
      interestedIn: "مهتم بـ",
      location: "الموقع",
      city: "المدينة",
      country: "البلد",
      continue: "متابعة",
      skip: "تخطي الآن",
      errors: {
        firstNameRequired: "الاسم الأول مطلوب",
        lastNameRequired: "اسم العائلة مطلوب",
        dobRequired: "تاريخ الميلاد مطلوب",
        mustBe18: "يجب أن يكون عمرك 18 سنة على الأقل",
        genderRequired: "الرجاء اختيار جنسك",
        preferenceRequired: "الرجاء اختيار تفضيلك"
      },
      createAccount: "إنشاء حساب",
      tellUsMore: "أخبرنا المزيد",
      addPhotos: "أضف صورك",
      step1Description: "فقط بعض التفاصيل للبدء. يمكنك إكمال ملفك الشخصي لاحقاً للحصول على مطابقات أفضل!",
      step2Description: "ساعدنا في العثور على شريكك المثالي ببعض التفاصيل الإضافية!",
      step3Description: "قم بتحميل صورتين على الأقل لإكمال ملفك الشخصي",
      iAm: "أنا",
      lookingFor: "أبحث عن",
      selectGender: "اختر الجنس",
      selectPreference: "اختر التفضيل",
      everyone: "الجميع",
      other: "آخر",
      relationshipIntent: "نية العلاقة",
      whatLookingFor: "ماذا تبحث عنه؟",
      casual: "عادي",
      serious: "جدي",
      openToAnything: "منفتح على أي شيء",
      workEducation: "العمل والتعليم",
      selectOccupation: "اختر مهنتك",
      selectIndustry: "اختر مجالك",
      educationLevel: "مستوى التعليم",
      selectEducation: "اختر مستواك التعليمي",
      highSchool: "المدرسة الثانوية",
      someCollege: "بعض الجامعة",
      associateDegree: "درجة الزمالة",
      bachelorsDegree: "درجة البكالوريوس",
      mastersDegree: "درجة الماجستير",
      doctorate: "درجة الدكتوراه",
      photoVerification: "التحقق من الصور",
      photoVerificationDesc: "يتم فحص جميع الصور تلقائياً بواسطة الذكاء الاصطناعي لضمان الأصالة والأمان.",
      photosChecked: "يتم فحص جميع الصور تلقائياً للتأكد من ملاءمتها",
      uploadPhotosLabel: "تحميل الصور (مطلوب صورتان على الأقل)",
      photoGuidelines: "إرشادات الصور:",
      clearPhotoFace: "أظهر وجهك بوضوح",
      appropriateClothing: "ارتدِ ملابس مناسبة",
      noExplicit: "لا محتوى صريح أو مسيء",
      borderlineMayReview: "قد يحتاج المحتوى الحدودي إلى مراجعة",
      back: "رجوع",
      addPhoto: "إضافة صورة",
      creatingAccount: "جاري إنشاء الحساب...",
      alreadyHaveAccount: "لديك حساب بالفعل؟ تسجيل الدخول",
      uploadAtLeastTwoPhotos: "الرجاء تحميل صورتين على الأقل",
      removeRejectedImages: "الرجاء إزالة الصور المرفوضة",
      reuploadTwoPhotos: "الرجاء إعادة تحميل صورتين جديدتين على الأقل"
    },
    profileCompletion: {
      title: "أكمل ملفك الشخصي",
      subtitle: "أضف المزيد من التفاصيل للحصول على مطابقات أفضل",
      completeProfile: "إكمال الملف الشخصي",
      completingProfile: "جاري الإكمال...",
      cancel: "إلغاء",
      firstName: "الاسم الأول",
      lastName: "اسم العائلة",
      dateOfBirth: "تاريخ الميلاد",
      location: "الموقع",
      occupation: "المهنة",
      industry: "المجال",
      education: "التعليم",
      profilePhotos: "صور الملف الشخصي",
      uploadPhotosHeading: "قم بتحميل صورك",
      uploadPhotosText: "قم بتحميل صورتين على الأقل لإظهار شخصيتك",
      uploadPhotoGuidelines: "إرشادات الصور:",
      clearFacePhoto: "أظهر وجهك بوضوح",
      appropriateClothing: "ارتدِ ملابس مناسبة",
      noExplicitContent: "لا محتوى صريح",
      borderlineReview: "قد يحتاج المحتوى الحدودي إلى مراجعة",
      moderating: "قيد المراجعة",
      pending: "معلق",
      approved: "موافق عليه",
      rejected: "مرفوض"
    },
    termsAcceptance: {
      cardTitle: "شروط الخدمة",
      cardDescription: "يرجى مراجعة وقبول شروطنا قبل المتابعة",
      termsOfService: "شروط الخدمة",
      agreementText: "لقد قرأت ووافقت على شروط الخدمة وسياسة الخصوصية الخاصة بـ DripLove. أؤكد أن عمري 18 عاماً على الأقل وسأستخدم المنصة بمسؤولية.",
      accept: "قبول والمتابعة",
      processing: "جاري المعالجة...",
      acknowledgment: "شكراً لقبولك شروطنا",
      mustAccept: "يجب عليك قبول الشروط للمتابعة",
      termsAccepted: "تم قبول الشروط",
      thankYou: "شكراً لك!",
      error: "خطأ",
      failedToSave: "فشل الحفظ"
    },
    match: {
      itsAMatch: "إنها مطابقة! 🎉",
      youAndLikedEachOther: "أنت و {{name}} أعجبتما ببعضكما البعض!",
      startChatting: "بدء المحادثة",
      keepSwiping: "استمر في التمرير"
    },
    privacyPolicy: {
      title: "سياسة الخصوصية",
      lastUpdated: "آخر تحديث: 13 يوليو 2025"
    },
    termsOfService: {
      title: "شروط الخدمة",
      lastUpdated: "آخر تحديث: 13 يوليو 2025"
    },
    aboutUs: {
      title: "عن DripLove",
      subtitle: "ربط القلوب عبر القارات",
      ourStory: {
        heading: "قصتنا",
        description: "ولد DripLove من إيمان بسيط: لا ينبغي أن يكون الحب محدوداً بالحدود. لقد أنشأنا منصة تحتفي بالتنوع، وتعزز الاتصالات الحقيقية، وتساعد الناس في العثور على شريكهم المثالي، بغض النظر عن مكان وجودهم."
      },
      ourMission: {
        heading: "مهمتنا",
        description: "جعل العلاقات الهادفة ممكنة من خلال التكنولوجيا المتطورة والاهتمام الحقيقي بتجربة المستخدم. نحن ملتزمون بإنشاء مجتمع آمن وشامل ونابض بالحياة حيث يمكن للحب أن يزدهر عبر الثقافات والمسافات."
      },
      whatMakesUsDifferent: {
        heading: "ما يجعلنا مختلفين",
        globalReach: "وصول عالمي، تجربة محلية",
        globalReachDesc: "اتصل عبر دول ومدن متعددة مع احترام الثقافات والتفضيلات المحلية.",
        authenticProfiles: "ملفات شخصية أصلية",
        authenticProfilesDesc: "أنظمة التحقق المتقدمة تضمن اتصالات حقيقية وبيئة مواعدة آمنة.",
        smartMatching: "مطابقة ذكية",
        smartMatchingDesc: "تأخذ خوارزمياتنا المدعومة بالذكاء الاصطناعي في الاعتبار الاهتمامات والقيم والتوافق للعثور على مطابقتك المثالية.",
        culturalSensitivity: "الحساسية الثقافية",
        culturalSensitivityDesc: "نحن نفهم ونحترم معايير المواعدة المختلفة والتفضيلات الثقافية."
      },
      safetyFirst: {
        heading: "الأمان أولاً",
        description: "سلامتك هي أولويتنا القصوى. نحن نوظف تدابير أمنية رائدة في الصناعة، والتحقق من الصور، وفريق إشراف على مدار الساعة طوال أيام الأسبوع لضمان تجربة مواعدة إيجابية وآمنة."
      },
      joinOurCommunity: {
        heading: "انضم إلى مجتمعنا",
        description: "كن واحداً من الآلاف الذين وجدوا الحب والصداقة والاتصالات الهادفة. سواء كنت تبحث عن علاقة جادة أو مقابلة أصدقاء جدد، DripLove هو المكان الذي تبدأ فيه رحلتك."
      },
      contactUs: {
        heading: "اتصل بنا",
        description: "هل لديك أسئلة أو تعليقات؟ نحب أن نسمع منك."
      }
    }
  }
};

// Function to update translation files
function updateTranslations() {
  Object.entries(translations).forEach(([lang, newTranslations]) => {
    const filePath = path.join(__dirname, 'src', 'i18n', 'locales', `${lang}.json`);
    
    try {
      // Read existing translations
      const existingContent = fs.readFileSync(filePath, 'utf8');
      const existingTranslations = JSON.parse(existingContent);
      
      // Merge translations
      const mergedTranslations = deepMerge(existingTranslations, newTranslations);
      
      // Write back to file
      fs.writeFileSync(filePath, JSON.stringify(mergedTranslations, null, 2), 'utf8');
      
      console.log(`✅ Updated ${lang}.json`);
    } catch (error) {
      console.error(`❌ Error updating ${lang}.json:`, error.message);
    }
  });
  
  console.log('\n✨ All translation files updated successfully!');
}

// Run the update
updateTranslations();
