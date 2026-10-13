import type { ReactNode } from 'react';
import { useI18n } from '../LanguageSwitcher';
import { SiteFooter, SiteHeader } from './LandingPage';

function linked(text: string, label: string, href: string): ReactNode {
  const parts = text.split(label);
  if (parts.length < 2) return text;
  return <>{parts[0]}<a href={href}>{label}</a>{parts.slice(1).join(label)}</>;
}

function coded(text: string, label: string): ReactNode {
  const parts = text.split(label);
  if (parts.length < 2) return text;
  return <>{parts[0]}<code>{label}</code>{parts.slice(1).join(label)}</>;
}

function LegalFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="landing">
      <SiteHeader />
      <main className="changelog legal">
        <h1>{title}</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function ImpressumPage() {
  const { m } = useI18n();
  return (
    <LegalFrame title={m.imprintTitle}>
      <h2>{m.imprintProvider}</h2>
      <p>
        Sinthex Holding UG (haftungsbeschränkt)<br />
        Limbacher Str. 15<br />
        57635 Kircheib<br />
        {m.imprintCountry}
      </p>
      <p>{m.imprintDirector}</p>
      <p>
        E-Mail: <a href="mailto:hi@sinthex.de">hi@sinthex.de</a><br />
        USt-IdNr.: DE322077566
      </p>
      <h2>{m.imprintInstallTitle}</h2>
      <p>{m.imprintInstall}</p>
      <h2>{m.imprintDispute}</h2>
      <p>{linked(m.imprintDisputeBody, 'https://ec.europa.eu/consumers/odr/', 'https://ec.europa.eu/consumers/odr/')}</p>
    </LegalFrame>
  );
}

export function PrivacyPage() {
  const { m } = useI18n();
  return (
    <LegalFrame title={m.privacyTitle}>
      <h2>{m.privacyWho}</h2>
      <p>
        Sinthex Holding UG (haftungsbeschränkt)<br />
        Limbacher Str. 15<br />
        57635 Kircheib<br />
        E-Mail: <a href="mailto:hi@sinthex.de">hi@sinthex.de</a>
      </p>
      <h2>{m.privacyAboutTitle}</h2>
      <p>{m.privacyAbout}</p>
      <h2>{m.privacyVisitTitle}</h2>
      <p>{m.privacyVisit}</p>
      <h2>{m.privacyAccountTitle}</h2>
      <p>{coded(m.privacyAccount, 'mc_session')}</p>
      <p>{m.privacyKeep}</p>
      <h2>{m.privacyRightsTitle}</h2>
      <p>{linked(m.privacyRights, 'hi@sinthex.de', 'mailto:hi@sinthex.de')}</p>
    </LegalFrame>
  );
}
