import { useSyncExternalStore } from 'react';
import { getLang, messages, setLang, subscribeLang, type Lang } from './i18n';

const flags: Record<Lang, string> = {
  de: `${import.meta.env.BASE_URL}flags/de.svg`,
  en: `${import.meta.env.BASE_URL}flags/us.svg`,
};

export function useI18n() {
  const lang = useSyncExternalStore(subscribeLang, getLang, () => 'de' as Lang);
  return { lang, setLang, m: messages() };
}

export function LanguageSwitcher() {
  const { lang, m } = useI18n();
  return (
    <div className="lang" role="group" aria-label={m.langLabel}>
      {(['de', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          className={`lang__btn${lang === code ? ' is-active' : ''}`}
          lang={code}
          aria-current={lang === code ? 'true' : undefined}
          onClick={() => setLang(code)}
        >
          <img src={flags[code]} alt="" className="lang__flag" width="20" height="14" />
          <span>{code.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}
