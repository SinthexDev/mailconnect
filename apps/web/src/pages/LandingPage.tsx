import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { LanguageSwitcher, useI18n } from '../LanguageSwitcher';

const art = (file: string) => `${import.meta.env.BASE_URL}art/${file}`;
const repo = 'https://github.com/beeXperts-Niko/mailconnect';
const zip = 'https://github.com/beeXperts-Niko/mailconnect/archive/refs/heads/main.zip';

export function SiteFooter() {
  const { m } = useI18n();
  return (
    <footer className="site-foot">
      <nav aria-label={`${m.source} / ${m.imprint}`}>
        <a href={repo}>{m.source}</a>
        <a href={zip}>{m.download}</a>
        <Link to="/impressum">{m.imprint}</Link>
        <Link to="/datenschutz">{m.privacy}</Link>
        <Link to="/changelog">{m.changes}</Link>
      </nav>
      <p>{m.footerNote}</p>
    </footer>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  const { m } = useI18n();
  return (
    <header className="site-bar">
      <Link className="brand" to="/">MailConnect</Link>
      <div className="site-tools">
        <nav className="site-links" aria-label={m.navPages}>
          <Link to="/changelog">{m.changes}</Link>
          {user ? <Link to="/postfaecher">{m.mailboxes}</Link> : <Link to="/login">{m.login}</Link>}
        </nav>
        <LanguageSwitcher />
      </div>
    </header>
  );
}

export function LandingPage() {
  const { user } = useAuth();
  const { m } = useI18n();
  return (
    <div className="landing">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>{m.heroTitle}</h1>
            <p>{m.heroLead}</p>
            <div className="actions">
              {user ? <Link className="btn primary" to="/postfaecher">{m.toMailboxes}</Link> : <a className="btn primary" href={repo}>{m.sourceGithub}</a>}
              <a className="btn" href={user ? repo : zip}>{user ? m.sourceShort : m.downloadZip}</a>
            </div>
            <p className="muted small">{m.privateInstall}</p>
          </div>
          <img src={art('hero.jpg')} alt={m.altHero} />
        </section>

        <section className="scene">
          <img src={art('plug.jpg')} alt={m.altPlug} />
          <div>
            <h2>{m.plugTitle}</h2>
            <p>{m.plugBody}</p>
          </div>
        </section>

        <section className="scene scene-flip">
          <img src={art('index.jpg')} alt={m.altIndex} />
          <div>
            <h2>{m.indexTitle}</h2>
            <p>{m.indexBody}</p>
          </div>
        </section>

        <section className="scene">
          <img src={art('agent.jpg')} alt={m.altAgent} />
          <div>
            <h2>{m.agentTitle}</h2>
            <p>{m.agentBody}</p>
          </div>
        </section>

        <section className="keep">
          <h2>{m.takeTitle}</h2>
          <p>{m.takeBody1}</p>
          <p>{m.takeBody2}</p>
          <div className="actions">
            <a className="btn primary" href={repo}>{m.openRepo}</a>
            <a className="btn" href={zip}>{m.downloadZip}</a>
          </div>
        </section>

        <section className="keep">
          <h2>{m.fileTitle}</h2>
          <p>{m.fileP1}</p>
          <p>{m.fileP2}</p>
          <p>{m.fileP3}</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
