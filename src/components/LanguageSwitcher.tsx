import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const availableLanguages = ['en', 'de'];
  if (!availableLanguages.includes(i18n.language))
  {
    i18n.changeLanguage('en');
  }
  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="language-switcher">
      <button
        onClick={() => changeLanguage('en')}
        className={`language-btn ${i18n.language === 'en' ? 'active' : ''}`}
      >
        EN
      </button>
      <button
        onClick={() => changeLanguage('de')}
        className={`language-btn ${i18n.language === 'de' ? 'active' : ''}`}
      >
        DE
      </button>
    </div>
  );
}