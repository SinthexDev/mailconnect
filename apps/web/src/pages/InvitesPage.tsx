import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api, errMsg, fmtDate, type Invite } from '../api';
import { useAuth } from '../auth';

export function InvitesPage() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [email, setEmail] = useState('');
  const [ttl, setTtl] = useState('72');
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const admin = user?.role === 'admin';

  const load = useCallback(() => {
    api<{ invites: Invite[] }>('invites').then((r) => setInvites(r.invites)).catch((e) => setErr(errMsg(e)));
  }, []);
  useEffect(() => { if (admin) load(); }, [admin, load]);

  if (!admin) return <Navigate to="/" replace />;

  async function create(e: FormEvent) {
    e.preventDefault(); setErr('');
    try {
      const r = await api<{ invite: { url: string } }>('invites', 'POST', { email: email.trim() || null, ttlHours: Number(ttl) });
      setUrl(r.invite.url); setEmail(''); load();
    } catch (x) { setErr(errMsg(x)); }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Einladungen</h1>
          <p className="muted">Neue Nutzer legen ihr Konto über einen einmaligen Link an.</p>
        </div>
      </header>
      <form className="card form inline" onSubmit={create}>
        <label className="grow">E-Mail (optional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Gültig (Stunden)<input type="number" min={1} max={720} value={ttl} onChange={(e) => setTtl(e.target.value)} /></label>
        <button type="submit" className="btn primary">Einladung erstellen</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {url && (
        <section className="card reveal" aria-live="polite">
          <h2>Einladungslink</h2>
          <p className="muted">Wird nur jetzt angezeigt. Gib ihn sicher weiter.</p>
          <pre className="code">{url}</pre>
          <div className="actions">
            <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(url)}>Link kopieren</button>
            <button type="button" className="btn ghost" onClick={() => setUrl(null)}>Ausblenden</button>
          </div>
        </section>
      )}
      {invites && invites.length === 0 ? (
        <div className="empty"><p>Es gibt noch keine Einladungen.</p></div>
      ) : (
        <ul className="rows">
          {(invites ?? []).map((i) => {
            const expired = !i.usedAt && new Date(i.expiresAt).getTime() < Date.now();
            return (
              <li key={i.id} className="row">
                <div className="row-main">
                  <div className="row-title">{i.email ?? 'Offene Einladung'}<span className="status-word">{i.usedAt ? 'Angenommen' : expired ? 'Abgelaufen' : 'Offen'}</span></div>
                  <div className="muted">Erstellt {fmtDate(i.createdAt)} · gültig bis {fmtDate(i.expiresAt)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
