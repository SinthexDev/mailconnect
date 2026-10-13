import changelogDe from '../../../../_documentation/CHANGELOG.md?raw';
import changelogEn from '../../../../_documentation/CHANGELOG.en.md?raw';
import { parseChangelog, type ChangelogRelease } from '../changelog';
import { useI18n } from '../LanguageSwitcher';
import { SiteFooter, SiteHeader } from './LandingPage';

const releases: Record<'de' | 'en', ChangelogRelease[]> = {
  de: parseChangelog(changelogDe),
  en: parseChangelog(changelogEn),
};

export function ChangelogPage() {
  const { lang, m } = useI18n();
  return (
    <div className="landing">
      <SiteHeader />
      <main className="changelog">
        <h1>{m.changelogTitle}</h1>
        <p className="muted">{m.changelogLead}</p>
        {releases[lang].map((release) => (
          <article key={release.version} className="release">
            <p className="status-word">Version {release.version}</p>
            <h2>{release.title}</h2>
            <p className="muted small">{release.date}</p>
            <p>{release.intro}</p>
            {release.sections.map((section) => (
              <div key={section.heading}>
                <h3>{section.heading}</h3>
                <ul>
                  {section.items.map((item) => (
                    <li key={item.label}><strong>{item.label}:</strong> {item.text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </article>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
