import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { messages } from '@/i18n';

const initialLanguage = navigator.language.startsWith('zh') ? 'zh' : 'en';

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    resources: {
      en: { translation: messages.en },
      zh: { translation: messages.zh },
    },
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
      prefix: '{',
      suffix: '}',
    },
  });
}

export default i18next;
