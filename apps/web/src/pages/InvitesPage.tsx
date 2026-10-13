import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api, errMsg, fmtDate, type Invite } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../LanguageSwitcher';

const art = (file: string) => `${import.meta.env.BASE_URL}art/${file}`;

export function InvitesPage() {
  const { user } = useAuth();
  const { m } = useI18n();
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
          <h1>{m.invitesTitle}</h1>
          <p className="muted">{m.invitesLead}</p>
        </div>
      </header>
      <section className="explain" aria-label={m.invitesLead}>
        <article>
          <img src={art('invite-account.png')} alt="" />
          <h2>{m.inviteOwnTitle}</h2>
          <p>{m.inviteOwnBody}</p>
        </article>
        <article>
          <img src={art('invite-separate.png')} alt="" />
          <h2>{m.inviteApartTitle}</h2>
          <p>{m.inviteApartBody}</p>
        </article>
        <article>
          <img src={art('invite-own.png')} alt="" />
          <h2>{m.invitePlugTitle}</h2>
          <p>{m.invitePlugBody}</p>
        </article>
      </section>
      <form className="card form inline" onSubmit={create}>
        <label className="grow">{m.emailOptional}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>{m.validHours}<input type="number" min={1} max={720} value={ttl} onChange={(e) => setTtl(e.target.value)} /></label>
        <button type="submit" className="btn primary">{m.createInvite}</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {url && (
        <section className="card reveal" aria-live="polite">
          <h2>{m.inviteLink}</h2>
          <p className="muted">{m.inviteOnce}</p>
          <pre className="code">{url}</pre>
          <div className="actions">
            <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(url)}>{m.copyLink}</button>
            <button type="button" className="btn ghost" onClick={() => setUrl(null)}>{m.hide}</button>
          </div>
        </section>
      )}
      {invites && invites.length === 0 ? (
        <div className="empty"><p>{m.noInvites}</p></div>
      ) : (
        <ul className="rows">
          {(invites ?? []).map((i) => {
            const expired = !i.usedAt && new Date(i.expiresAt).getTime() < Date.now();
            return (
              <li key={i.id} className="row">
                <div className="row-main">
                  <div className="row-title">{i.email ?? m.openInvite}<span className="status-word">{i.usedAt ? m.accepted : expired ? m.expired : m.open}</span></div>
                  <div className="muted">{m.inviteMeta(fmtDate(i.createdAt), fmtDate(i.expiresAt))}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
