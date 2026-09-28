// Ready-made question sets per business type, in every survey language.
// Chosen when creating a campaign; everything stays editable afterwards.

const LABELS = {
  liked: {
    he: 'מה אהבתם במיוחד?',
    en: 'What did you like most?',
    ar: 'ما الذي أعجبك أكثر؟',
    ru: 'Что понравилось больше всего?',
  },
  issues: {
    he: 'מה לא עבד טוב?',
    en: "What didn't go well?",
    ar: 'ما الذي لم يكن جيدًا؟',
    ru: 'Что пошло не так?',
  },
  nps: {
    he: 'מה הסיכוי שתמליצו עלינו לחבר?',
    en: 'How likely are you to recommend us to a friend?',
    ar: 'ما مدى احتمال أن توصي بنا لصديق؟',
    ru: 'Насколько вероятно, что вы порекомендуете нас другу?',
  },
};

export const TEMPLATES = {
  general: {
    label: 'כללי',
    icon: 'star',
    description: 'מתאים לכל עסק',
    liked: {
      he: ['שירות', 'איכות', 'מחיר', 'מהירות', 'אווירה'],
      en: ['Service', 'Quality', 'Price', 'Speed', 'Atmosphere'],
      ar: ['الخدمة', 'الجودة', 'السعر', 'السرعة', 'الأجواء'],
      ru: ['Сервис', 'Качество', 'Цена', 'Скорость', 'Атмосфера'],
    },
    issues: {
      he: ['שירות', 'איכות', 'מחיר', 'זמן המתנה', 'ניקיון'],
      en: ['Service', 'Quality', 'Price', 'Waiting time', 'Cleanliness'],
      ar: ['الخدمة', 'الجودة', 'السعر', 'وقت الانتظار', 'النظافة'],
      ru: ['Сервис', 'Качество', 'Цена', 'Время ожидания', 'Чистота'],
    },
  },
  restaurant: {
    label: 'מסעדה ובית קפה',
    icon: 'heart',
    description: 'אוכל, שירות והמתנה',
    liked: {
      he: ['האוכל', 'השירות', 'האווירה', 'מהירות ההגשה', 'התמורה למחיר'],
      en: ['The food', 'The service', 'The atmosphere', 'Quick serving', 'Value for money'],
      ar: ['الطعام', 'الخدمة', 'الأجواء', 'سرعة التقديم', 'القيمة مقابل السعر'],
      ru: ['Еда', 'Обслуживание', 'Атмосфера', 'Быстрая подача', 'Цена и качество'],
    },
    issues: {
      he: ['זמן המתנה', 'טעם האוכל', 'השירות', 'ניקיון', 'מחיר'],
      en: ['Waiting time', 'Taste of the food', 'The service', 'Cleanliness', 'Price'],
      ar: ['وقت الانتظار', 'طعم الطعام', 'الخدمة', 'النظافة', 'السعر'],
      ru: ['Время ожидания', 'Вкус еды', 'Обслуживание', 'Чистота', 'Цена'],
    },
  },
  beauty: {
    label: 'מספרה ויופי',
    icon: 'spark',
    description: 'תוצאה, יחס וזמנים',
    liked: {
      he: ['התוצאה', 'היחס האישי', 'מקצועיות', 'עמידה בזמנים', 'ניקיון המקום'],
      en: ['The result', 'Personal attention', 'Professionalism', 'Punctuality', 'Clean salon'],
      ar: ['النتيجة', 'المعاملة الشخصية', 'المهنية', 'الالتزام بالمواعيد', 'نظافة المكان'],
      ru: ['Результат', 'Личное внимание', 'Профессионализм', 'Пунктуальность', 'Чистота'],
    },
    issues: {
      he: ['התוצאה', 'זמן המתנה', 'מחיר', 'יחס', 'ניקיון'],
      en: ['The result', 'Waiting time', 'Price', 'Attitude', 'Cleanliness'],
      ar: ['النتيجة', 'وقت الانتظار', 'السعر', 'المعاملة', 'النظافة'],
      ru: ['Результат', 'Время ожидания', 'Цена', 'Отношение', 'Чистота'],
    },
  },
  clinic: {
    label: 'מרפאה וקליניקה',
    icon: 'shield',
    description: 'יחס, זמינות והסבר',
    liked: {
      he: ['יחס הצוות', 'מקצועיות', 'הסבר ברור', 'זמינות תורים', 'זמן המתנה קצר'],
      en: ['Staff attitude', 'Professionalism', 'Clear explanation', 'Appointment availability', 'Short wait'],
      ar: ['معاملة الطاقم', 'المهنية', 'شرح واضح', 'توفّر المواعيد', 'انتظار قصير'],
      ru: ['Отношение персонала', 'Профессионализм', 'Понятные объяснения', 'Доступность записи', 'Короткое ожидание'],
    },
    issues: {
      he: ['זמן המתנה', 'זמינות תורים', 'יחס', 'הסבר לא ברור', 'מחיר'],
      en: ['Waiting time', 'Appointment availability', 'Attitude', 'Unclear explanation', 'Price'],
      ar: ['وقت الانتظار', 'توفّر المواعيد', 'المعاملة', 'شرح غير واضح', 'السعر'],
      ru: ['Время ожидания', 'Доступность записи', 'Отношение', 'Непонятные объяснения', 'Цена'],
    },
  },
  retail: {
    label: 'חנות',
    icon: 'inbox',
    description: 'מבחר, מחיר ושירות',
    liked: {
      he: ['מבחר', 'מחיר', 'שירות', 'זמינות במלאי', 'סדר ונוחות'],
      en: ['Selection', 'Price', 'Service', 'Stock availability', 'Tidy and easy to shop'],
      ar: ['التشكيلة', 'السعر', 'الخدمة', 'توفّر البضاعة', 'الترتيب وسهولة التسوق'],
      ru: ['Ассортимент', 'Цена', 'Обслуживание', 'Наличие товара', 'Порядок и удобство'],
    },
    issues: {
      he: ['מבחר', 'מחיר', 'שירות', 'תור בקופה', 'חוסר במלאי'],
      en: ['Selection', 'Price', 'Service', 'Checkout line', 'Out of stock'],
      ar: ['التشكيلة', 'السعر', 'الخدمة', 'طابور الصندوق', 'نفاد البضاعة'],
      ru: ['Ассортимент', 'Цена', 'Обслуживание', 'Очередь на кассе', 'Нет в наличии'],
    },
  },
  services: {
    label: 'בעל מקצוע ושירות',
    icon: 'gear',
    description: 'אינסטלטור, חשמלאי, הובלות ועוד',
    liked: {
      he: ['מקצועיות', 'עמידה בזמנים', 'מחיר הוגן', 'ניקיון אחרי העבודה', 'תקשורת טובה'],
      en: ['Professionalism', 'On time', 'Fair price', 'Clean after the job', 'Good communication'],
      ar: ['المهنية', 'الالتزام بالوقت', 'سعر عادل', 'النظافة بعد العمل', 'تواصل جيد'],
      ru: ['Профессионализм', 'Вовремя', 'Честная цена', 'Чистота после работы', 'Хорошая связь'],
    },
    issues: {
      he: ['איחור', 'מחיר', 'איכות העבודה', 'תקשורת', 'ניקיון'],
      en: ['Delay', 'Price', 'Quality of work', 'Communication', 'Cleanliness'],
      ar: ['التأخير', 'السعر', 'جودة العمل', 'التواصل', 'النظافة'],
      ru: ['Опоздание', 'Цена', 'Качество работы', 'Связь', 'Чистота'],
    },
  },
  hospitality: {
    label: 'מלון וצימר',
    icon: 'home',
    description: 'ניקיון, צוות ונוחות',
    liked: {
      he: ['הניקיון', 'המיקום', 'הצוות', 'הנוחות', 'ארוחת הבוקר'],
      en: ['Cleanliness', 'Location', 'Staff', 'Comfort', 'Breakfast'],
      ar: ['النظافة', 'الموقع', 'الطاقم', 'الراحة', 'الفطور'],
      ru: ['Чистота', 'Расположение', 'Персонал', 'Комфорт', 'Завтрак'],
    },
    issues: {
      he: ['ניקיון', 'רעש', 'צ׳ק־אין', 'מחיר', 'תחזוקה'],
      en: ['Cleanliness', 'Noise', 'Check-in', 'Price', 'Maintenance'],
      ar: ['النظافة', 'الضجيج', 'تسجيل الدخول', 'السعر', 'الصيانة'],
      ru: ['Чистота', 'Шум', 'Заселение', 'Цена', 'Техническое состояние'],
    },
  },
};

/** The three default questions of a template, in a survey language. */
export function templateQuestions(key = 'general', lang = 'he') {
  const t = TEMPLATES[key] || TEMPLATES.general;
  const l = LABELS.liked[lang] ? lang : 'he';
  return [
    { id: 'liked', type: 'multi', label: LABELS.liked[l], options: t.liked[l], audience: 'positive', required: false },
    { id: 'issues', type: 'multi', label: LABELS.issues[l], options: t.issues[l], audience: 'negative', required: false },
    { id: 'nps', type: 'nps', label: LABELS.nps[l], options: [], audience: 'all', required: false },
  ];
}
